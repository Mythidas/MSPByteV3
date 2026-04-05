import { Queue } from "bullmq";
import { redis } from "./redis";
import { CoreQueueNames } from "@workspace/shared/config/queue-names";
import type { EvaluationsJobPayload } from "./workers/evaluations-worker";

export const evaluationsRunQueue = new Queue<EvaluationsJobPayload>(
  CoreQueueNames.EvaluationsRun,
  { connection: redis },
);
