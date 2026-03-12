import type { Job } from "bullmq";
import { queueManager, QueueNames } from "../lib/queue.js";
import { PipelineTracker } from "../lib/tracker.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { startIngestJob, completeIngestJob, failIngestJob } from "../lib/ingest-state.js";
import type { EnrichJobData } from "../types.js";
import { IEnricher } from "../interfaces.js";

export class EnrichWorker {
  constructor(
    private integrationId: string,
    private enricher: IEnricher,
  ) {}

  start(): void {
    queueManager.createWorker<EnrichJobData>(
      QueueNames.enrich(this.integrationId),
      this.handleJob.bind(this),
      { concurrency: 2 },
    );

    Logger.info({
      module: "EnrichWorker",
      context: "start",
      message: `Worker started for ${this.integrationId} enrich queue`,
    });
  }

  private async handleJob(job: Job<EnrichJobData>): Promise<void> {
    const { tenantId, linkId, integrationId, enrichOpType } = job.data;
    const tracker = new PipelineTracker();

    const dbJob = await startIngestJob({
      tenant_id: tenantId,
      link_id: linkId,
      integration_id: integrationId,
      ingest_type: enrichOpType,
    });

    try {
      await this.enricher.enrich(job.data, tracker);
      await completeIngestJob(dbJob.id, { metrics: tracker.toJSON() as any });
    } catch (err) {
      await failIngestJob(dbJob.id, { error: String(err) });
      throw err;
    }
  }
}
