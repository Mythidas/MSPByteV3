import type { Job } from 'bullmq';
import { getSupabase } from '../supabase.js';
import { queueManager, QueueNames } from '../lib/queue.js';
import { MetricsCollector } from '../lib/metrics.js';
import { Logger } from '../lib/logger.js';
import { JobScheduler } from '../scheduler/JobScheduler.js';
import { createSyncContext } from '../context.js';
import { CompletionTracker } from '../lib/completionTracker.js';
import type { EntityType, IntegrationId } from '../config.js';
import type { AnalysisJobData, SyncJobData } from '../types.js';
import type { BaseAdapter } from '../adapters/BaseAdapter.js';
import type { EntityProcessor } from '../processor/EntityProcessor.js';
import type { BaseLinker } from '../linkers/BaseLinker.js';
import type { DattoRMMLinker } from '../linkers/DattoRMMLinker.js';

/**
 * SyncWorker - Central orchestrator for a single (integrationId, entityType) pair.
 * Analysis is deferred to AnalysisWorker after all entity types complete.
 */
export class SyncWorker {
  private integrationId: IntegrationId;
  private entityType: EntityType;
  private adapter: BaseAdapter | null;
  private processor: EntityProcessor;
  private linker: BaseLinker | null;
  private started = false;

  constructor(
    integrationId: IntegrationId,
    entityType: EntityType,
    adapter: BaseAdapter | null,
    processor: EntityProcessor,
    linker: BaseLinker | null,
  ) {
    this.integrationId = integrationId;
    this.entityType = entityType;
    this.adapter = adapter;
    this.processor = processor;
    this.linker = linker;
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
    const metrics = new MetricsCollector();
    const supabase = getSupabase();

    Logger.log({
      module: 'SyncWorker',
      context: 'handleJob',
      message: `Starting sync for ${integrationId}:${entityType} (job ${syncJobId})`,
      level: 'info',
    });

    // Create SyncContext — shared state between phases
    const ctx = createSyncContext({
      tenantId,
      integrationId,
      integrationDbId,
      entityType,
      syncId,
      syncJobId,
      siteId: job.data.siteId ?? undefined,
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

      // 2. PROCESSOR: Hash-based upsert → returns processed Entity[]
      metrics.startStage('processor');
      const siteId = job.data.siteId ?? undefined;
      ctx.processedEntities = await this.processor.process(
        entities,
        tenantId,
        integrationId,
        entityType,
        syncId,
        metrics,
        siteId,
      );
      metrics.endStage('processor');

      // 3. LINKER: Optional relationship linking (uses SyncContext)
      if (this.linker) {
        metrics.startStage('linker');
        await this.linker.linkAndReconcile(ctx, metrics);

        // Track expected endpoint count for fan-out integrations (DattoRMM)
        if (entityType === 'company' && 'fanOutEndpointJobs' in this.linker) {
          const linker = this.linker as DattoRMMLinker;
          // fanOutEndpointJobs already ran inside linkAndReconcile,
          // count the expected endpoints from site_to_integration mappings
          const expectedCount = await this.getExpectedEndpointCount(
            tenantId,
            integrationDbId,
            metrics,
          );
          if (expectedCount > 0) {
            await CompletionTracker.setExpectedCount(
              tenantId,
              integrationId,
              'endpoint',
              expectedCount,
            );
          }
        }

        metrics.endStage('linker');
      }

      // 4. Analysis is DEFERRED — track completion and trigger when all types done
      await this.trackCompletionAndMaybeAnalyze(job.data, metrics);

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

      await JobScheduler.scheduleNextSync(
        tenantId,
        integrationId as IntegrationId,
        entityType as EntityType,
        job.data.siteId,
      );

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

  private async trackCompletionAndMaybeAnalyze(
    jobData: SyncJobData,
    metrics: MetricsCollector,
  ): Promise<void> {
    const { tenantId, integrationId, integrationDbId, entityType, syncId } = jobData;

    const allComplete = await CompletionTracker.markComplete(
      tenantId,
      integrationId,
      entityType,
    );

    if (allComplete) {
      Logger.log({
        module: 'SyncWorker',
        context: 'trackCompletionAndMaybeAnalyze',
        message: `All entity types complete for ${integrationId}, enqueuing analysis`,
        level: 'info',
      });

      const analysisData: AnalysisJobData = {
        tenantId,
        integrationId: integrationId as IntegrationId,
        integrationDbId,
        syncId,
      };

      await queueManager.addJob(
        QueueNames.analysis(integrationId),
        analysisData,
        { jobId: `analysis-${tenantId}-${integrationId}-${Date.now()}` },
      );
    }
  }

  private async getExpectedEndpointCount(
    tenantId: string,
    integrationDbId: string,
    metrics: MetricsCollector,
  ): Promise<number> {
    const supabase = getSupabase();
    metrics.trackQuery();
    const { data, count } = await supabase
      .from('site_to_integration')
      .select('id', { count: 'exact', head: true })
      .eq('integration_id', integrationDbId)
      .eq('tenant_id', tenantId);
    return count ?? 0;
  }
}
