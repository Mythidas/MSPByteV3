import { queueManager, QueueNames } from './lib/queue.js';
import type { TaskRunJobData } from './types.js';

export async function enqueueRun(runId: string, priority = 5): Promise<void> {
  await queueManager.addJob<TaskRunJobData>(QueueNames.tasks, { runId }, { priority, jobId: runId });
}
