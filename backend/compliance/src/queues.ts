import { Queue } from "bullmq";
import { QueueNames } from "@workspace/core/config/queue-names";
import { redis } from "./redis";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const connection = redis as any;

export const complianceEvalQueue = new Queue(QueueNames.ComplianceEval, { connection });
