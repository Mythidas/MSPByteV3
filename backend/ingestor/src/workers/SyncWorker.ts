import type { Job } from "bullmq";
import { queueManager, QueueNames } from "../lib/queue.js";
import { PipelineTracker } from "../lib/tracker.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { JobScheduler } from "../scheduler/JobScheduler.js";
import {
  completeIngestJob,
  failIngestJob,
  getAvailableDataTypes,
} from "../lib/ingest-state.js";
import { LINK_DEBOUNCE_MS } from "../lib/ingest-config.js";
import { getSupabase } from "../supabase.js";
import type { IngestJobData, LinkJobData } from "../types.js";
import type {
  IAdapter,
  IProcessor,
  IngestorDefinition,
} from "../interfaces.js";
import type { EntityType } from "@workspace/shared/config/integrations.js";

export class SyncWorker {
  private started = false;

  constructor(
    private integrationId: string,
    private entityType: EntityType,
    private adapter: IAdapter,
    private def: IngestorDefinition,
  ) {}

  start(): void {
    if (this.started) return;

    const queueName = QueueNames.ingest(this.integrationId, this.entityType);

    queueManager.createWorker<IngestJobData>(
      queueName,
      this.handleJob.bind(this),
      {
        concurrency: 3,
      },
    );

    this.started = true;
    Logger.info({
      module: "SyncWorker",
      context: "start",
      message: `Worker started for ${this.integrationId}:${this.entityType}`,
    });
  }

  private async handleJob(job: Job<IngestJobData>): Promise<void> {
    const { tenantId, ingestType, ingestId, jobId, linkId, siteId } = job.data;
    const tracker = new PipelineTracker();
    const supabase = getSupabase();

    Logger.info({
      module: "SyncWorker",
      context: "handleJob",
      message: `[${jobId}] Starting ingest for ${this.integrationId}:${ingestType}`,
    });

    await supabase
      .from("ingest_jobs")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .eq("id", jobId);

    try {
      // 1. ADAPTER
      const rawEntities = await tracker.trackSpan("stage:adapter", () =>
        this.adapter.fetch(job.data, tracker),
      );

      Logger.info({
        module: "SyncWorker",
        context: "handleJob",
        message: `[${jobId}] Fetched ${rawEntities.length} raw entities`,
      });

      const filtered = rawEntities.filter((e) => e.type === ingestType);

      // 2. PROCESSOR
      const processedRows = await tracker.trackSpan("stage:processor", () =>
        this.def.processor.process(filtered, job.data, tracker),
      );
      await tracker.trackSpan("stage:prune", () =>
        this.def.processor.pruneStale(processedRows, job.data, tracker),
      );

      // 3. Write sync state
      await completeIngestJob(jobId, { metrics: tracker.toJSON() as any });

      // 4. Smart link enqueue — one job per satisfied op
      if (linkId) {
        const available = await getAvailableDataTypes({
          tenant_id: tenantId,
          link_id: linkId,
          integration_id: this.integrationId,
        });

        for (const [opName, deps] of Object.entries(this.def.linkOpDeps) as [
          string,
          EntityType[],
        ][]) {
          if (deps.every((dep: EntityType) => available.has(dep))) {
            await queueManager.addJob(
              QueueNames.link(this.integrationId),
              {
                tenantId,
                integrationId: this.integrationId,
                linkId,
                linkOpType: opName,
              } satisfies LinkJobData,
              {
                jobId: `link_${this.integrationId}_${linkId}_${opName}`,
                delay: LINK_DEBOUNCE_MS,
                priority: 50,
              },
            );

            Logger.info({
              module: "SyncWorker",
              context: "handleJob",
              message: `[${jobId}] Link job enqueued: ${opName} for link ${linkId}`,
            });
          }
        }
      }

      // 5. Schedule next ingest
      await JobScheduler.scheduleNextIngest(
        tenantId,
        siteId,
        linkId,
        this.integrationId,
        ingestType,
        50,
      );

      Logger.info({
        module: "SyncWorker",
        context: "handleJob",
        message: `[${jobId}] Ingest completed for ${this.integrationId}:${ingestType}`,
      });
    } catch (error) {
      tracker.trackError(error as Error, job.attemptsMade);

      try {
        await failIngestJob(jobId, {
          error: (error as Error).message,
          metrics: tracker.toJSON() as any,
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
        message: `[${jobId}] Ingest failed for ${this.integrationId}:${ingestType}: ${(error as Error).message}`,
      });

      throw error;
    }
  }
}
