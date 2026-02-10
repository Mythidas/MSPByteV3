import { Job, Worker } from 'bullmq';
import { QueueNames, queueManager } from '../lib/queue.js';
import { MetricsCollector } from '../lib/metrics.js';
import { Logger } from '../lib/logger.js';
import { getSupabase } from '../supabase.js';
import { INTEGRATION_CONFIGS, type IntegrationId, type EntityType } from '../config.js';
import type { AdapterFetchResult, RawEntity, SyncJobData } from '../types.js';

/**
 * BaseAdapter - Abstract base class for all integration adapters.
 * Subscribes to BullMQ sync queues, fetches data via concrete adapters,
 * publishes to the process queue, and handles pagination + scheduling.
 */
export abstract class BaseAdapter {
  protected metrics: MetricsCollector;
  protected integrationId: IntegrationId;
  private workers: Map<EntityType, Worker<SyncJobData>> = new Map();

  constructor(integrationId: IntegrationId) {
    this.metrics = new MetricsCollector();
    this.integrationId = integrationId;
  }

  startWorkerForType(entityType: EntityType): void {
    if (this.workers.has(entityType)) {
      Logger.log({
        module: 'BaseAdapter',
        context: 'startWorkerForType',
        message: `Worker already exists for ${this.integrationId}:${entityType}`,
        level: 'warn',
      });
      return;
    }

    const queueName = QueueNames.sync(this.integrationId, entityType);
    const worker = queueManager.createWorker<SyncJobData>(
      queueName,
      this.handleSyncJob.bind(this),
      { concurrency: 50 },
    );

    this.workers.set(entityType, worker);

    Logger.log({
      module: 'BaseAdapter',
      context: 'startWorkerForType',
      message: `${this.getAdapterName()} started worker for ${this.integrationId}:${entityType}`,
      level: 'info',
    });
  }

  private async handleSyncJob(job: Job<SyncJobData>): Promise<void> {
    const { tenantId, integrationId, entityType, batchNumber = 0, syncId, syncJobId } = job.data;
    const startedAt = job.data.startedAt || (batchNumber === 0 ? Date.now() : undefined);

    this.metrics.reset();
    this.metrics.startStage('adapter');

    // Update sync_job status to running
    const supabase = getSupabase();
    await supabase
      .from('sync_jobs')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', syncJobId);

    Logger.log({
      module: 'BaseAdapter',
      context: 'handleSyncJob',
      message: `Starting sync for ${integrationId}:${entityType} (batch ${batchNumber})`,
      level: 'info',
    });

    try {
      this.metrics.trackApiCall();
      const result = await this.fetchData(job.data);

      Logger.log({
        module: 'BaseAdapter',
        context: 'handleSyncJob',
        message: `Fetched ${result.entities.length} ${entityType} entities`,
        level: 'trace',
      });

      if (result.entities.length > 0) {
        await this.publishToProcessor(job.data, result.entities, startedAt);
      }

      if (result.pagination?.hasMore) {
        await this.scheduleNextBatch(job.data, result.pagination.cursor, batchNumber + 1, startedAt);
      }

      this.metrics.endStage('adapter');
    } catch (error) {
      this.metrics.trackError(error as Error, job.attemptsMade);
      this.metrics.endStage('adapter');

      Logger.log({
        module: 'BaseAdapter',
        context: 'handleSyncJob',
        message: `Sync failed: ${error}`,
        level: 'error',
      });

      throw error;
    }
  }

  protected abstract fetchData(jobData: SyncJobData): Promise<AdapterFetchResult>;
  protected abstract getAdapterName(): string;

  /**
   * Load integration config from Supabase. Returns the JSON config object.
   */
  protected async getIntegrationConfig(integrationDbId: string): Promise<any> {
    const supabase = getSupabase();
    this.metrics.trackQuery();
    const { data, error } = await supabase
      .from('integrations')
      .select('config')
      .eq('id', integrationDbId)
      .single();

    if (error || !data) {
      throw new Error(`Integration config not found: ${integrationDbId}`);
    }

    return data.config;
  }

  private async publishToProcessor(
    jobData: SyncJobData,
    entities: RawEntity[],
    startedAt?: number,
  ): Promise<void> {
    await queueManager.addJob(
      QueueNames.process,
      {
        tenantId: jobData.tenantId,
        integrationId: jobData.integrationId,
        integrationDbId: jobData.integrationDbId,
        entityType: jobData.entityType,
        entities,
        syncId: jobData.syncId,
        syncJobId: jobData.syncJobId,
        siteId: entities[0]?.siteId,
        startedAt,
        metrics: this.metrics.toJSON(),
      },
      { priority: 5 },
    );

    Logger.log({
      module: 'BaseAdapter',
      context: 'publishToProcessor',
      message: `Published ${entities.length} entities to processor`,
      level: 'trace',
    });
  }

  private async scheduleNextBatch(
    currentJobData: SyncJobData,
    cursor: string | undefined,
    batchNumber: number,
    startedAt?: number,
  ): Promise<void> {
    const queueName = QueueNames.sync(this.integrationId, currentJobData.entityType);

    await queueManager.addJob(
      queueName,
      { ...currentJobData, cursor, batchNumber, startedAt },
      { priority: 5 },
    );

    Logger.log({
      module: 'BaseAdapter',
      context: 'scheduleNextBatch',
      message: `Scheduled batch ${batchNumber} with cursor`,
      level: 'trace',
    });
  }

  async stop(): Promise<void> {
    for (const [entityType, worker] of this.workers.entries()) {
      await worker.close();
      Logger.log({
        module: 'BaseAdapter',
        context: 'stop',
        message: `${this.getAdapterName()} stopped worker for ${entityType}`,
        level: 'info',
      });
    }
    this.workers.clear();
  }
}
