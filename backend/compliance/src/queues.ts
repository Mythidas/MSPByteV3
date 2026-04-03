import { Queue } from "bullmq";
import { redis } from "./redis";
import { ComplianceJobPayload } from "./workers/compliance-worker";
import { CoreQueueNames } from "@workspace/shared/config/queue-names";

const connection = redis;

export const complianceEvalQueue = new Queue<ComplianceJobPayload, unknown>(
  CoreQueueNames.ComplianceEval,
  {
    connection,
  },
);
