import type { Job } from "bullmq";
import { queueManager, QueueNames, getRealtimeQueue } from "../lib/queue.js";
import { publishEvent } from "@workspace/core/lib/event-bus";
import type { DataReadyEvent } from "@workspace/core/types/event";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { JobScheduler } from "../scheduler/JobScheduler.js";
import {
  completeIngestJob,
  failIngestJob,
} from "../lib/ingest-state.js";
import { PipelineTracker } from "../lib/tracker.js";
import { getSupabase } from "../supabase.js";
import { resolveCredentials } from "@workspace/core/lib/credentials";
import { INTEGRATIONS } from "@workspace/core/config/integrations";
import type { IngestJobData, OrchestrationJobData } from "../types.js";
import type { AdapterContract } from "@workspace/core/types/contracts/adapter";
import type { IngestorDefinition } from "../interfaces.js";
import type { IngestType } from "@workspace/core/types/ingest";
import type { JobContext } from "@workspace/core/types/job";
import type { IntegrationId } from "@workspace/core/types/integrations";

export class SyncWorker {
  private started = false;

  constructor(
    private integrationId: string,
    private entityType: IngestType,
    private adapter: AdapterContract,
    private def: IngestorDefinition,
  ) {}

  start(): void {
    if (this.started) return;

    const queueName = QueueNames.ingest(this.integrationId, this.entityType);

    queueManager.createWorker<IngestJobData>(
      queueName,
      this.handleJob.bind(this),
      { concurrency: 3 },
    );

    this.started = true;
    Logger.info({
      module: "SyncWorker",
      context: "start",
      message: `Worker started for ${this.integrationId}:${this.entityType}`,
    });
  }

