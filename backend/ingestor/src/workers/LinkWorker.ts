import type { Job } from "bullmq";
import { queueManager, QueueNames } from "../lib/queue.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import {
  startIngestJob,
  completeIngestJob,
  failIngestJob,
  getAvailableDataTypes,
} from "../lib/ingest-state.js";
import { ENRICH_DEBOUNCE_MS } from "../lib/ingest-config.js";
import type { LinkJobData, EnrichJobData } from "../types.js";
import type { IngestorDefinition } from "../interfaces.js";

export class LinkWorker {
  constructor(
    private integrationId: string,
    private def: IngestorDefinition,
  ) {}

  start(): void {
    queueManager.createWorker<LinkJobData>(
      QueueNames.link(this.integrationId),
      this.handleJob.bind(this),
      { concurrency: 2 },
    );

    Logger.info({
      module: "LinkWorker",
      context: "start",
      message: `Worker started for ${this.integrationId} link queue`,
    });
  }

  private async handleJob(job: Job<LinkJobData>): Promise<void> {
    const { tenantId, linkId, integrationId, linkerType } = job.data;

    // Find the matching LinkerContract
    const linker = this.def.linkers.find((l) => l.linkerType === linkerType);
    if (!linker) {
      Logger.warn({
        module: "LinkWorker",
        context: "handleJob",
        message: `No linker registered for type "${linkerType}" in ${integrationId} — skipping`,
      });
      return;
    }

    const dbJob = await startIngestJob({
      tenant_id: tenantId,
      link_id: linkId,
      integration_id: integrationId,
      ingest_type: linkerType,
    });

    try {
      await linker.run({ tenantId, linkId });
      await completeIngestJob(dbJob.id, {});
    } catch (err) {
      await failIngestJob(dbJob.id, { error: String(err) });
      throw err;
    }

    // Check if enrichment deps are satisfied
    const available = await getAvailableDataTypes({
      tenant_id: tenantId,
      link_id: linkId,
      integration_id: integrationId,
    });

    for (const enrichment of this.def.enrichments) {
      const depsOk = enrichment.dependencies.every((dep) => available.has(dep.ingestType));

      if (depsOk) {
        await queueManager.addJob(
          QueueNames.enrich(this.integrationId),
          {
            tenantId,
            integrationId,
            linkId,
            enrichmentType: enrichment.enrichmentType,
          } satisfies EnrichJobData,
          {
            jobId: `enrich_${integrationId}_${linkId}_${enrichment.enrichmentType}`,
            delay: ENRICH_DEBOUNCE_MS,
            priority: 60,
          },
        );

        Logger.info({
          module: "LinkWorker",
          context: "handleJob",
          message: `Enrich job enqueued for link ${linkId} type ${enrichment.enrichmentType}`,
        });
      }
    }
  }
}
