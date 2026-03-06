import { getSupabase } from '../supabase.js';
import { queueManager, QueueNames } from '../lib/queue.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import type { IngestJobData, M365EntityType } from '../types.js';

const POLL_INTERVAL_MS = 15000;
const CLEANUP_THROTTLE_MS = 60 * 60 * 1000; // 1 hour
const JOB_RETENTION_DAYS = 7;

// Rate in minutes per entity type
const RATE_MINUTES: Record<M365EntityType, number> = {
  identity: 60,
  group: 120,
  role: 240,
  policy: 120,
  license: 120,
  'exchange-config': 240,
};

/**
 * JobScheduler — polls ingest_jobs for pending rows, dispatches to BullMQ ingest.* queues.
 */
export class JobScheduler {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  private lastCleanupAt = 0;

  start(): void {
    Logger.info({
      module: 'JobScheduler',
      context: 'start',
      message: `Starting scheduler (polling every ${POLL_INTERVAL_MS}ms)`,
    });

    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    this.poll();
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    Logger.info({ module: 'JobScheduler', context: 'stop', message: 'Scheduler stopped' });
  }

  private async poll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const supabase = getSupabase();

      const { data: pendingJobs, error } = await supabase.from('ingest_jobs')
        .select('*')
        .eq('status', 'pending')
        .or('scheduled_for.is.null,scheduled_for.lte.' + new Date().toISOString())
        .order('priority', { ascending: true })
        .limit(20);

      if (error) {
        Logger.error({
          module: 'JobScheduler',
          context: 'poll',
          message: `Error polling ingest_jobs: ${(error as any).message}`,
        });
        return;
      }

      if (!pendingJobs || pendingJobs.length === 0) return;

      Logger.trace({
        module: 'JobScheduler',
        context: 'poll',
        message: `Found ${pendingJobs.length} pending jobs`,
      });

      for (const job of pendingJobs) {
        await this.dispatchJob(job);
      }

      // Throttled cleanup
      const now = Date.now();
      if (now - this.lastCleanupAt >= CLEANUP_THROTTLE_MS) {
        this.lastCleanupAt = now;
        await JobScheduler.cleanupOldJobs();
      }
    } catch (err) {
      Logger.error({
        module: 'JobScheduler',
        context: 'poll',
        message: `Poll error: ${err}`,
      });
    } finally {
      this.isPolling = false;
    }
  }

  private async dispatchJob(ingestJob: any): Promise<void> {
    const supabase = getSupabase();
    const ingestType = ingestJob.ingest_type as M365EntityType;

    if (!ingestType) {
      Logger.warn({
        module: 'JobScheduler',
        context: 'dispatchJob',
        message: `Skipping ingest_job ${ingestJob.id}: ingest_type is required`,
      });
      return;
    }

    const queueName = QueueNames.ingest('microsoft-365', ingestType);

    const jobData: IngestJobData = {
      tenantId: ingestJob.tenant_id,
      integrationId: 'microsoft-365',
      ingestType,
      ingestId: ingestJob.ingest_id,
      jobId: ingestJob.id,
      linkId: ingestJob.link_id ?? null,
      siteId: ingestJob.site_id ?? null,
    };

    const bullmqJob = await queueManager.addJob(queueName, jobData, {
      priority: ingestJob.priority,
      jobId: String(ingestJob.id),
    });

    Logger.info({
      module: 'JobScheduler',
      context: 'dispatchJob',
      message: `Dispatched microsoft-365:${ingestType} → BullMQ job ${bullmqJob.id}`,
    });

    await supabase.from('ingest_jobs')
      .update({
        status: 'queued',
        bullmq_job_id: bullmqJob.id,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', ingestJob.id);
  }

  static async recoverStuckJobs(): Promise<number> {
    const supabase = getSupabase();

    const { data: stuckJobs, error } = await supabase.from('ingest_jobs')
      .select('id')
      .in('status', ['running', 'queued']);

    if (error) {
      Logger.error({
        module: 'JobScheduler',
        context: 'recoverStuckJobs',
        message: `Error finding stuck jobs: ${(error as any).message}`,
      });
      return 0;
    }

    if (!stuckJobs || stuckJobs.length === 0) return 0;

    const ids = stuckJobs.map((j: any) => j.id);
    await supabase.from('ingest_jobs')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .in('id', ids);

    Logger.info({
      module: 'JobScheduler',
      context: 'recoverStuckJobs',
      message: `Recovered ${ids.length} stuck jobs (reset to pending)`,
    });

    return ids.length;
  }

  static async cleanupOldJobs(): Promise<number> {
    const supabase = getSupabase();
    const cutoff = new Date(Date.now() - JOB_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase.from('ingest_jobs')
      .delete()
      .in('status', ['completed', 'failed'])
      .lt('completed_at', cutoff)
      .select('id');

    if (error) {
      Logger.error({
        module: 'JobScheduler',
        context: 'cleanupOldJobs',
        message: `Error cleaning up old jobs: ${(error as any).message}`,
      });
      return 0;
    }

    const count = data?.length ?? 0;
    if (count > 0) {
      Logger.info({
        module: 'JobScheduler',
        context: 'cleanupOldJobs',
        message: `Cleaned up ${count} old ingest_jobs (older than ${JOB_RETENTION_DAYS} days)`,
      });
    }

    return count;
  }

  static async scheduleNextIngest(
    tenantId: string,
    siteId: string | null,
    linkId: string | null,
    ingestType: M365EntityType,
    priority: number
  ): Promise<void> {
    const supabase = getSupabase();
    const rateMinutes = RATE_MINUTES[ingestType] ?? 120;
    const scheduledFor = new Date(Date.now() + rateMinutes * 60 * 1000).toISOString();

    await supabase.from('ingest_jobs').insert({
      tenant_id: tenantId,
      site_id: siteId,
      link_id: linkId,
      integration_id: 'microsoft-365',
      ingest_type: ingestType,
      status: 'pending',
      priority,
      trigger: 'scheduled',
      scheduled_for: scheduledFor,
    });

    Logger.info({
      module: 'JobScheduler',
      context: 'scheduleNextIngest',
      message: `Scheduled next ${ingestType} in ${rateMinutes}m`,
    });
  }
}
