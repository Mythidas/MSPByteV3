import { Logger } from './lib/logger.js';
import { redis } from './lib/redis.js';
import { queueManager } from './lib/queue.js';

// Adapters
import { AutoTaskAdapter } from './adapters/AutoTaskAdapter.js';
import { SophosAdapter } from './adapters/SophosAdapter.js';
import { DattoRMMAdapter } from './adapters/DattoRMMAdapter.js';
import { CoveAdapter } from './adapters/CoveAdapter.js';
import { Microsoft365Adapter } from './adapters/Microsoft365Adapter.js';
import { HaloPSAAdapter } from './adapters/HaloPSAAdapter.js';

// Processor
import { EntityProcessor } from './processor/EntityProcessor.js';

// Linkers
import { Microsoft365Linker } from './linkers/Microsoft365Linker.js';

// Analyzers
import { AnalysisOrchestrator } from './analyzers/AnalysisOrchestrator.js';
import { MFAAnalyzer } from './analyzers/analyzers/MFAAnalyzer.js';
import { StaleUserAnalyzer } from './analyzers/analyzers/StaleUserAnalyzer.js';
import { TamperProtectionAnalyzer } from './analyzers/analyzers/TamperProtectionAnalyzer.js';
import { BackupComplianceAnalyzer } from './analyzers/analyzers/BackupComplianceAnalyzer.js';

// Scheduler
import { JobScheduler } from './scheduler/JobScheduler.js';

/**
 * Pipeline Entry Point
 *
 * Flow: sync_jobs table → JobScheduler → BullMQ →
 *   Adapter → Processor → Linker → Analyzer → sync_jobs (completed)
 */
async function main() {
  Logger.level = (process.env.LOG_LEVEL as any) || 'warn';

  Logger.log({
    module: 'Pipeline',
    context: 'main',
    message: 'Starting pipeline...',
    level: 'info',
  });

  // Validate environment
  const required = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'REDIS_HOST', 'REDIS_PORT'];
  for (const envVar of required) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  // ============================================================================
  // STEP 1: Initialize Adapters
  // ============================================================================
  Logger.log({ module: 'Pipeline', context: 'main', message: 'Initializing adapters...', level: 'info' });

  const autotaskAdapter = new AutoTaskAdapter();
  autotaskAdapter.startWorkerForType('company');
  autotaskAdapter.startWorkerForType('contract');
  autotaskAdapter.startWorkerForType('contract_service');

  const sophosAdapter = new SophosAdapter();
  sophosAdapter.startWorkerForType('endpoint');
  sophosAdapter.startWorkerForType('firewall');
  sophosAdapter.startWorkerForType('license');

  const dattoRMMAdapter = new DattoRMMAdapter();
  dattoRMMAdapter.startWorkerForType('device_site');
  dattoRMMAdapter.startWorkerForType('endpoint');

  const coveAdapter = new CoveAdapter();
  coveAdapter.startWorkerForType('backup_customer');
  coveAdapter.startWorkerForType('backup_device');

  const microsoft365Adapter = new Microsoft365Adapter();
  microsoft365Adapter.startWorkerForType('identity');
  microsoft365Adapter.startWorkerForType('group');
  microsoft365Adapter.startWorkerForType('license');
  microsoft365Adapter.startWorkerForType('role');
  microsoft365Adapter.startWorkerForType('policy');

  const halopsaAdapter = new HaloPSAAdapter();
  halopsaAdapter.startWorkerForType('company');
  halopsaAdapter.startWorkerForType('ticket');

  Logger.log({ module: 'Pipeline', context: 'main', message: 'Adapters initialized', level: 'info' });

  // ============================================================================
  // STEP 2: Initialize Processor
  // ============================================================================
  const entityProcessor = new EntityProcessor();
  entityProcessor.start();
  Logger.log({ module: 'Pipeline', context: 'main', message: 'Entity processor initialized', level: 'info' });

  // ============================================================================
  // STEP 3: Initialize Linkers
  // ============================================================================
  const microsoft365Linker = new Microsoft365Linker();
  microsoft365Linker.start();
  Logger.log({ module: 'Pipeline', context: 'main', message: 'Linkers initialized', level: 'info' });

  // ============================================================================
  // STEP 4: Initialize Analyzers
  // ============================================================================
  const analyzers = [
    new MFAAnalyzer(),
    new StaleUserAnalyzer(),
    new TamperProtectionAnalyzer(),
    new BackupComplianceAnalyzer(),
  ];

  const analysisOrchestrator = new AnalysisOrchestrator(analyzers);
  analysisOrchestrator.start();
  Logger.log({
    module: 'Pipeline',
    context: 'main',
    message: `Analysis orchestrator initialized with ${analyzers.length} analyzers`,
    level: 'info',
  });

  // ============================================================================
  // STEP 5: Start Job Scheduler (polls sync_jobs table)
  // ============================================================================
  const scheduler = new JobScheduler();
  scheduler.start();
  Logger.log({ module: 'Pipeline', context: 'main', message: 'Job scheduler started', level: 'info' });

  // ============================================================================
  // STEP 6: Graceful Shutdown
  // ============================================================================
  const shutdown = async (signal: string) => {
    Logger.log({
      module: 'Pipeline',
      context: 'shutdown',
      message: `Received ${signal}, shutting down gracefully...`,
      level: 'info',
    });

    try {
      scheduler.stop();

      await Promise.all([
        autotaskAdapter.stop(),
        sophosAdapter.stop(),
        dattoRMMAdapter.stop(),
        coveAdapter.stop(),
        microsoft365Adapter.stop(),
        halopsaAdapter.stop(),
        microsoft365Linker.stop(),
        analysisOrchestrator.stop(),
      ]);

      await queueManager.closeAll();
      await redis.disconnect();

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

  Logger.log({
    module: 'Pipeline',
    context: 'main',
    message: 'Pipeline started successfully. Press Ctrl+C to stop.',
    level: 'info',
  });
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
