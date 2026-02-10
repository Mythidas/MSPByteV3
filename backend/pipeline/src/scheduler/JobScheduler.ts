import { getSupabase } from '../supabase.js';
import { queueManager, QueueNames } from '../lib/queue.js';
import { Logger } from '../lib/logger.js';
import { INTEGRATION_CONFIGS, type IntegrationId, type EntityType } from '../config.js';
import type { SyncJobData } from '../types.js';

const POLL_INTERVAL_MS = 5000;

/**
 * JobScheduler - Polls sync_jobs table for pending jobs and creates BullMQ jobs.
 * After completion, inserts a new row with trigger='scheduled' for recurring syncs.
 */
export class JobScheduler {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;

  start(): void {
    Logger.log({
      module: 'JobScheduler',
      context: 'start',
      message: `Starting scheduler (polling every ${POLL_INTERVAL_MS}ms)`,
      level: 'info',
    });

    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    // Immediate first poll
    this.poll();
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    Logger.log({
      module: 'JobScheduler',
      context: 'stop',
      message: 'Scheduler stopped',
      level: 'info',
    });
  }

  private async poll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const supabase = getSupabase();

      // Find pending jobs ready to run
      const { data: pendingJobs, error } = await supabase
        .from('sync_jobs')
        .select('*')
        .eq('status', 'pending')
        .or('scheduled_for.is.null,scheduled_for.lte.' + new Date().toISOString())
        .order('priority', { ascending: true })
        .limit(20);

      if (error) {
        Logger.log({
          module: 'JobScheduler',
          context: 'poll',
          message: `Error polling sync_jobs: ${error.message}`,
          level: 'error',
        });
        return;
      }

      if (!pendingJobs || pendingJobs.length === 0) return;

      Logger.log({
        module: 'JobScheduler',
        context: 'poll',
        message: `Found ${pendingJobs.length} pending jobs`,
        level: 'trace',
      });

      for (const job of pendingJobs) {
        await this.dispatchJob(job);
      }
    } catch (err) {
      Logger.log({
        module: 'JobScheduler',
        context: 'poll',
        message: `Poll error: ${err}`,
        level: 'error',
      });
    } finally {
      this.isPolling = false;
    }
  }

  private async dispatchJob(syncJob: any): Promise<void> {
    const supabase = getSupabase();
    const integrationId = syncJob.integration_id as IntegrationId;
    const config = INTEGRATION_CONFIGS[integrationId];

    if (!config) {
      Logger.log({
        module: 'JobScheduler',
        context: 'dispatchJob',
        message: `Unknown integration: ${integrationId}`,
        level: 'warn',
      });
      return;
    }

    // Determine entity types to sync
    const entityTypes: EntityType[] = syncJob.entity_type
      ? [syncJob.entity_type as EntityType]
      : config.supportedTypes.map((t) => t.type);

    // Get integration DB record to pass config to adapters
    const { data: integration } = await supabase
      .from('integrations')
      .select('id')
      .eq('id', syncJob.integration_id)
      .eq('tenant_id', syncJob.tenant_id)
      .single();

    const integrationDbId = integration?.id || syncJob.integration_id;

    for (const entityType of entityTypes) {
      const queueName = QueueNames.sync(integrationId, entityType);
      const typeConfig = config.supportedTypes.find((t) => t.type === entityType);

      const jobData: SyncJobData = {
        tenantId: syncJob.tenant_id,
        integrationId,
        integrationDbId,
        entityType,
        syncId: syncJob.sync_id,
        syncJobId: syncJob.id,
        batchNumber: 0,
      };

      const bullmqJob = await queueManager.addJob(queueName, jobData, {
        priority: typeConfig?.priority || syncJob.priority,
      });

      Logger.log({
        module: 'JobScheduler',
        context: 'dispatchJob',
        message: `Dispatched ${integrationId}:${entityType} → BullMQ job ${bullmqJob.id}`,
        level: 'info',
      });
    }

    // Update sync_job status to 'queued'
    await supabase
      .from('sync_jobs')
      .update({
        status: 'queued',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', syncJob.id);
  }

  /**
   * Called by the analyzer when a sync completes.
   * Inserts a new sync_jobs row for the next scheduled run.
   */
  static async scheduleNextSync(
    tenantId: number,
    integrationId: IntegrationId,
    entityType?: EntityType,
  ): Promise<void> {
    const config = INTEGRATION_CONFIGS[integrationId];
    if (!config) return;

    const typesToSchedule = entityType
      ? config.supportedTypes.filter((t) => t.type === entityType)
      : config.supportedTypes;

    const supabase = getSupabase();

    for (const typeConfig of typesToSchedule) {
      const scheduledFor = new Date(Date.now() + typeConfig.rateMinutes * 60 * 1000).toISOString();

      await supabase.from('sync_jobs').insert({
        tenant_id: tenantId,
        integration_id: integrationId,
        entity_type: typeConfig.type,
        status: 'pending',
        priority: typeConfig.priority,
        trigger: 'scheduled',
        scheduled_for: scheduledFor,
      });

      Logger.log({
        module: 'JobScheduler',
        context: 'scheduleNextSync',
        message: `Scheduled next ${integrationId}:${typeConfig.type} in ${typeConfig.rateMinutes}m`,
        level: 'info',
      });
    }
  }
}
