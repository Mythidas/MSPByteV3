import {
  Queue,
  Worker,
  type Job,
  type QueueOptions,
  type WorkerOptions,
} from "bullmq";
import { getRedisConnection, getRedisOptions } from "./redis.js";
import { Logger } from "@workspace/shared/lib/utils/logger.js";
import { CoreQueueNames } from "@workspace/shared/config/queue-names.js";
import { parseSafeErrorMessage } from "@workspace/shared/lib/utils/validators.js";

export const QueueNames = {
  ingest: (integrationId: string, entityType: string) =>
    `ingest.${integrationId}.${entityType}`,
  link: (integrationId: string) => `ingest.${integrationId}.link`,
  enrich: (integrationId: string) => `ingest.${integrationId}.enrich`,
};

class QueueManager {
  private queues = new Map<string, Queue<unknown, unknown, string>>();
  private workers = new Map<string, Worker>();

  private getDefaultOpts(): QueueOptions {
    return {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    };
  }

  private getOrCreateQueue(queueName: string): Queue<unknown, unknown, string> {
    let queue = this.queues.get(queueName);
    if (!queue) {
      queue = new Queue<unknown, unknown, string>(
        queueName,
        this.getDefaultOpts(),
      );

      queue.on("error", (error: Error) => {
        Logger.error({
          module: "QueueManager",
          context: "queue",
          message: `Queue error [${queueName}]: ${error.message}`,
        });
      });

      this.queues.set(queueName, queue);
      Logger.trace({
        module: "QueueManager",
        context: "queue",
        message: `Queue created: ${queueName}`,
      });
    }

    return queue;
  }

  /**
   * Enqueue a job immediately, promoting it if it already exists in a delayed
   * state. This prevents BullMQ's silent deduplication from blocking the
   * reconciler's "run now" intent when a delayed job with the same ID exists.
   */
  async promoteOrAdd<T>(
    queueName: string,
    jobData: T,
    options: {
      jobId: string;
      priority?: number;
      attempts?: number;
      backoff?: { type: string; delay: number };
      removeOnComplete?: { count: number };
    },
  ): Promise<void> {
    const queue = this.getOrCreateQueue(queueName);
    const existing = await queue.getJob(options.jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === "delayed") {
        await existing.promote();
        Logger.trace({
          module: "QueueManager",
          context: "promoteOrAdd",
          message: `Promoted delayed job ${options.jobId} in ${queueName}`,
        });
        return;
      }
      if (
        state === "waiting" ||
        state === "prioritized" ||
        state === "active"
      ) {
        Logger.trace({
          module: "QueueManager",
          context: "promoteOrAdd",
          message: `Job ${options.jobId} already ${state} in ${queueName}, skipping`,
        });
        return;
      }
      // completed/failed — fall through and add a fresh job
    }
    await queue.add(queueName, jobData, { ...options, delay: 0 });
  }

  async addJob<T>(
    queueName: string,
    jobData: T,
    options?: {
      priority?: number;
      delay?: number;
      jobId?: string;
      attempts?: number;
      backoff?: { type: string; delay: number };
      removeOnComplete?: { count: number } | boolean;
      removeOnFail?: { count: number } | boolean;
    },
  ): Promise<void> {
    const queue = this.getOrCreateQueue(queueName);
    await queue.add(queueName, jobData, options);
  }

  createWorker<T>(
    queueName: string,
    processor: (job: Job<T>) => Promise<unknown>,
    options?: Partial<WorkerOptions>,
  ): Worker<T> {
    const workerKey = `${queueName}-worker`;

    if (this.workers.has(workerKey)) {
      throw new Error(`Worker already exists for queue: ${queueName}`);
    }

    const worker = new Worker<T, unknown, string>(
      queueName,
      async (job: Job<T>) => {
        const startTime = Date.now();
        Logger.info({
          module: "QueueManager",
          context: "worker",
          message: `Processing job [${queueName}] ${job.id}`,
        });

        try {
          const result = await processor(job);
          Logger.info({
            module: "QueueManager",
            context: "worker",
            message: `Job completed [${queueName}] ${job.id} in ${Date.now() - startTime}ms`,
          });
          return result;
        } catch (error) {
          Logger.error({
            module: "QueueManager",
            context: "worker",
            message: `Job failed [${queueName}] ${job.id} after ${Date.now() - startTime}ms: ${parseSafeErrorMessage(error)}`,
          });
          throw error;
        }
      },
      {
        // Pass connection OPTIONS (not a shared instance) so BullMQ creates
        // its own dedicated blocking connection per worker. Sharing an existing
        // ioredis instance can cause workers to silently fail to consume jobs
        // because the duplicated connection may not inherit all required options.
        connection: getRedisOptions(),
        concurrency: options?.concurrency || 5,
        ...options,
      },
    );

    worker.on("failed", (job: Job | undefined, error: Error) => {
      Logger.error({
        module: "QueueManager",
        context: "worker",
        message: `Worker failed job [${queueName}] ${job?.id}: ${error.message}`,
      });
    });

    worker.on("error", (error: Error) => {
      Logger.error({
        module: "QueueManager",
        context: "worker",
        message: `Worker error [${queueName}]: ${error.message}`,
      });
    });

    this.workers.set(workerKey, worker);
    Logger.info({
      module: "QueueManager",
      context: "createWorker",
      message: `Worker created for queue: ${queueName}`,
    });

    return worker;
  }

  async closeAll(): Promise<void> {
    Logger.info({
      module: "QueueManager",
      context: "closeAll",
      message: "Closing all queues and workers...",
    });

    for (const [key, worker] of this.workers.entries()) {
      await worker.close();
      Logger.trace({
        module: "QueueManager",
        context: "closeAll",
        message: `Worker closed: ${key}`,
      });
    }

    for (const [name, queue] of this.queues.entries()) {
      await queue.close();
      Logger.trace({
        module: "QueueManager",
        context: "closeAll",
        message: `Queue closed: ${name}`,
      });
    }

    this.workers.clear();
    this.queues.clear();
  }
}

export const queueManager = new QueueManager();

// Lazy singleton for publishing data_ready events to downstream consumers (compliance, workflows)
let _realtimeQueue: Queue | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getRealtimeQueue(): Queue<any, any, string, any, any, string> {
  if (!_realtimeQueue) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _realtimeQueue = new Queue<any, any, string, any, any, string>(
      CoreQueueNames.IngestRealtime,
      {
        connection: getRedisConnection(),
        defaultJobOptions: { removeOnComplete: { age: 60 * 60 * 24 } },
      },
    );
  }
  return _realtimeQueue;
}
