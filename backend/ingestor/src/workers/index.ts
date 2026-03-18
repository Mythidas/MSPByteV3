import { QueueNames } from "@workspace/core/config/queue-names";
import { Logger } from "@workspace/core/lib/utils/logger";
import { IngestWorker } from "./ingest-worker";
import { LinkingWorker } from "./linking-worker";
import { EnrichmentWorker } from "./enrichment-worker";
import type { BaseWorker } from "./base-worker";

let activeWorkers: BaseWorker[] = [];

export function startWorkers(): BaseWorker[] {
  activeWorkers = [
    new IngestWorker(QueueNames.IngestRealtime, 5),
    new IngestWorker(QueueNames.IngestScheduled, 10),
    new IngestWorker(QueueNames.IngestBulk, 3),
    new LinkingWorker(),
    new EnrichmentWorker(),
  ];
  return activeWorkers;
}

export async function stopWorkers(): Promise<void> {
  Logger.info({ module: "ingestor", context: "workers", message: "shutting down..." });
  await Promise.all(activeWorkers.map((w) => w.close()));
  activeWorkers = [];
  Logger.info({ module: "ingestor", context: "workers", message: "shutdown complete" });
}
