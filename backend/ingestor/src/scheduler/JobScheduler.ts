import { getSupabase } from "../supabase.js";
import { queueManager, QueueNames } from "../lib/queue.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import type { IngestJobData } from "../types.js";
import { IntegrationId } from "@workspace/shared/types/integrations.js";
import { INTEGRATIONS } from "@workspace/shared/config/integrations/integrations.js";
import { IngestType } from "@workspace/shared/types/jobs/ingest.js";
import { parseSafeErrorMessage } from "@workspace/shared/lib/utils/validators.js";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const JOB_RETENTION_DAYS = 7;

/**
 * JobScheduler — schedules ingest jobs directly into BullMQ (no DB pending rows).
 * Uses deterministic jobIds for deduplication so concurrent enqueues are idempotent.
 */
export class JobScheduler {
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.cleanupTimer = setInterval(
      () => void JobScheduler.cleanupOldJobs(),
      CLEANUP_INTERVAL_MS,
    );
    Logger.info({
      module: "JobScheduler",
      context: "start",
      message: "Scheduler started (cleanup every 1h)",
    });
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    Logger.info({
      module: "JobScheduler",
      context: "stop",
      message: "Scheduler stopped",
    });
  }

  /**
   * Enqueue a job immediately (delay = 0). BullMQ deduplicates via deterministic jobId.
   */
  static async enqueueNow(
    tenantId: string,
    siteId: string | null,
    linkId: string | null,
    integrationId: IntegrationId,
    ingestType: IngestType,
  ): Promise<void> {
    await JobScheduler._enqueue(
      tenantId,
      siteId,
      linkId,
      integrationId,
      ingestType,
      0,
    );
  }

  /**
   * Schedule a job to run after `delayMs` milliseconds.
   */
  static async scheduleWithDelay(
    tenantId: string,
    siteId: string | null,
    linkId: string | null,
    integrationId: IntegrationId,
    ingestType: IngestType,
    delayMs: number,
  ): Promise<void> {
    await JobScheduler._enqueue(
      tenantId,
      siteId,
      linkId,
      integrationId,
      ingestType,
      delayMs,
    );
  }

  /**
   * Schedule the next ingest run based on the integration's freshnessMinutes config.
   */
  static async scheduleNextIngest(
    tenantId: string,
    siteId: string | null,
    linkId: string | null,
    integrationId: IntegrationId,
    ingestType: IngestType,
  ): Promise<void> {
    const rateMinutes =
      INTEGRATIONS[integrationId]?.supportedTypes.find(
        (t) => t.type === ingestType,
      )?.freshnessMinutes ?? 120;

    const delayMs = rateMinutes * 60 * 1000;
    await JobScheduler._enqueue(
      tenantId,
      siteId,
      linkId,
      integrationId,
      ingestType,
      delayMs,
    );

    Logger.info({
      module: "JobScheduler",
      context: "scheduleNextIngest",
      message: `Scheduled next ${ingestType} in ${rateMinutes}m`,
    });
  }

  private static async _enqueue(
    tenantId: string,
    siteId: string | null,
    linkId: string | null,
    integrationId: IntegrationId,
    ingestType: IngestType,
    delayMs: number,
  ): Promise<void> {
    const queueName = QueueNames.ingest(integrationId, ingestType);
    const jobId = `ingest|${integrationId}|${ingestType}|${tenantId}|${linkId ?? "null"}`;

    const jobData: IngestJobData = {
      tenantId,
      integrationId,
      ingestType: ingestType,
      linkId,
      siteId,
    };

    await queueManager.addJob(queueName, jobData, { jobId, delay: delayMs });
  }

  static async cleanupOldJobs(): Promise<number> {
    const supabase = getSupabase();
    const cutoff = new Date(
      Date.now() - JOB_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data, error } = await supabase
      .from("ingest_jobs")
      .delete()
      .in("status", ["completed", "failed"])
      .lt("completed_at", cutoff)
      .select("id");

    if (error) {
      Logger.error({
        module: "JobScheduler",
        context: "cleanupOldJobs",
        message: `Error cleaning up old jobs: ${parseSafeErrorMessage(error)}`,
      });
      return 0;
    }

    const count = data?.length ?? 0;
    if (count > 0) {
      Logger.info({
        module: "JobScheduler",
        context: "cleanupOldJobs",
        message: `Cleaned up ${count} old ingest_jobs (older than ${JOB_RETENTION_DAYS} days)`,
      });
    }

    return count;
  }
}
