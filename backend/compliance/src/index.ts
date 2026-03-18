import "./queues";
import { Logger } from "@workspace/core/lib/utils/logger";
import { startWorkers, stopWorkers } from "./workers";

startWorkers();
Logger.info({ module: "compliance", context: "index", message: "started" });

const shutdown = async (signal: string) => {
  Logger.info({ module: "compliance", context: "index", message: `received ${signal}, shutting down...` });
  await stopWorkers();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
