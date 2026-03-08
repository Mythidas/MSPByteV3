import { Logger } from '@workspace/shared/lib/utils/logger';
import { disconnectRedis } from './redis.js';
import { initQueues, workflowRunQueue, workflowSchedulerQueue } from './queues/index.js';
import { initWorkers } from './workers/index.js';
import { getAllNodes } from './registry/index.js';

async function main() {
  Logger.level = (process.env.LOG_LEVEL as any) || 'info';

  Logger.info({ module: 'workflows', context: 'engine', message: 'starting workflow engine' });

  const required = ['REDIS_HOST', 'PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
  for (const envVar of required) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  await initQueues();
  const { runWorker, schedulerWorker } = initWorkers();

  const nodeCount = getAllNodes().length;
  Logger.info({ module: 'workflows', context: 'registry', message: `${nodeCount} nodes registered` });

  Logger.info({ module: 'workflows', context: 'engine', message: 'ready' });

  const shutdown = async (signal: string) => {
    Logger.info({
      module: 'workflows',
      context: 'engine',
      message: `received ${signal}, shutting down`,
    });

    try {
      Logger.info({ module: 'workflows', context: 'engine', message: 'closing workers' });
      await runWorker.close();
      await schedulerWorker.close();

      Logger.info({ module: 'workflows', context: 'engine', message: 'closing queues' });
      await workflowRunQueue.close();
      await workflowSchedulerQueue.close();

      await disconnectRedis();

      Logger.info({ module: 'workflows', context: 'engine', message: 'shutdown complete' });
      process.exit(0);
    } catch (err) {
      Logger.error({
        module: 'workflows',
        context: 'engine',
        message: `error during shutdown: ${err}`,
      });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  Logger.fatal({ module: 'workflows', context: 'engine', message: `fatal error: ${err}` });
  console.error('Fatal error:', err);
  process.exit(1);
});
