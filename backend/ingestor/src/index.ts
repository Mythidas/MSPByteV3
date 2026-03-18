import "./queues"; // initialize queues + Redis connection
import { Logger } from "@workspace/core/lib/utils/logger";
import { startWorkers, stopWorkers } from "./workers";
import { startCron } from "./cron";
// Phase 3 — import and register adapters here before startWorkers()

startWorkers();
startCron();
Logger.info({ module: "ingestor", context: "index", message: "started" });

const shutdown = async (signal: string) => {
  Logger.info({ module: "ingestor", context: "index", message: `received ${signal}, shutting down...` });
  await stopWorkers();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
