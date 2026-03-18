import { Worker, type Job } from "bullmq";
import type { JobContext, JobResult } from "@workspace/core/types/job";
import type { DataReadyEvent } from "@workspace/core/types/event";
import { publishEvent } from "@workspace/core/lib/event-bus";
import { IngestStatus } from "@workspace/core/types/ingest";
import { Logger } from "@workspace/core/lib/utils/logger";
import { redis } from "../redis";
import { supabase } from "../lib/supabase";
import { ingestRealtimeQueue } from "../queues";

export class SkipJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkipJobError";
  }
}

export type JobPayload = {
  tenantId: string;
  integrationId: string;
  ingestType: string;
  siteId?: string;
  linkId?: string;
  trigger: string;
  jobId: string; // ingest_jobs.id (UUID)
  // Enrichment-specific — only present on enrichment queue jobs
  enrichmentType?: string;
  dependencies?: Array<{ integrationId: string; ingestType: string }>;
};

export abstract class BaseWorker {
  protected worker: Worker;

  constructor(queueName: string, concurrency = 5) {
    this.worker = new Worker(queueName, (job) => this.processJob(job), {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      connection: redis as any,
      concurrency,
    });

    this.worker.on("failed", (job, err) => {
      Logger.error({ module: "ingestor", context: queueName, message: `job ${job?.id} failed: ${err.message}` });
    });

    this.worker.on("error", (err) => {
      Logger.error({ module: "ingestor", context: queueName, message: err.message });
    });
  }

  abstract process(job: Job<JobPayload>, ctx: JobContext): Promise<JobResult>;

  private async buildContext(job: Job<JobPayload>): Promise<JobContext> {
    const { tenantId, integrationId, ingestType, siteId, linkId, trigger, jobId } = job.data;

    const { data: syncState } = await supabase
      .from("ingest_sync_states")
      .select("last_synced_at, metadata")
      .eq("tenant_id", tenantId)
      .eq("integration_id", integrationId)
      .eq("ingest_type", ingestType)
      .eq(siteId ? "site_id" : "link_id", siteId ?? linkId ?? "")
      .maybeSingle();

    return {
      tenantId,
      siteId,
      linkId,
      jobId,
      ingestType: ingestType as JobContext["ingestType"],
      integrationId,
      trigger: trigger as JobContext["trigger"],
      credentials: {}, // populated by subclass / Session 2
      lastSyncedAt: syncState?.last_synced_at
        ? new Date(syncState.last_synced_at)
        : undefined,
      metadata: (syncState?.metadata as Record<string, unknown>) ?? undefined,
    };
  }

  private async processJob(job: Job<JobPayload>): Promise<JobResult> {
    const ctx = await this.buildContext(job);

    // Mark running
    await supabase
      .from("ingest_jobs")
      .update({ status: IngestStatus.Running, started_at: new Date().toISOString() })
      .eq("bullmq_job_id", job.id!);

    try {
      const result = await this.process(job, ctx);

      const completedAt = new Date().toISOString();

      // Mark completed
      await supabase
        .from("ingest_jobs")
        .update({
          status: IngestStatus.Completed,
          completed_at: completedAt,
          metrics: result.metrics ?? null,
          error: null,
        })
        .eq("bullmq_job_id", job.id!);

      // Upsert sync state
      const scopeKey = ctx.siteId
        ? { site_id: ctx.siteId, link_id: null }
        : ctx.linkId
          ? { link_id: ctx.linkId, site_id: null }
          : { site_id: null, link_id: null };

      await supabase.from("ingest_sync_states").upsert(
        {
          tenant_id: ctx.tenantId,
          integration_id: ctx.integrationId,
          ingest_type: ctx.ingestType,
          ...scopeKey,
          last_synced_at: completedAt,
          last_job_id: ctx.jobId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          metadata: (result.metadata ?? {}) as any,
        },
        {
          onConflict: "tenant_id,integration_id,ingest_type,site_id,link_id",
        },
      );

      // Publish data_ready event
      const event: DataReadyEvent = {
        event: "data_ready",
        tenantId: ctx.tenantId,
        siteId: ctx.siteId,
        linkId: ctx.linkId,
        ingestType: ctx.ingestType,
        completedAt,
      };
      await publishEvent(ingestRealtimeQueue, event);

      return result;
    } catch (err) {
      if (err instanceof SkipJobError) {
        await supabase
          .from("ingest_jobs")
          .update({ status: IngestStatus.Skipped, error: err.message })
          .eq("bullmq_job_id", job.id!);
        Logger.warn({ module: "ingestor", context: "BaseWorker", message: `job skipped: ${err.message}` });
        return { success: false, recordCount: 0 };
      }

      const message = err instanceof Error ? err.message : String(err);

      await supabase
        .from("ingest_jobs")
        .update({ status: IngestStatus.Failed, error: message })
        .eq("bullmq_job_id", job.id!);

      throw err;
    }
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}
