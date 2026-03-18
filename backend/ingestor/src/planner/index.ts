import { Logger } from "@workspace/core/lib/utils/logger";
import { enumerate } from "./enumerate";
import { filterStaleEntries } from "./freshness";
import { enqueue } from "./enqueue";

export async function runPlanner(): Promise<void> {
  const entries = await enumerate();
  const stale = await filterStaleEntries(entries);
  const enqueued = await enqueue(stale);

  Logger.info({
    module: "ingestor",
    context: "planner",
    message: `run complete`,
    meta: { enumerated: entries.length, fresh: entries.length - stale.length, enqueued },
  });
}
