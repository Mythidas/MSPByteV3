import { Queue } from "bullmq";
import { QueueNames } from "@workspace/core/config/queue-names";
import { redis } from "./redis";
import { ComplianceJobPayload } from "./workers/compliance-worker";

const connection = redis;

export const complianceEvalQueue = new Queue<ComplianceJobPayload, unknown>(
  QueueNames.ComplianceEval,
  {
    connection,
  },
);
