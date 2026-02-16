import { Queue, Worker, Job, type QueueOptions, type WorkerOptions } from 'bullmq';
import { getRedisConnection } from './redis.js';
import { Logger } from './logger.js';

export const QueueNames = {
  sync: (integrationId: string, entityType: string) => `sync.${integrationId}.${entityType}`,
  analysis: (integrationId: string) => `analysis.${integrationId}`,
};

class QueueManager {
  private queues = new Map<string, Queue>();
  private workers = new Map<string, Worker>();

  private getDefaultOpts(): QueueOptions {
    return {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    };
  }

  private getOrCreateQueue(queueName: string): Queue {
    if (!this.queues.has(queueName)) {
      const queue = new Queue(queueName, this.getDefaultOpts());

      queue.on('error', (error: Error) => {
        Logger.log({
          module: 'QueueManager',
          context: 'queue',
          message: `Queue error [${queueName}]: ${error.message}`,
          level: 'error',
        });
      });

      this.queues.set(queueName, queue);
      Logger.log({
        module: 'QueueManager',
        context: 'queue',
        message: `Queue created: ${queueName}`,
        level: 'trace',
      });
    }

    return this.queues.get(queueName)!;
  }

  async addJob<T>(
    queueName: string,
    jobData: T,
    options?: { priority?: number; delay?: number; jobId?: string },
  ): Promise<Job<T>> {
    const queue = this.getOrCreateQueue(queueName);
    return queue.add(queueName, jobData, options);
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
        connection: getRedisConnection(),
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
        level: 'trace',
      });
    }

    for (const [name, queue] of this.queues.entries()) {
      await queue.close();
      Logger.log({
        module: 'QueueManager',
        context: 'closeAll',
        message: `Queue closed: ${name}`,
        level: 'trace',
      });
    }

    this.workers.clear();
    this.queues.clear();
  }
}

export const queueManager = new QueueManager();
