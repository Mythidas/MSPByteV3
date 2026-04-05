import "./queues";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { startWorkers, stopWorkers } from "./workers";

const logLevel = process.env.LOG_LEVEL;
Logger.level = Logger.isLogLevel(logLevel) ? logLevel : "info";

startWorkers();
Logger.info({ module: "evaluations", context: "index", message: "started" });

const shutdown = async (signal: string) => {
  Logger.info({
    module: "evaluations",
    context: "index",
    message: `received ${signal}, shutting down...`,
  });
  await stopWorkers();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
  return;
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
  return;
});
