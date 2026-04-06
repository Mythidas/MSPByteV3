import { getSupabase } from "../supabase.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { registry } from "../registry.js";
import { JobScheduler } from "./JobScheduler.js";
import { INTEGRATIONS } from "@workspace/shared/config/integrations/integrations.js";
import { IntegrationId } from "@workspace/shared/types/integrations.js";
import { IngestType } from "@workspace/shared/types/jobs/ingest.js";
import { parseSafeErrorMessage } from "@workspace/shared/lib/utils/validators.js";

const RECONCILE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export class JobReconciler {
  private timer: ReturnType<typeof setInterval> | null = null;

  async start(): Promise<void> {
    await this.reconcile();
    this.timer = setInterval(
      () => void this.reconcile(),
      RECONCILE_INTERVAL_MS,
    );
    Logger.info({
      module: "JobReconciler",
      context: "start",
      message: `Reconciler started (every ${RECONCILE_INTERVAL_MS / 60000}m)`,
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async reconcile(): Promise<void> {
    try {
      const supabase = getSupabase();
      const definitions = registry.getAll();

      for (const def of definitions) {
        const config = INTEGRATIONS[def.integrationId];
        // Exclude fan-out-owned types (e.g. SophosEndpoints requires prior sites DB data)
        const types = config.supportedTypes.filter(
          (t) => !t.linkerDependencies || t.linkerDependencies.length === 0,
        );
        if (types.length === 0) continue;
        if (def.integrationId !== "sophos-partner") continue;

        const { data: links, error } = await supabase
          .from("integration_links")
          .select("id, tenant_id, site_id")
          .eq("integration_id", def.integrationId)
          .eq("status", "active");

        if (error) {
          Logger.error({
            module: "JobReconciler",
            context: "reconcile",
            message: `Error fetching links for ${def.integrationId}: ${error.message}`,
          });
          continue;
        }

        for (const typeConfig of types) {
          if (typeConfig.type !== IngestType.SophosLicenses) continue;

          if (typeConfig.scopeLevel === "tenant") {
            const tenantIds = [
              ...new Set((links ?? []).map((l) => l.tenant_id)),
            ];
            for (const tenantId of tenantIds) {
              await this.ensureJobEnqueued(
                tenantId,
                null,
                null,
                def.integrationId,
                typeConfig.type,
                typeConfig.freshnessMinutes ?? 120,
              );
            }
          } else {
            for (const link of links ?? []) {
              await this.ensureJobEnqueued(
                link.tenant_id,
                link.id,
                link.site_id,
                def.integrationId,
                typeConfig.type,
                typeConfig.freshnessMinutes ?? 120,
              );
            }
          }
        }
      }

      Logger.trace({
        module: "JobReconciler",
        context: "reconcile",
        message: "Reconcile pass complete",
      });
    } catch (err) {
      Logger.error({
        module: "JobReconciler",
        context: "reconcile",
        message: `Reconcile error: ${parseSafeErrorMessage(err)}`,
      });
    }
  }

  private async ensureJobEnqueued(
    tenantId: string,
    linkId: string | null,
    siteId: string | null,
    integrationId: IntegrationId,
    ingestType: IngestType,
    freshnessMinutes: number,
  ): Promise<void> {
    const supabase = getSupabase();
    const freshnessMs = freshnessMinutes * 60 * 1000;

    let q = supabase
      .from("ingest_sync_states")
      .select("last_synced_at")
      .eq("tenant_id", tenantId)
      .eq("integration_id", integrationId)
      .eq("ingest_type", ingestType);

    q = linkId !== null ? q.eq("link_id", linkId) : q.is("link_id", null);

    const { data, error } = await q.maybeSingle();

    if (error) {
      Logger.error({
        module: "JobReconciler",
        context: "ensureJobEnqueued",
        message: `Error checking sync state for ${linkId ?? "tenant"}:${ingestType}: ${error.message}`,
      });
      return;
    }

    if (!data) {
      // Never synced — enqueue immediately
      await JobScheduler.enqueueNow(
        tenantId,
        siteId,
        linkId,
        integrationId,
        ingestType,
      );
      Logger.info({
        module: "JobReconciler",
        context: "ensureJobEnqueued",
        message: `Enqueued immediate job: ${ingestType} for ${linkId ? `link ${linkId}` : `tenant ${tenantId}`} (${integrationId}) — never synced`,
      });
      return;
    }

    const age = Date.now() - new Date(data.last_synced_at).getTime();

    if (age >= freshnessMs) {
      await JobScheduler.enqueueNow(
        tenantId,
        siteId,
        linkId,
        integrationId,
        ingestType,
      );
      Logger.info({
        module: "JobReconciler",
        context: "ensureJobEnqueued",
        message: `Enqueued immediate job: ${ingestType} for ${linkId ? `link ${linkId}` : `tenant ${tenantId}`} (${integrationId}) — data stale`,
      });
    } else {
      const remainingMs = freshnessMs - age;
      await JobScheduler.scheduleWithDelay(
        tenantId,
        siteId,
        linkId,
        integrationId,
        ingestType,
        remainingMs,
      );
    }
  }
}
