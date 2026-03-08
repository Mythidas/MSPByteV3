import { Worker } from 'bullmq';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { getRedisConnection } from '../redis.js';
import { WORKFLOW_RUN_QUEUE } from '../queues/workflow-run.js';
import type { WorkflowRunJobPayload } from '../types.js';
import { executeRun } from '../executor/index.js';

const runWorker = new Worker<WorkflowRunJobPayload>(
  WORKFLOW_RUN_QUEUE,
  async (job) => {
    const { run_id } = job.data;
    Logger.info({ module: 'workflows', context: 'worker:workflow-run', message: `processing run_id=${run_id}` });
    await executeRun(run_id);
    Logger.info({ module: 'workflows', context: 'worker:workflow-run', message: `completed run_id=${run_id}` });
  },
  {
    connection: getRedisConnection(),
    concurrency: 3,
  }
);

runWorker.on('failed', (job, err) => {
  Logger.error({
    module: 'workflows',
    context: 'worker:workflow-run',
    message: `job failed: ${job?.id}`,
    meta: { err },
  });
});

runWorker.on('error', (err) => {
  Logger.error({ module: 'workflows', context: 'worker:workflow-run', message: `worker error`, meta: { err } });
});

export default runWorker;
