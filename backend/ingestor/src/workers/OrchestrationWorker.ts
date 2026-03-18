import type { Job } from "bullmq";
import { queueManager, QueueNames } from "../lib/queue.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { registry } from "../registry.js";
import { INTEGRATIONS } from "@workspace/core/config/integrations";
import { getAvailableDataTypes } from "../lib/ingest-state.js";
import { LINK_DEBOUNCE_MS, ENRICH_DEBOUNCE_MS } from "../lib/ingest-config.js";
import type { LinkJobData, EnrichJobData, OrchestrationJobData } from "../types.js";

export class OrchestrationWorker {
  private started = false;

  start(): void {
    if (this.started) return;
    queueManager.createWorker<OrchestrationJobData>(
      "ingest.orchestrate",
      this.handleJob.bind(this),
      { concurrency: 5 },
    );
    this.started = true;
    Logger.info({ module: "OrchestrationWorker", context: "start", message: "Started" });
  }

  private async handleJob(job: Job<OrchestrationJobData>): Promise<void> {
    const { tenantId, linkId, integrationId, ingestType } = job.data;

    for (const def of registry.getAll()) {
      // Linkers
      for (const linker of def.linkers) {
        if (!linkId) continue; // linkers always need a linkId
        let depsOk = true;
        for (const dep of linker.dependencies) {
          const depConfig = INTEGRATIONS[dep.integrationId as keyof typeof INTEGRATIONS]
            ?.supportedTypes.find((t) => t.type === dep.ingestType);
          const depLinkId = depConfig?.scopeLevel === "tenant" ? null : linkId;
          const available = await getAvailableDataTypes({
            tenant_id: tenantId,
            link_id: depLinkId,
            integration_id: dep.integrationId,
          });
          if (!available.has(dep.ingestType)) {
            depsOk = false;
            break;
          }
        }
        if (!depsOk) continue;
        await queueManager.addJob(
          QueueNames.link(def.integrationId),
          {
            tenantId,
            integrationId: def.integrationId,
            linkId,
            linkerType: linker.linkerType,
          } satisfies LinkJobData,
          {
            jobId: `link_${def.integrationId}_${linkId}_${linker.linkerType}`,
            delay: LINK_DEBOUNCE_MS,
            priority: 50,
          },
        );
        Logger.info({
          module: "OrchestrationWorker",
          context: "handleJob",
          message: `Enqueued link job: ${linker.linkerType} for link ${linkId}`,
        });
      }

      // Enrichments
      for (const enrichment of def.enrichments) {
        let depsOk = true;
        for (const dep of enrichment.dependencies) {
          const depConfig = INTEGRATIONS[dep.integrationId as keyof typeof INTEGRATIONS]
            ?.supportedTypes.find((t) => t.type === dep.ingestType);
          const depLinkId = depConfig?.scopeLevel === "tenant" ? null : (linkId ?? null);
          const available = await getAvailableDataTypes({
            tenant_id: tenantId,
            link_id: depLinkId,
            integration_id: dep.integrationId,
          });
          if (!available.has(dep.ingestType)) {
            depsOk = false;
            break;
          }
        }
        if (!depsOk) continue;
        await queueManager.addJob(
          QueueNames.enrich(def.integrationId),
          {
            tenantId,
            integrationId: def.integrationId,
            linkId: linkId ?? null,
            enrichmentType: enrichment.enrichmentType,
          } satisfies EnrichJobData,
          {
            jobId: `enrich_${def.integrationId}_${linkId ?? tenantId}_${enrichment.enrichmentType}`,
            delay: ENRICH_DEBOUNCE_MS,
            priority: 50,
          },
        );
        Logger.info({
          module: "OrchestrationWorker",
          context: "handleJob",
          message: `Enqueued enrich job: ${enrichment.enrichmentType} for ${linkId ?? tenantId}`,
        });
      }
    }
  }
}