  private async handleJob(job: Job<IngestJobData>): Promise<void> {
    const { tenantId, ingestType, jobId, linkId, siteId, integrationId } = job.data;
    const supabase = getSupabase();
    const tracker = new PipelineTracker();

    Logger.info({
      module: "SyncWorker",
      context: "handleJob",
      message: `[${jobId}] Starting ingest for ${integrationId}:${ingestType}`,
    });

    await supabase
      .from("ingest_jobs")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .eq("id", jobId);

    try {
      // 1. Load integration config
      const { data: integrationRow } = await tracker.trackSpan("load_config", () =>
        supabase
          .from("integrations")
          .select("config")
          .eq("id", integrationId)
          .eq("tenant_id", tenantId)
          .single()
      );

      const config = ((integrationRow?.config as Record<string, string>) ?? {});

      // 2. Resolve credentials (decrypt sensitive fields)
      const credentials = await tracker.trackSpan("resolve_credentials", () =>
        resolveCredentials(integrationId as IntegrationId, config)
      );

      // 3. Load link record if linkId is present
      let linkMeta: Record<string, unknown> = {};
      let linkExternalId: string | undefined;
      const scopeLevel: "tenant" | "link" = linkId ? "link" : "tenant";

      if (linkId) {
        const { data: link } = await tracker.trackSpan("load_link", () =>
          supabase
            .from("integration_links")
            .select("id, external_id, meta")
            .eq("id", linkId)
            .single()
        );

        if (link) {
          linkMeta = (link.meta as Record<string, unknown>) ?? {};
          linkExternalId = link.external_id ?? undefined;
        }
      }

      // 4. Build JobContext
      const ctx: JobContext = {
        tenantId,
        linkId: linkId ?? undefined,
        siteId: siteId ?? undefined,
        scopeLevel,
        jobId,
        ingestType,
        integrationId,
        trigger: "scheduled" as any,
        credentials,
        metadata: { externalId: linkExternalId, ...linkMeta },
      };

      // 5. Fetch via adapter — returns UpsertPayload[]
      const payloads = await tracker.trackSpan("adapter_fetch", () => this.adapter.fetch(ctx));
      tracker.trackApiCall();

      Logger.info({
        module: "SyncWorker",
        context: "handleJob",
        message: `[${jobId}] Adapter returned ${payloads.reduce((acc, p) => acc + p.rows.length, 0)} rows across ${payloads.length} payload(s)`,
      });

      // 6. Generic DB upsert
      const typeConfig = INTEGRATIONS[integrationId as keyof typeof INTEGRATIONS]
        ?.supportedTypes.find((t) => t.type === ingestType);
      const dbSchema = typeConfig?.db?.schema ?? "vendors";

      await tracker.trackSpan("db_upsert", async () => {
        for (const payload of payloads) {
          if (payload.rows.length === 0) continue;

          for (let i = 0; i < payload.rows.length; i += 200) {
            const chunk = payload.rows.slice(i, i + 200);
            const { error } = await (
              (supabase.schema as any)(dbSchema).from(payload.table) as any
            ).upsert(chunk, { onConflict: payload.onConflict });

            if (error) {
              throw new Error(`Upsert ${payload.table} failed: ${error.message}`);
            }

            tracker.trackUpsert();
          }
        }
      });

      // 7. Stale pruning (only for types with a DB route)
      if (typeConfig?.db) {
        const { schema, table } = typeConfig.db;
        const allExternalIds = payloads
          .flatMap((p) => p.rows.map((r) => r.external_id as string))
          .filter(Boolean);
        await tracker.trackSpan("prune_stale", () =>
          this.pruneStale(schema, table, tenantId, linkId, allExternalIds)
        );
      }

      // 8. Fan-out (optional — e.g. sophos sites → endpoints jobs)
      if (this.def.fanOut) {
        await tracker.trackSpan("fan_out", () => this.def.fanOut!(payloads, job.data));
      }

      // 9. Write sync state
      await completeIngestJob(jobId, { metrics: tracker.toJSON() });

      // 9b. Notify downstream consumers (compliance, workflows)
      await publishEvent(getRealtimeQueue(), {
        event: "data_ready",
        tenantId,
        linkId: linkId ?? undefined,
        siteId: siteId ?? undefined,
        ingestType,
        completedAt: new Date().toISOString(),
      } satisfies DataReadyEvent);

      // 10. Fire orchestration event — OrchestrationWorker decides what runs next
      await queueManager.addJob(
        "ingest.orchestrate",
        { tenantId, linkId: linkId ?? null, integrationId, ingestType } satisfies OrchestrationJobData,
        { priority: 60 },
      );

      // 11. Schedule next ingest
      await JobScheduler.scheduleNextIngest(
        tenantId,
        siteId,
        linkId,
        integrationId,
        ingestType,
        50,
      );

      Logger.info({
        module: "SyncWorker",
        context: "handleJob",
        message: `[${jobId}] Ingest completed for ${integrationId}:${ingestType}`,
      });
    } catch (error) {
      tracker.trackError(error as Error);
      try {
        await failIngestJob(jobId, {
          error: (error as Error).message,
          metrics: tracker.toJSON(),
        });
      } catch (updateError) {
        Logger.error({
          module: "SyncWorker",
          context: "handleJob",
          message: `Failed to update ingest_job: ${updateError}`,
        });
      }

      Logger.error({
        module: "SyncWorker",
        context: "handleJob",
        message: `[${jobId}] Ingest failed for ${integrationId}:${ingestType}: ${(error as Error).message}`,
      });

      throw error;
    }
  }

  private async pruneStale(
    schema: string,
    table: string,
    tenantId: string,
    linkId: string | null,
    upsertedExternalIds: string[],
  ): Promise<void> {
    const supabase = getSupabase();
    const survivingIds = new Set(upsertedExternalIds);
    const staleIds: string[] = [];
    const PAGE_SIZE = 1000;
    let offset = 0;

    while (true) {
      let query = ((supabase.schema as any)(schema).from(table) as any)
        .select("id, external_id")
        .eq("tenant_id", tenantId)
        .range(offset, offset + PAGE_SIZE - 1);

      if (linkId !== null) {
        query = query.eq("link_id", linkId);
      }

      const { data, error } = await query;
      if (error) throw new Error(`Prune fetch ${table} failed: ${error.message}`);
      if (!data || data.length === 0) break;

      for (const row of data) {
        if (!survivingIds.has(row.external_id)) {
          staleIds.push(row.id);
        }
      }

      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    if (staleIds.length === 0) return;

    for (let i = 0; i < staleIds.length; i += 500) {
      const chunk = staleIds.slice(i, i + 500);
      const { error } = await ((supabase.schema as any)(schema).from(table) as any)
        .delete()
        .in("id", chunk);
      if (error) throw new Error(`Delete stale ${table} failed: ${error.message}`);
    }

    Logger.info({
      module: "SyncWorker",
      context: "pruneStale",
      message: `Deleted ${staleIds.length} stale rows from ${schema}.${table}`,
    });
  }
}
