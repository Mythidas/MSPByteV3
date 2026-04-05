import { type Job } from "bullmq";
import { queueManager, QueueNames, getRealtimeQueue } from "../lib/queue.js";
import { INTEGRATIONS } from "@workspace/shared/config/integrations/integrations.js";
import { resolveCredentials } from "@workspace/shared/lib/credentials.js";
import { publishEvent } from "@workspace/shared/lib/event-bus.js";
import { Logger } from "@workspace/shared/lib/utils/logger.js";
import { AdapterContract } from "@workspace/shared/types/jobs/contracts/adapter.js";
import { DataReadyEvent } from "@workspace/shared/types/jobs/event.js";
import {
  IngestTrigger,
  IngestType,
} from "@workspace/shared/types/jobs/ingest.js";
import { JobContext } from "@workspace/shared/types/jobs/job.js";
import { IngestorDefinition } from "../interfaces.js";
import {
  startIngestJob,
  completeIngestJob,
  failIngestJob,
} from "../lib/ingest-state.js";
import { PipelineTracker } from "../lib/tracker.js";
import { getSupabase } from "../supabase.js";
import { IngestJobData, OrchestrationJobData } from "../types.js";
import { JobScheduler } from "../scheduler/JobScheduler.js";
import {
  isRecord,
  parseSafeErrorMessage,
} from "@workspace/shared/lib/utils/validators.js";
import { SupabaseHelper } from "@workspace/shared/lib/utils/supabase-helper.js";

export class SyncWorker {
  private started = false;

  constructor(
    private integrationId: string,
    private entityType: IngestType,
    private adapter: AdapterContract,
    private def: IngestorDefinition,
    private concurrency: number = 3,
  ) {}

  start(): void {
    if (this.started) return;

    const queueName = QueueNames.ingest(this.integrationId, this.entityType);

    queueManager.createWorker<IngestJobData>(
      queueName,
      this.handleJob.bind(this),
      { concurrency: this.concurrency },
    );

    this.started = true;
    Logger.info({
      module: "SyncWorker",
      context: "start",
      message: `Worker started for ${this.integrationId}:${this.entityType}`,
    });
  }

