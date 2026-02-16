import { Logger } from './lib/logger.js';
import { disconnectRedis } from './lib/redis.js';
import { queueManager } from './lib/queue.js';
import { INTEGRATION_CONFIGS, type IntegrationId } from './config.js';
import { EntityProcessor } from './processor/EntityProcessor.js';
import { AnalysisOrchestrator } from './analyzers/AnalysisOrchestrator.js';
import { JobScheduler } from './scheduler/JobScheduler.js';
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

  // Concrete adapters and linkers keyed by integrationId
  const adapters: Partial<Record<IntegrationId, BaseAdapter>> = {
    dattormm: new DattoRMMAdapter(),
    'sophos-partner': new SophosAdapter(),
  };

  const linkers: Partial<Record<IntegrationId, BaseLinker>> = {
    dattormm: new DattoRMMLinker(),
    'sophos-partner': new SophosLinker(),
  };

  // Shared services
  const processor = new EntityProcessor();
  const orchestrator = new AnalysisOrchestrator([new DattoRMMAnalyzer(), new SophosAnalyzer()]);

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

  Logger.log({
    module: 'Pipeline',
    context: 'main',
    message: `Started ${workers.length} sync workers`,
    level: 'info',
  });

  // Create one AnalysisWorker per integration
  const analysisWorkers: AnalysisWorker[] = [];
  for (const [, config] of Object.entries(INTEGRATION_CONFIGS)) {
    const analysisWorker = new AnalysisWorker(config.id, orchestrator);
    analysisWorker.start();
    analysisWorkers.push(analysisWorker);
  }

  Logger.log({
    module: 'Pipeline',
    context: 'main',
    message: `Started ${analysisWorkers.length} analysis workers`,
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
