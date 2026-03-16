import { Logger } from "@workspace/shared/lib/utils/logger";
import { disconnectRedis } from "./lib/redis.js";
import { queueManager } from "./lib/queue.js";
import { JobScheduler } from "./scheduler/JobScheduler.js";
import { JobReconciler } from "./scheduler/JobReconciler.js";
import { SyncWorker } from "./workers/SyncWorker.js";
import { LinkWorker } from "./workers/LinkWorker.js";
import { EnrichWorker } from "./workers/EnrichWorker.js";
import { registry } from "./registry.js";
import { INTEGRATIONS } from "@workspace/shared/config/integrations.js";

// Side-effect imports — each registers itself with the registry
import "./integrations/microsoft-365/index.js";
import "./integrations/sophos-partner/index.js";
import "./integrations/dattormm/index.js";
import "./integrations/cove/index.js";

async function main() {
  Logger.level = (process.env.LOG_LEVEL as any) || "info";

  Logger.info({
    module: "Ingestor",
    context: "main",
    message: "Starting ingestor...",
  });

  const required = [
    "PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_KEY",
    "REDIS_HOST",
    "REDIS_PORT",
  ];
  for (const envVar of required) {
    if (!process.env[envVar])
      throw new Error(`Missing required env var: ${envVar}`);
  }

  const recovered = await JobScheduler.recoverStuckJobs();
  Logger.info({
    module: "Ingestor",
    context: "main",
    message: `Recovered ${recovered} stuck jobs`,
  });

  // Spin up workers for every registered integration
  const syncWorkers: SyncWorker[] = [];

  for (const def of registry.getAll()) {
    const config = INTEGRATIONS[def.integrationId];

    // One SyncWorker per entity type (fanOut flag only affects reconciler, not worker creation)
    for (const typeConfig of config.supportedTypes) {
      const worker = new SyncWorker(
        def.integrationId,
        typeConfig.type,
        def.adapter,
        def,
      );
      worker.start();
      syncWorkers.push(worker);
    }

    // One LinkWorker + one EnrichWorker per integration
    new LinkWorker(def.integrationId, def.linker, def).start();
    new EnrichWorker(def.integrationId, def.enricher).start();
  }

  Logger.info({
    module: "Ingestor",
    context: "main",
    message: `Started ${syncWorkers.length} sync workers across ${registry.getAll().length} integration(s)`,
  });

  const reconciler = new JobReconciler();
  await reconciler.reconcile();
  reconciler.start();

  const scheduler = new JobScheduler();
  scheduler.start();

  Logger.info({
    module: "Ingestor",
    context: "main",
    message: "Ingestor started. Press Ctrl+C to stop.",
  });

  const shutdown = async (signal: string) => {
    Logger.info({
      module: "Ingestor",
      context: "shutdown",
      message: `Received ${signal}, shutting down...`,
    });
    try {
      reconciler.stop();
      scheduler.stop();
      await queueManager.closeAll();
      await disconnectRedis();
      Logger.info({
        module: "Ingestor",
        context: "shutdown",
        message: "Graceful shutdown complete",
      });
      process.exit(0);
    } catch (error) {
      Logger.error({
        module: "Ingestor",
        context: "shutdown",
        message: `Shutdown error: ${error}`,
      });
      process.exit(1);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  Logger.fatal({
    module: "Ingestor",
    context: "main",
    message: `Fatal error: ${error}`,
  });
  process.exit(1);
});
