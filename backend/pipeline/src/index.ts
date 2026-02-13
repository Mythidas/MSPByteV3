import { Logger } from './lib/logger.js';
import { disconnectRedis } from './lib/redis.js';
import { queueManager } from './lib/queue.js';
import { INTEGRATION_CONFIGS } from './config.js';
import { EntityProcessor } from './processor/EntityProcessor.js';
import { AnalysisOrchestrator } from './analyzers/AnalysisOrchestrator.js';
import { JobScheduler } from './scheduler/JobScheduler.js';
import { SyncWorker } from './workers/SyncWorker.js';

/**
 * Pipeline Entry Point
 *
 * Single-queue architecture:
 *   sync_jobs table → JobScheduler → BullMQ → SyncWorker.handleJob():
 *     1. adapter.fetchAll()
 *     2. processor.process()
 *     3. linker.linkAndReconcile()  (optional)
 *     4. orchestrator.analyze()
 *     5. mark completed + schedule next
 */
async function main() {
  Logger.level = (process.env.LOG_LEVEL as any) || 'info';

  Logger.log({
    module: 'Pipeline',
    context: 'main',
    message: 'Starting pipeline...',
    level: 'info',
  });

  // Validate environment
  const required = ['PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'REDIS_HOST', 'REDIS_PORT'];
  for (const envVar of required) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  // Recover stuck jobs from previous crash
  const recovered = await JobScheduler.recoverStuckJobs();
  Logger.log({
    module: 'Pipeline',
    context: 'main',
    message: `Recovered ${recovered} stuck jobs`,
    level: 'info',
  });

  // Shared services
  const processor = new EntityProcessor();
  const orchestrator = new AnalysisOrchestrator([]); // No concrete analyzers yet

  // Create SyncWorker for each (integrationId, entityType) pair
  const workers: SyncWorker[] = [];

  for (const [, config] of Object.entries(INTEGRATION_CONFIGS)) {
    for (const typeConfig of config.supportedTypes) {
      const worker = new SyncWorker(
        config.id,
        typeConfig.type,
        null, // No concrete adapters yet — will fail gracefully with error message
        processor,
        null, // No concrete linkers yet
        orchestrator,
      );
      worker.start();
      workers.push(worker);
    }
  }

  Logger.log({
    module: 'Pipeline',
    context: 'main',
    message: `Started ${workers.length} sync workers`,
    level: 'info',
  });

  // Start job scheduler
  const scheduler = new JobScheduler();
  scheduler.start();

  Logger.log({
    module: 'Pipeline',
    context: 'main',
    message: 'Pipeline started successfully. Press Ctrl+C to stop.',
    level: 'info',
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    Logger.log({
      module: 'Pipeline',
      context: 'shutdown',
      message: `Received ${signal}, shutting down gracefully...`,
      level: 'info',
    });

    try {
      scheduler.stop();
      await queueManager.closeAll();
      await disconnectRedis();

      Logger.log({
        module: 'Pipeline',
        context: 'shutdown',
        message: 'Graceful shutdown complete',
        level: 'info',
      });

      process.exit(0);
    } catch (error) {
      Logger.log({
        module: 'Pipeline',
        context: 'shutdown',
        message: `Error during shutdown: ${error}`,
        level: 'error',
      });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  Logger.log({
    module: 'Pipeline',
    context: 'main',
    message: `Fatal error: ${error}`,
    level: 'fatal',
  });
  console.error('Fatal error:', error);
  process.exit(1);
});
