import type { Job } from "bullmq";
import { queueManager, QueueNames } from "../lib/queue.js";
import { PipelineTracker } from "../lib/tracker.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import {
  startIngestJob,
  completeIngestJob,
  failIngestJob,
  getAvailableDataTypes,
} from "../lib/ingest-state.js";
import { ENRICH_DEBOUNCE_MS } from "../lib/ingest-config.js";
import { getSupabase } from "../supabase.js";
import type { LinkJobData, EnrichJobData } from "../types.js";
import type { ILinker, IngestorDefinition } from "../interfaces.js";

export class LinkWorker {
  constructor(
    private integrationId: string,
    private linker: ILinker,
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
    const { tenantId, linkId, integrationId, linkOpType } = job.data;
    const tracker = new PipelineTracker();
    const supabase = getSupabase();

    // Fetch the full link record — each linker extracts what it needs
    const { data: linkRecord, error } = await supabase
      .from("integration_links")
      .select("id, tenant_id, site_id, external_id, meta")
      .eq("id", linkId)
      .single();

    if (error || !linkRecord) {
      Logger.warn({
        module: "LinkWorker",
        context: "handleJob",
        message: `Link record not found for ${linkId} — skipping`,
      });
      return;
    }

    const dbJob = await startIngestJob({
      tenant_id: tenantId,
      link_id: linkId,
      integration_id: integrationId,
      ingest_type: linkOpType,
    });

    try {
      await this.linker.link(job.data, linkRecord as any, tracker);
      await completeIngestJob(dbJob.id, { metrics: tracker.toJSON() as any });
    } catch (err) {
      await failIngestJob(dbJob.id, { error: String(err) });
      throw err;
    }

    // Check if enricher deps are satisfied
    const available = await getAvailableDataTypes({
      tenant_id: tenantId,
      link_id: linkId,
      integration_id: integrationId,
    });

    for (const [opName, deps] of Object.entries(this.def.enrichOpDeps)) {
      if (deps.every((dep) => available.has(dep))) {
        await queueManager.addJob(
          QueueNames.enrich(this.integrationId),
          { tenantId, integrationId, linkId, enrichOpType: opName } satisfies EnrichJobData,
          {
            jobId: `enrich_${this.integrationId}_${linkId}_${opName}`,
            delay: ENRICH_DEBOUNCE_MS,
            priority: 60,
          },
        );

        Logger.info({
          module: "LinkWorker",
          context: "handleJob",
          message: `Enrich job enqueued for link ${linkId} op ${opName}`,
        });
      }
    }
  }
}
