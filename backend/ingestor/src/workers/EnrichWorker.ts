import type { Job } from "bullmq";
import { queueManager, QueueNames } from "../lib/queue.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { startIngestJob, completeIngestJob, failIngestJob } from "../lib/ingest-state.js";
import type { EnrichJobData } from "../types.js";
import type { IngestorDefinition } from "../interfaces.js";

export class EnrichWorker {
  constructor(
    private integrationId: string,
    private def: IngestorDefinition,
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
    const { tenantId, linkId, integrationId, enrichmentType } = job.data;

    // Find the matching EnrichmentContract
    const enrichment = this.def.enrichments.find(
      (e) => e.enrichmentType === enrichmentType,
    );
    if (!enrichment) {
      Logger.warn({
        module: "EnrichWorker",
        context: "handleJob",
        message: `No enrichment registered for type "${enrichmentType}" in ${integrationId} — skipping`,
      });
      return;
    }

    const dbJob = await startIngestJob({
      tenant_id: tenantId,
      link_id: linkId,
      integration_id: integrationId,
      ingest_type: enrichmentType,
    });

    try {
      await enrichment.run({ tenantId, linkId: linkId ?? undefined });
      await completeIngestJob(dbJob.id, {});
    } catch (err) {
      await failIngestJob(dbJob.id, { error: String(err) });
      throw err;
    }
  }
}
