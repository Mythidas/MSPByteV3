import { Logger } from '@workspace/shared/lib/utils/logger.js';
import { queueManager } from './lib/queue.js';
import { disconnectRedis } from './lib/redis.js';
import { TaskWorker } from './worker.js';
import { TaskScheduler } from './scheduler/index.js';

// Register all registry entries on startup
import './registry/queries/index.js';
import './registry/actions/index.js';
import './registry/templates/index.js';

/**
 * Workflows Engine Entry Point
 *
 * Architecture:
 *   tasks table → TaskScheduler → BullMQ (queue: 'tasks') → TaskWorker → executeRun
 *   Manual runs: task_runs row inserted by frontend → BullMQ via /api/pipeline/execute-run → executeRun
 */
async function main() {
  Logger.level = (process.env.LOG_LEVEL as any) || 'info';

  Logger.info({
    module: 'Workflows',
    context: 'main',
    message: 'Starting workflow engine...',
  });

  const required = ['PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'REDIS_HOST', 'REDIS_PORT'];
  for (const envVar of required) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  const worker = new TaskWorker();
  worker.start();

  const scheduler = new TaskScheduler();
  scheduler.start();

  Logger.info({
    module: 'Workflows',
    context: 'main',
    message: 'Workflow engine started. Press Ctrl+C to stop.',
  });

  const shutdown = async (signal: string) => {
    Logger.info({
      module: 'Workflows',
      context: 'shutdown',
      message: `Received ${signal}, shutting down gracefully...`,
    });

    try {
      scheduler.stop();
      await queueManager.closeAll();
      await disconnectRedis();

      Logger.info({
        module: 'Workflows',
        context: 'shutdown',
        message: 'Graceful shutdown complete',
      });

      process.exit(0);
    } catch (err) {
      Logger.error({
        module: 'Workflows',
        context: 'shutdown',
        message: `Error during shutdown: ${err}`,
      });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  Logger.fatal({
    module: 'Workflows',
    context: 'main',
    message: `Fatal error: ${err}`,
  });
  console.error('Fatal error:', err);
  process.exit(1);
});
