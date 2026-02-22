import { Logger } from '@workspace/shared/lib/utils/logger';
import { disconnectRedis } from './lib/redis.js';
import { queueManager } from './lib/queue.js';
import { INTEGRATION_CONFIGS, type IntegrationId } from './config.js';
import { EntityProcessor } from './processor/EntityProcessor.js';
import { AnalysisOrchestrator } from './analyzers/AnalysisOrchestrator.js';
import { JobScheduler } from './scheduler/JobScheduler.js';
import { JobReconciler } from './scheduler/JobReconciler.js';
import { SyncWorker } from './workers/SyncWorker.js';
import { AnalysisWorker } from './workers/AnalysisWorker.js';
import { DattoRMMAdapter } from './adapters/DattoRMMAdapter.js';
import { DattoRMMLinker } from './linkers/DattoRMMLinker.js';
import { DattoRMMAnalyzer } from './analyzers/DattoRMMAnalyzer.js';
import type { BaseAdapter } from './adapters/BaseAdapter.js';
import type { BaseLinker } from './linkers/BaseLinker.js';
import { SophosAdapter } from './adapters/SophosAdapter.js';
import { SophosLinker } from './linkers/SophosLinker.js';
import { SophosAnalyzer } from './analyzers/SophosAnalyzer.js';
import { Microsoft365Adapter } from './adapters/Microsoft365Adapter.js';
import { Microsoft365Linker } from './linkers/Microsoft365Linker.js';
import { Microsoft365Analyzer } from './analyzers/Microsoft365Analyzer.js';

/**
 * Pipeline Entry Point
 *
 * Architecture:
 *   sync_jobs table → JobScheduler → BullMQ → SyncWorker.handleJob():
 *     1. adapter.fetchAll()
 *     2. processor.process()
 *     3. linker.linkAndReconcile()  (optional)
 *     4. track completion → enqueue analysis when all types done
 *   AnalysisWorker runs analysis once per integration after all syncs complete.
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
  };

  const linkers: Partial<Record<IntegrationId, BaseLinker>> = {
    dattormm: new DattoRMMLinker(),
    'sophos-partner': new SophosLinker(),
    'microsoft-365': new Microsoft365Linker(),
  };

  // Shared services
  const processor = new EntityProcessor();
  const orchestrator = new AnalysisOrchestrator([
    new DattoRMMAnalyzer(),
    new SophosAnalyzer(),
    new Microsoft365Analyzer(),
  ]);

  // Create SyncWorker for each (integrationId, entityType) pair
  const workers: SyncWorker[] = [];

  for (const [, config] of Object.entries(INTEGRATION_CONFIGS)) {
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

  // Create one AnalysisWorker per integration
  const analysisWorkers: AnalysisWorker[] = [];
  for (const [, config] of Object.entries(INTEGRATION_CONFIGS)) {
    const analysisWorker = new AnalysisWorker(config.id, orchestrator);
    analysisWorker.start();
    analysisWorkers.push(analysisWorker);
  }

  Logger.info({
    module: 'Pipeline',
    context: 'main',
    message: `Started ${analysisWorkers.length} analysis workers`,
  });

  // Start job reconciler — ensures missing jobs are created before the scheduler polls
  const reconciler = new JobReconciler();
  await reconciler.reconcile();
  reconciler.start();

  // Start job scheduler
  const scheduler = new JobScheduler();
  scheduler.start();

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
