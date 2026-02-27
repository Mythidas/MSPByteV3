import { Logger } from '@workspace/shared/lib/utils/logger';
import { disconnectRedis } from './lib/redis.js';
import { queueManager } from './lib/queue.js';
import { EntityProcessor } from './processor/EntityProcessor.js';
import { JobScheduler } from './scheduler/JobScheduler.js';
import { JobReconciler } from './scheduler/JobReconciler.js';
import { SyncWorker } from './workers/SyncWorker.js';
import { DattoRMMAdapter } from './adapters/DattoRMMAdapter.js';
import { DattoRMMLinker } from './linkers/DattoRMMLinker.js';
import type { BaseAdapter } from './adapters/BaseAdapter.js';
import type { BaseLinker } from './linkers/BaseLinker.js';
import { SophosAdapter } from './adapters/SophosAdapter.js';
import { SophosLinker } from './linkers/SophosLinker.js';
import { Microsoft365Adapter } from './adapters/Microsoft365Adapter.js';
import { Microsoft365Linker } from './linkers/Microsoft365Linker.js';
import { IntegrationId, INTEGRATIONS } from '@workspace/shared/config/integrations.js';

// Task Automation system
import { TaskPipelineEngine } from './tasks/TaskPipelineEngine.js';
import { TaskWorker } from './tasks/TaskWorker.js';
import { TaskScheduler } from './tasks/TaskScheduler.js';
import { CoveAdapter } from './adapters/CoveAdapter.js';
import { CoveLinker } from './linkers/CoveLinker.js';

/**
 * Pipeline Entry Point
 *
 * Architecture:
 *   sync_jobs table → JobScheduler → BullMQ → SyncWorker.handleJob():
 *     1. adapter.fetchAll()
 *     2. processor.process()
 *     3. linker.linkAndReconcile()  (optional)
 *
 *   workflows table → TaskReconciler → tasks table → TaskScheduler → BullMQ → TaskWorker:
 *     Executes workflow stages via StageDispatcher → service/entity queries → alert/tag evaluation
 */
async function main() {
  Logger.level = (process.env.LOG_LEVEL as any) || 'info';

  Logger.info({
    module: 'Pipeline',
    context: 'main',
    message: 'Starting pipeline...',
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
  Logger.info({
    module: 'Pipeline',
    context: 'main',
    message: `Recovered ${recovered} stuck jobs`,
  });

  // Concrete adapters and linkers keyed by integrationId
  const adapters: Partial<Record<IntegrationId, BaseAdapter>> = {
    dattormm: new DattoRMMAdapter(),
    'sophos-partner': new SophosAdapter(),
    'microsoft-365': new Microsoft365Adapter(),
    cove: new CoveAdapter(),
  };

  const linkers: Partial<Record<IntegrationId, BaseLinker>> = {
    dattormm: new DattoRMMLinker(),
    'sophos-partner': new SophosLinker(),
    'microsoft-365': new Microsoft365Linker(),
    cove: new CoveLinker(),
  };

  // Shared services
  const processor = new EntityProcessor();

  // Create SyncWorker for each (integrationId, entityType) pair
  const workers: SyncWorker[] = [];

  for (const [, config] of Object.entries(INTEGRATIONS)) {
    for (const typeConfig of config.supportedTypes) {
      const worker = new SyncWorker(
        config.id,
        typeConfig.type,
        adapters[config.id] || null,
        processor,
        linkers[config.id] || null
      );
      worker.start();
      workers.push(worker);
    }
  }

  Logger.info({
    module: 'Pipeline',
    context: 'main',
    message: `Started ${workers.length} sync workers`,
  });

  // Start job reconciler — ensures missing sync_jobs are created
  const reconciler = new JobReconciler();
  await reconciler.reconcile();
  reconciler.start();

  // Start scheduler for sync jobs
  const scheduler = new JobScheduler();
  scheduler.start();

  // Task Automation system
  const taskEngine = new TaskPipelineEngine();
  const taskWorker = new TaskWorker(taskEngine);
  taskWorker.start();

  const taskScheduler = new TaskScheduler();
  taskScheduler.start();

  // Task reconciler — seeds per-tenant tasks for all built-in workflows
  // const taskReconciler = new TaskReconciler();
  // await taskReconciler.reconcile();
  // taskReconciler.start();

  Logger.info({
    module: 'Pipeline',
    context: 'main',
    message: 'Pipeline started successfully. Press Ctrl+C to stop.',
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    Logger.info({
      module: 'Pipeline',
      context: 'shutdown',
      message: `Received ${signal}, shutting down gracefully...`,
    });

    try {
      reconciler.stop();
      scheduler.stop();
      taskScheduler.stop();
      // taskReconciler.stop();
      await queueManager.closeAll();
      await disconnectRedis();

      Logger.info({
        module: 'Pipeline',
        context: 'shutdown',
        message: 'Graceful shutdown complete',
      });

      process.exit(0);
    } catch (error) {
      Logger.error({
        module: 'Pipeline',
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
    module: 'Pipeline',
    context: 'main',
    message: `Fatal error: ${error}`,
  });
  console.error('Fatal error:', error);
  process.exit(1);
});
