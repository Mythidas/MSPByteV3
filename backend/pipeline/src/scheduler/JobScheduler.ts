import { getSupabase } from '../supabase.js';
import { queueManager, QueueNames } from '../lib/queue.js';
import { Logger } from '../lib/logger.js';
import { INTEGRATION_CONFIGS, type IntegrationId, type EntityType } from '../config.js';
import type { SyncJobData } from '../types.js';
import { Tables } from '@workspace/shared/types/database.js';

const POLL_INTERVAL_MS = 15000;

/**
 * JobScheduler - Polls sync_jobs table for pending jobs and dispatches to BullMQ.
 * Uses jobId for idempotent dispatch. Requires entity_type to be set (no fan-out).
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

  private async dispatchJob(syncJob: Tables<'public', 'sync_jobs'>): Promise<void> {
    const supabase = getSupabase();
    const integrationId = syncJob.integration_id as IntegrationId;
    const entityType = syncJob.entity_type as EntityType | null;

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

    // Require entity_type — no fan-out from null
    if (!entityType) {
      Logger.log({
        module: 'JobScheduler',
        context: 'dispatchJob',
        message: `Skipping sync_job ${syncJob.id}: entity_type is required`,
        level: 'warn',
      });
      return;
    }

    // Get integration DB record
    const { data: integration } = await supabase
      .from('integrations')
      .select('id')
      .eq('id', syncJob.integration_id)
      .eq('tenant_id', syncJob.tenant_id)
      .single();

    const integrationDbId = integration?.id || syncJob.integration_id;
    const queueName = QueueNames.sync(integrationId, entityType);
    const typeConfig = config.supportedTypes.find((t) => t.type === entityType);

    const jobData: SyncJobData = {
      tenantId: syncJob.tenant_id,
      integrationId,
      integrationDbId,
      entityType,
      syncId: syncJob.sync_id,
      syncJobId: syncJob.id,
      siteId: syncJob.site_id,
    };

    // Idempotent dispatch via jobId
    const bullmqJob = await queueManager.addJob(queueName, jobData, {
      priority: typeConfig?.priority || syncJob.priority,
      jobId: String(syncJob.id),
    });

    Logger.log({
      module: 'JobScheduler',
      context: 'dispatchJob',
      message: `Dispatched ${integrationId}:${entityType} → BullMQ job ${bullmqJob.id}`,
      level: 'info',
    });

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
   * On startup, reset running/queued jobs to pending so they get re-dispatched.
   */
  static async recoverStuckJobs(): Promise<number> {
    const supabase = getSupabase();

    const { data: stuckJobs, error } = await supabase
      .from('sync_jobs')
      .select('id')
      .in('status', ['running', 'queued']);

    if (error) {
      Logger.log({
        module: 'JobScheduler',
        context: 'recoverStuckJobs',
        message: `Error finding stuck jobs: ${error.message}`,
        level: 'error',
      });
      return 0;
    }

    if (!stuckJobs || stuckJobs.length === 0) return 0;

    const ids = stuckJobs.map((j) => j.id);
    await supabase
      .from('sync_jobs')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .in('id', ids);

    Logger.log({
      module: 'JobScheduler',
      context: 'recoverStuckJobs',
      message: `Recovered ${ids.length} stuck jobs (reset to pending)`,
      level: 'info',
    });

    return ids.length;
  }

  /**
   * Inserts a new pending sync_jobs row for the next scheduled run.
   */
  static async scheduleNextSync(
    tenantId: string,
    integrationId: IntegrationId,
    entityType: EntityType
  ): Promise<void> {
    const config = INTEGRATION_CONFIGS[integrationId];
    if (!config) return;

    const typeConfig = config.supportedTypes.find((t) => t.type === entityType);
    if (!typeConfig) return;

    const supabase = getSupabase();
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
