import { Logger } from '@workspace/shared/lib/utils/logger';
import workflowRunQueue, { WORKFLOW_RUN_QUEUE } from './workflow-run.js';
import workflowSchedulerQueue, { SCHEDULER_QUEUE } from './scheduler.js';

export { workflowRunQueue, WORKFLOW_RUN_QUEUE };
export { workflowSchedulerQueue, SCHEDULER_QUEUE };

export async function initQueues(): Promise<void> {
  Logger.info({ module: 'workflows', context: 'queue', message: `Queue ready: ${WORKFLOW_RUN_QUEUE}` });

  const repeatableJobs = await workflowSchedulerQueue.getRepeatableJobs();
  const schedulerJobExists = repeatableJobs.some((j) => j.name === 'scheduler-tick');

  if (!schedulerJobExists) {
    await workflowSchedulerQueue.add(
      'scheduler-tick',
      { tick_at: new Date().toISOString() },
      { repeat: { every: 60_000 } }
    );
  }

  Logger.info({ module: 'workflows', context: 'queue', message: `Queue ready: ${SCHEDULER_QUEUE}` });
}
