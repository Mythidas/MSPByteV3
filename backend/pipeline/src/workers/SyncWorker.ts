import type { Job } from 'bullmq';
import { getSupabase } from '../supabase.js';
import { queueManager, QueueNames } from '../lib/queue.js';
import { MetricsCollector } from '../lib/metrics.js';
import { Logger } from '../lib/logger.js';
import { JobScheduler } from '../scheduler/JobScheduler.js';
import type { EntityType, IntegrationId } from '../config.js';
import type { SyncJobData } from '../types.js';
import type { BaseAdapter } from '../adapters/BaseAdapter.js';
import type { EntityProcessor } from '../processor/EntityProcessor.js';
import type { BaseLinker } from '../linkers/BaseLinker.js';
import type { AnalysisOrchestrator } from '../analyzers/AnalysisOrchestrator.js';

/**
 * SyncWorker - Central orchestrator for a single (integrationId, entityType) pair.
 * Replaces the old multi-queue hand-off design. All stages are function calls
 * within a single BullMQ job handler.
 */
export class SyncWorker {
  private integrationId: IntegrationId;
  private entityType: EntityType;
  private adapter: BaseAdapter | null;
  private processor: EntityProcessor;
  private linker: BaseLinker | null;
  private orchestrator: AnalysisOrchestrator;
  private started = false;

  constructor(
    integrationId: IntegrationId,
    entityType: EntityType,
    adapter: BaseAdapter | null,
    processor: EntityProcessor,
    linker: BaseLinker | null,
    orchestrator: AnalysisOrchestrator,
  ) {
    this.integrationId = integrationId;
    this.entityType = entityType;
    this.adapter = adapter;
    this.processor = processor;
    this.linker = linker;
    this.orchestrator = orchestrator;
  }

  start(): void {
    if (this.started) return;

    const queueName = QueueNames.sync(this.integrationId, this.entityType);
    queueManager.createWorker<SyncJobData>(queueName, this.handleJob.bind(this), {
      concurrency: 5,
    });

    this.started = true;
    Logger.log({
      module: 'SyncWorker',
      context: 'start',
      message: `Worker started for ${this.integrationId}:${this.entityType}`,
      level: 'info',
    });
  }

  private async handleJob(job: Job<SyncJobData>): Promise<void> {
    const { tenantId, integrationId, integrationDbId, entityType, syncId, syncJobId } = job.data;
    const metrics = new MetricsCollector(); // Fresh per job — no shared state
    const supabase = getSupabase();

    Logger.log({
      module: 'SyncWorker',
      context: 'handleJob',
      message: `Starting sync for ${integrationId}:${entityType} (job ${syncJobId})`,
      level: 'info',
    });

    // Mark running
    await supabase
      .from('sync_jobs')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', syncJobId);

    try {
      // 1. ADAPTER: Fetch all entities
      if (!this.adapter) {
        throw new Error(`No adapter registered for ${integrationId}:${entityType}`);
      }

      metrics.startStage('adapter');
      const entities = await this.adapter.fetchAll(job.data, metrics);
      metrics.endStage('adapter');

      Logger.log({
        module: 'SyncWorker',
        context: 'handleJob',
        message: `Fetched ${entities.length} entities`,
        level: 'info',
      });

      // 2. PROCESSOR: Hash-based upsert
      metrics.startStage('processor');
      const siteId = entities[0]?.siteId;
      await this.processor.process(entities, tenantId, integrationId, entityType, syncId, metrics, siteId);
      metrics.endStage('processor');

      // 3. LINKER: Optional relationship linking
      if (this.linker) {
        metrics.startStage('linker');
        await this.linker.linkAndReconcile(tenantId, integrationId, syncId, metrics);
        metrics.endStage('linker');
      }

      // 4. ANALYZER: Run all analyzers
      metrics.startStage('analyzer');
      await this.orchestrator.analyze(
        tenantId,
        integrationId,
        integrationDbId,
        syncId,
        metrics,
        siteId,
        entityType,
      );
      metrics.endStage('analyzer');

      // 5. Mark completed + schedule next
      const completedAt = new Date().toISOString();
      await supabase
        .from('sync_jobs')
        .update({
          status: 'completed',
          completed_at: completedAt,
          metrics: metrics.toJSON(),
          updated_at: completedAt,
        })
        .eq('id', syncJobId);

      await JobScheduler.scheduleNextSync(tenantId, integrationId as IntegrationId, entityType as EntityType);

      Logger.log({
        module: 'SyncWorker',
        context: 'handleJob',
        message: `Sync completed for ${integrationId}:${entityType} (job ${syncJobId})`,
        level: 'info',
      });
    } catch (error) {
      metrics.trackError(error as Error, job.attemptsMade);

      // Mark failed
      try {
        await supabase
          .from('sync_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            metrics: metrics.toJSON(),
            error: (error as Error).message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', syncJobId);
      } catch (updateError) {
        Logger.log({
          module: 'SyncWorker',
          context: 'handleJob',
          message: `Failed to update sync_job: ${updateError}`,
          level: 'error',
        });
      }

      Logger.log({
        module: 'SyncWorker',
        context: 'handleJob',
        message: `Sync failed for ${integrationId}:${entityType}: ${(error as Error).message}`,
        level: 'error',
      });

      throw error;
    }
  }
}
