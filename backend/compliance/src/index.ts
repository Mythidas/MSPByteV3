import "./queues";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { startWorkers, stopWorkers } from "./workers";

Logger.level = (process.env.LOG_LEVEL as any) ?? "info";

startWorkers();
Logger.info({ module: "compliance", context: "index", message: "started" });

const shutdown = async (signal: string) => {
  Logger.info({
    module: "compliance",
    context: "index",
    message: `received ${signal}, shutting down...`,
  });
  await stopWorkers();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
