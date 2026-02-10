import { Queue, Worker, Job, type QueueOptions, type WorkerOptions } from 'bullmq';
import { redis } from './redis.js';
import { Logger } from './logger.js';
import type { IntegrationId, EntityType } from '../config.js';
import type { SyncJobData } from '../types.js';

export const QueueNames = {
  sync: (integrationId: IntegrationId, entityType: EntityType) =>
    `sync.${integrationId}.${entityType}`,
  process: 'process.entity',
  link: (integrationId: IntegrationId) => `link.${integrationId}`,
  analyze: 'analyze.tenant',
} as const;

const getDefaultQueueOptions = (): QueueOptions => ({
  connection: redis.getClient(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

class QueueManager {
  private queues = new Map<string, Queue>();
  private workers = new Map<string, Worker>();

  getQueue(queueName: string): Queue {
    if (!this.queues.has(queueName)) {
      const queue = new Queue(queueName, getDefaultQueueOptions());

      queue.on('error', (error: Error) => {
        Logger.log({
          module: 'QueueManager',
          context: 'getQueue',
          message: `Queue error [${queueName}]: ${error.message}`,
          level: 'error',
        });
      });

      this.queues.set(queueName, queue);
      Logger.log({
        module: 'QueueManager',
        context: 'getQueue',
        message: `Queue created: ${queueName}`,
        level: 'info',
      });
    }

    return this.queues.get(queueName)!;
  }

  createWorker<T = any>(
    queueName: string,
    processor: (job: Job<T>) => Promise<any>,
    options?: Partial<WorkerOptions>,
  ): Worker<T> {
    const workerKey = `${queueName}-worker`;

    if (this.workers.has(workerKey)) {
      throw new Error(`Worker already exists for queue: ${queueName}`);
    }

    const worker = new Worker<T>(
      queueName,
      async (job: Job<T>) => {
        const startTime = Date.now();
        Logger.log({
          module: 'QueueManager',
          context: 'worker',
          message: `Processing job [${queueName}] ${job.id}`,
          level: 'info',
        });

        try {
          const result = await processor(job);
          Logger.log({
            module: 'QueueManager',
            context: 'worker',
            message: `Job completed [${queueName}] ${job.id} in ${Date.now() - startTime}ms`,
            level: 'info',
          });
          return result;
        } catch (error) {
          Logger.log({
            module: 'QueueManager',
            context: 'worker',
            message: `Job failed [${queueName}] ${job.id} after ${Date.now() - startTime}ms: ${error}`,
            level: 'error',
          });
          throw error;
        }
      },
      {
        connection: getDefaultQueueOptions().connection,
        concurrency: options?.concurrency || 5,
        ...options,
      },
    );

    worker.on('failed', (job: Job | undefined, error: Error) => {
      Logger.log({
        module: 'QueueManager',
        context: 'worker',
        message: `Worker failed job [${queueName}] ${job?.id}: ${error.message}`,
        level: 'error',
      });
    });

    worker.on('error', (error: Error) => {
      Logger.log({
        module: 'QueueManager',
        context: 'worker',
        message: `Worker error [${queueName}]: ${error.message}`,
        level: 'error',
      });
    });

    this.workers.set(workerKey, worker);
    Logger.log({
      module: 'QueueManager',
      context: 'createWorker',
      message: `Worker created for queue: ${queueName}`,
      level: 'info',
    });

    return worker;
  }

  async addJob<T>(
    queueName: string,
    jobData: T,
    options?: { priority?: number; delay?: number; jobId?: string },
  ): Promise<Job<T>> {
    const queue = this.getQueue(queueName);
    return queue.add(queueName, jobData, options);
  }

  async hasJobForSync(
    queueName: string,
    integrationDbId: string,
    entityType: EntityType,
  ): Promise<boolean> {
    const queue = this.getQueue(queueName);
    const waitingJobs = await queue.getJobs(['waiting', 'delayed']);
    return waitingJobs.some(
      (job) =>
        (job.data as SyncJobData).integrationDbId === integrationDbId &&
        (job.data as SyncJobData).entityType === entityType,
    );
  }

  async clearWaitingAndDelayedJobs(queueName: string): Promise<number> {
    const queue = this.getQueue(queueName);
    const allJobs = [
      ...(await queue.getJobs(['waiting'])),
      ...(await queue.getJobs(['delayed'])),
    ];

    let removed = 0;
    for (const job of allJobs) {
      await job.remove();
      removed++;
    }

    Logger.log({
      module: 'QueueManager',
      context: 'clearWaitingAndDelayedJobs',
      message: `Cleared ${removed} jobs from queue: ${queueName}`,
      level: 'info',
    });

    return removed;
  }

  async closeAll(): Promise<void> {
    Logger.log({
      module: 'QueueManager',
      context: 'closeAll',
      message: 'Closing all queues and workers...',
      level: 'info',
    });

    for (const [key, worker] of this.workers.entries()) {
      await worker.close();
      Logger.log({
        module: 'QueueManager',
        context: 'closeAll',
        message: `Worker closed: ${key}`,
        level: 'info',
      });
    }

    for (const [name, queue] of this.queues.entries()) {
      await queue.close();
      Logger.log({
        module: 'QueueManager',
        context: 'closeAll',
        message: `Queue closed: ${name}`,
        level: 'info',
      });
    }

    this.workers.clear();
    this.queues.clear();
  }
}

export const queueManager = new QueueManager();
