import { Queue } from "bullmq";
import { QueueNames, type QueueName } from "@workspace/core/config/queue-names";
import { redis } from "./redis";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const connection = redis as any;

export const ingestRealtimeQueue = new Queue(QueueNames.IngestRealtime, { connection });
export const ingestScheduledQueue = new Queue(QueueNames.IngestScheduled, { connection });
export const ingestBulkQueue = new Queue(QueueNames.IngestBulk, { connection });
export const ingestLinkingQueue = new Queue(QueueNames.IngestLinking, { connection });
export const ingestEnrichmentQueue = new Queue(QueueNames.IngestEnrichment, { connection });
export const complianceEvalQueue = new Queue(QueueNames.ComplianceEval, { connection });
export const workflowRunQueue = new Queue(QueueNames.WorkflowRun, { connection });
export const workflowActionQueue = new Queue(QueueNames.WorkflowAction, { connection });

export const queues: Record<QueueName, Queue> = {
  [QueueNames.IngestRealtime]: ingestRealtimeQueue,
  [QueueNames.IngestScheduled]: ingestScheduledQueue,
  [QueueNames.IngestBulk]: ingestBulkQueue,
  [QueueNames.IngestLinking]: ingestLinkingQueue,
  [QueueNames.IngestEnrichment]: ingestEnrichmentQueue,
  [QueueNames.ComplianceEval]: complianceEvalQueue,
  [QueueNames.WorkflowRun]: workflowRunQueue,
  [QueueNames.WorkflowAction]: workflowActionQueue,
};
