import { Queue } from 'bullmq';
import { getRedisConnection } from '../redis.js';
import type { WorkflowRunJobPayload } from '../types.js';

export const WORKFLOW_RUN_QUEUE = 'workflow-run';

const workflowRunQueue = new Queue<WorkflowRunJobPayload>(WORKFLOW_RUN_QUEUE, {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export default workflowRunQueue;
