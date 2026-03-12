import { getSupabase } from "../supabase.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { registry } from "../registry.js";
import { INTEGRATIONS } from "@workspace/shared/config/integrations.js";

const RECONCILE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export class JobReconciler {
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.reconcile();
    this.timer = setInterval(() => this.reconcile(), RECONCILE_INTERVAL_MS);
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

        // Only reconcile types that aren't fan-out (those are created by the linker)
        const types = config.supportedTypes
          .filter((t) => !t.fanOut)
          .map((t) => t.type);

        const query = supabase
          .from("integration_links")
          .select("id, tenant_id, site_id")
          .eq("integration_id", def.integrationId)
          .eq("status", "active");

        if (config.scope === "link") query.is("site_id", null);
        else query.not("site_id", "is", null);

        const { data: links, error } = await query;

        if (error) {
          Logger.error({
            module: "JobReconciler",
            context: "reconcile",
            message: `Error fetching links for ${def.integrationId}: ${error.message}`,
          });
          continue;
        }

        for (const link of links ?? []) {
          if (config.id !== "microsoft-365") continue;
          for (const ingestType of types) {
            await this.ensureJobExists(
              link.tenant_id,
              link.id,
              link.site_id,
              def.integrationId,
              ingestType,
              config.supportedTypes.find((t) => t.type === ingestType)
                ?.priority ?? 50,
            );
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
        message: `Reconcile error: ${err}`,
      });
    }
  }

  private async ensureJobExists(
    tenantId: string,
    linkId: string,
    siteId: string | null,
    integrationId: string,
    ingestType: string,
    priority: number,
  ): Promise<void> {
    const supabase = getSupabase();

    const { count, error } = await (supabase.from("ingest_jobs" as any) as any)
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("link_id", linkId)
      .eq("ingest_type", ingestType)
      .in("status", ["pending", "queued", "running"]);

    if (error) {
      Logger.error({
        module: "JobReconciler",
        context: "ensureJobExists",
        message: `Error checking job for ${linkId}:${ingestType}: ${error.message}`,
      });
      return;
    }

    if (count && count > 0) return;

    const { error: insertError } = await (
      supabase.from("ingest_jobs" as any) as any
    ).insert({
      tenant_id: tenantId,
      site_id: siteId,
      link_id: linkId,
      integration_id: integrationId,
      ingest_type: ingestType,
      status: "pending",
      priority,
      trigger: "scheduled",
      scheduled_for: null,
    });

    if (insertError) {
      Logger.error({
        module: "JobReconciler",
        context: "ensureJobExists",
        message: `Error inserting job for ${linkId}:${ingestType}: ${insertError.message}`,
      });
      return;
    }

    Logger.info({
      module: "JobReconciler",
      context: "ensureJobExists",
      message: `Created missing job: ${ingestType} for link ${linkId} (${integrationId})`,
    });
  }
}
