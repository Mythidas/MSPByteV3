import cron from "node-cron";
import { Logger } from "@workspace/core/lib/utils/logger";
import { runPlanner } from "./planner";

const expression = process.env.PLANNER_CRON ?? "*/1 * * * *";

export function startCron(): void {
  cron.schedule(expression, async () => {
    const start = new Date();
    Logger.info({
      module: "ingestor",
      context: "cron",
      message: `starting at ${start.toISOString()}`,
    });
    try {
      await runPlanner();
      Logger.info({
        module: "ingestor",
        context: "cron",
        message: `completed in ${Date.now() - start.getTime()}ms`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Logger.error({ module: "ingestor", context: "cron", message });
    }
  });

  Logger.info({
    module: "ingestor",
    context: "cron",
    message: `scheduled: ${expression}`,
  });
}