  private async handleJob(job: Job<IngestJobData>): Promise<void> {
    const { tenantId, ingestType, linkId, siteId, integrationId } = job.data;
    const supabase = getSupabase();
    const tracker = new PipelineTracker();

    const dbJob = await startIngestJob({
      tenant_id: tenantId,
      link_id: linkId,
      site_id: siteId,
      integration_id: integrationId,
      ingest_type: ingestType,
      bullmq_job_id: job.id ?? null,
    });
    const jobId = dbJob.id;

    Logger.info({
      module: "SyncWorker",
      context: "handleJob",
      message: `[${jobId}] Starting ingest for ${integrationId}:${ingestType}`,
    });

    try {
      // 1. Load integration config
      const { data: integrationRow } = await tracker.trackSpan(
        "load_config",
        async () =>
          supabase
            .from("integrations")
            .select("config")
            .eq("id", integrationId)
            .eq("tenant_id", tenantId)
            .single(),
      );

      const config = isRecord(integrationRow?.config)
        ? (integrationRow.config as Record<string, unknown>)
        : {};

      // 2. Resolve credentials (decrypt sensitive fields)
      const credentials = await tracker.trackSpan<Record<string, string>>(
        "resolve_credentials",
        () => resolveCredentials(integrationId, config),
      );

      // 3. Load link record if linkId is present
      let linkMeta: Record<string, unknown> = {};
      let linkExternalId: string | undefined;
      const scopeLevel: "tenant" | "link" = linkId ? "link" : "tenant";

      if (linkId) {
        const { data: link } = await tracker.trackSpan("load_link", async () =>
          supabase
            .from("integration_links")
            .select("id, external_id, meta")
            .eq("id", linkId)
            .single(),
        );

        if (link) {
          linkMeta = isRecord(link.meta)
            ? (link.meta as Record<string, unknown>)
            : {};
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
        trigger: IngestTrigger.Scheduled,
        credentials,
        metadata: { externalId: linkExternalId, ...linkMeta },
        trackSpan: (name, fn) => tracker.trackSpan(name, fn),
      };

      // 5. Fetch via adapter — returns UpsertPayload[]
      const payloads = await tracker.trackSpan("adapter_fetch", () =>
        this.adapter.fetch(ctx),
      );
      tracker.trackApiCall();

      Logger.info({
        module: "SyncWorker",
        context: "handleJob",
        message: `[${jobId}] Adapter returned ${payloads.reduce((acc, p) => acc + p.rows.length, 0)} rows across ${payloads.length} payload(s)`,
      });

      // 6. Generic DB upsert
      const typeConfig = INTEGRATIONS[integrationId]?.supportedTypes.find(
        (t) => t.type === ingestType,
      );
      await tracker.trackSpan("db_upsert", async () => {
        for (const payload of payloads) {
          if (payload.rows.length === 0 || !typeConfig?.db?.schema) continue;
          await new SupabaseHelper(supabase).batchUpsert(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
            typeConfig?.db?.schema as any,
            payload.table,
            payload.rows,
            200,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-argument
            payload.onConflict as any,
          );

          tracker.trackUpsert();
        }
      });

      // 7. Stale pruning (only for types with a DB route)
      if (typeConfig?.db) {
        const { table } = typeConfig.db;
        const allExternalIds = payloads
          .flatMap((p) => p.rows.map((r) => String(r.external_id)))
          .filter(Boolean);
        await tracker.trackSpan("prune_stale", () =>
          this.pruneStale(
            "vendors",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-argument
            table as any,
            tenantId,
            linkId,
            allExternalIds,
          ),
        );
      }

      // TODO: Evaluate if Fan-Out is still needed
      // 8. Fan-out (optional — e.g. sophos sites → endpoints jobs)
      if (this.def.fanOut) {
        // await tracker.trackSpan("fan_out", () =>
        //   this.def.fanOut!(payloads, job.data),
        // );
      }

      // 9. Write sync state
      const json = tracker.toJSON();
      await completeIngestJob(jobId, { metrics: isRecord(json) ? json : {} });

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
        {
          tenantId,
          linkId: linkId ?? null,
          integrationId,
          ingestType,
        } satisfies OrchestrationJobData,
        { priority: 60 },
      );

      // 11. Schedule next ingest
      await JobScheduler.scheduleNextIngest(
        tenantId,
        siteId,
        linkId,
        integrationId,
        ingestType,
      );

      Logger.info({
        module: "SyncWorker",
        context: "handleJob",
        message: `[${jobId}] Ingest completed for ${integrationId}:${ingestType}`,
      });
    } catch (error) {
      if (error instanceof Error) {
        tracker.trackError(error);
      }
      try {
        const json = tracker.toJSON();
        const failedSpan = json.spans.find((s) => s.status === "error")?.name;
        await failIngestJob(jobId, {
          error,
          metrics: isRecord(json) ? json : {},
          failedSpan,
        });
      } catch (updateError) {
        Logger.error({
          module: "SyncWorker",
          context: "handleJob",
          message: `Failed to update ingest_job: ${parseSafeErrorMessage(updateError)}`,
        });
      }

      Logger.error({
        module: "SyncWorker",
        context: "handleJob",
        message: `[${jobId}] Ingest failed for ${integrationId}:${ingestType}: ${parseSafeErrorMessage(error)}`,
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
      let query = supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
        .schema(schema as any)
        .from(table)
        .select("id, external_id")
        .eq("tenant_id", tenantId)
        .range(offset, offset + PAGE_SIZE - 1);

      if (linkId !== null) {
        query = query.eq("link_id", linkId);
      }

      const { data, error } = await query;
      if (error)
        throw new Error(
          `Prune fetch ${String(table)} failed: ${error.message}`,
        );
      if (!data || data.length === 0) break;

      for (const row of data) {
        if (!survivingIds.has(String(row.external_id))) {
          staleIds.push(String(row.id));
        }
      }

      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    if (staleIds.length === 0) return;

    for (let i = 0; i < staleIds.length; i += 500) {
      const chunk = staleIds.slice(i, i + 500);
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion
        .schema(schema as any)
        .from(table)
        .delete()
        .in("id", chunk);
      if (error)
        throw new Error(
          `Delete stale ${String(table)} failed: ${error.message}`,
        );
    }

    Logger.info({
      module: "SyncWorker",
      context: "pruneStale",
      message: `Deleted ${staleIds.length} stale rows from ${schema}.${String(table)}`,
    });
  }
}
