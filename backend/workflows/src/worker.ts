import { Logger } from '@workspace/shared/lib/utils/logger.js';
import { queueManager, QueueNames } from './lib/queue.js';
import { executeRun } from './executor/index.js';
import type { TaskRunJobData } from './types.js';

export class TaskWorker {
  start(): void {
    queueManager.createWorker<TaskRunJobData>(
      QueueNames.tasks,
      async (job) => {
        Logger.info({
          module: 'TaskWorker',
          context: 'handleJob',
          message: `Executing run ${job.data.runId}`,
        });
        await executeRun(job.data.runId);
      },
      { concurrency: 3 },
    );
  }
}
