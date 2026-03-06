import { Logger } from '@workspace/shared/lib/utils/logger';
import { disconnectRedis } from './lib/redis.js';
import { queueManager } from './lib/queue.js';
import { Microsoft365Adapter } from './adapters/Microsoft365Adapter.js';
import { M365Processor } from './processors/M365Processor.js';
import { Microsoft365Linker } from './linkers/Microsoft365Linker.js';
import { JobScheduler } from './scheduler/JobScheduler.js';
import { JobReconciler } from './scheduler/JobReconciler.js';
import { SyncWorker } from './workers/SyncWorker.js';
import { M365_TYPES, type M365EntityType } from './types.js';

async function main() {
  Logger.level = (process.env.LOG_LEVEL as any) || 'info';

  Logger.info({
    module: 'Ingestor',
    context: 'main',
    message: 'Starting M365 ingestor...',
  });

  const required = ['PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'REDIS_HOST', 'REDIS_PORT'];
  for (const envVar of required) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  // Recover stuck jobs from previous crash
  const recovered = await JobScheduler.recoverStuckJobs();
  Logger.info({
    module: 'Ingestor',
    context: 'main',
    message: `Recovered ${recovered} stuck jobs`,
  });

  const adapter = new Microsoft365Adapter();
  const processor = new M365Processor();
  const linker = new Microsoft365Linker();

  // Start one worker per entity type; linker only runs for identity
  const workers: SyncWorker[] = [];
  for (const ingestType of M365_TYPES) {
    const worker = new SyncWorker(
      ingestType,
      adapter,
      processor,
      ingestType === 'identity' ? linker : null
    );
    worker.start();
    workers.push(worker);
  }

  Logger.info({
    module: 'Ingestor',
    context: 'main',
    message: `Started ${workers.length} workers (${M365_TYPES.join(', ')})`,
  });

  // Reconciler ensures ingest_jobs exist for every active link × type
  const reconciler = new JobReconciler();
  await reconciler.reconcile();
  reconciler.start();

  // Scheduler dispatches pending jobs to BullMQ
  const scheduler = new JobScheduler();
  scheduler.start();

  Logger.info({
    module: 'Ingestor',
    context: 'main',
    message: 'Ingestor started. Press Ctrl+C to stop.',
  });

  const shutdown = async (signal: string) => {
    Logger.info({
      module: 'Ingestor',
      context: 'shutdown',
      message: `Received ${signal}, shutting down gracefully...`,
    });

    try {
      reconciler.stop();
      scheduler.stop();
      await queueManager.closeAll();
      await disconnectRedis();

      Logger.info({
        module: 'Ingestor',
        context: 'shutdown',
        message: 'Graceful shutdown complete',
      });

      process.exit(0);
    } catch (error) {
      Logger.error({
        module: 'Ingestor',
        context: 'shutdown',
        message: `Error during shutdown: ${error}`,
      });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  Logger.fatal({
    module: 'Ingestor',
    context: 'main',
    message: `Fatal error: ${error}`,
  });
  console.error('Fatal error:', error);
  process.exit(1);
});
