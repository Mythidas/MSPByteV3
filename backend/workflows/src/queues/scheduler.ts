import { Queue } from 'bullmq';
import { getRedisConnection } from '../redis.js';
import type { SchedulerJobPayload } from '../types.js';

export const SCHEDULER_QUEUE = 'workflow-scheduler';

const workflowSchedulerQueue = new Queue<SchedulerJobPayload>(SCHEDULER_QUEUE, {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export default workflowSchedulerQueue;
