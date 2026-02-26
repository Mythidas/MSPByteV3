import { getSupabase } from '../supabase.js';
import { queueManager, QueueNames } from '../lib/queue.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import type { BaseJob } from './BaseJob.js';
import type { QueryJobData } from './types.js';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const HISTORY_RETENTION_DAYS = 90;

/**
 * QueryJobScheduler — polls query_jobs for due rows, fans out per site/connection,
 * checks sync_jobs dependencies, enqueues BullMQ jobs.
 * Replaces the CompletionTracker-based analysis trigger.
 */
export class QueryJobScheduler {
  private jobs: BaseJob[];
  private timer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;

  constructor(jobs: BaseJob[]) {
    this.jobs = jobs;
  }

  start(): void {
    this.poll();
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    Logger.info({
      module: 'QueryJobScheduler',
      context: 'start',
      message: `Scheduler started (polling every ${POLL_INTERVAL_MS / 60000}m)`,
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const supabase = getSupabase();
      const now = new Date().toISOString();

      // Load due, enabled, idle query_jobs
      const { data: dueJobs, error } = await supabase
        .from('query_jobs')
        .select('*')
        .eq('enabled', true)
        .eq('status', 'idle')
        .lte('next_run_at', now);

      if (error) {
        Logger.error({
          module: 'QueryJobScheduler',
          context: 'poll',
          message: `Error polling query_jobs: ${error.message}`,
        });
        return;
      }

      if (!dueJobs || dueJobs.length === 0) return;

      Logger.trace({
        module: 'QueryJobScheduler',
        context: 'poll',
        message: `Found ${dueJobs.length} due query jobs`,
      });

      for (const jobRow of dueJobs) {
        await this.dispatchJob(jobRow);
      }

      // Cleanup old history
      await this.cleanupOldHistory();
    } catch (err) {
      Logger.error({
        module: 'QueryJobScheduler',
        context: 'poll',
        message: `Poll error: ${err}`,
      });
    } finally {
      this.isPolling = false;
    }
  }

  private async dispatchJob(jobRow: {
    id: string;
    name: string;
    integration_id: string;
    tenant_id: string;
    schedule_hours: number;
    depends_on: string[];
  }): Promise<void> {
    const supabase = getSupabase();
    const {
      id: queryJobId,
      name,
      integration_id: integrationId,
      tenant_id: tenantId,
      schedule_hours: scheduleHours,
      depends_on: dependsOn,
    } = jobRow;

    // Find the registered job to get scope
    const job = this.jobs.find(
      (j) => j.getName() === name && j.getIntegrationId() === integrationId
    );

    if (!job) {
      Logger.warn({
        module: 'QueryJobScheduler',
        context: 'dispatchJob',
        message: `No registered job for name=${name} integrationId=${integrationId}, skipping`,
      });
      return;
    }

    const scope = job.getScope();
    let enqueued = 0;

    if (scope === 'site') {
      // Fan out per site
      const { data: mappings } = await supabase
        .from('site_to_integration')
        .select('site_id')
        .eq('integration_id', integrationId)
        .eq('tenant_id', tenantId);

      for (const mapping of mappings || []) {
        // Check dependency sync_jobs
        const depsMet = await this.checkDependencies(
          integrationId,
          null,
          mapping.site_id,
          dependsOn,
          scheduleHours
        );

        if (!depsMet) {
          Logger.trace({
            module: 'QueryJobScheduler',
            context: 'dispatchJob',
            message: `Skipping site ${mapping.site_id} — unmet sync deps for ${name}`,
          });
          continue;
        }

        const payload: QueryJobData = {
          queryJobId,
          tenantId,
          connectionId: null,
          siteId: mapping.site_id,
        };
        await queueManager.addJob(QueueNames.query(integrationId), payload);
        enqueued++;
      }
    } else {
      // Fan out per connection
      const { data: connections } = await supabase
        .from('integration_connections')
        .select('id')
        .eq('integration_id', integrationId)
        .eq('tenant_id', tenantId)
        .eq('status', 'active');

      for (const conn of connections || []) {
        const connectionId = conn.id;

        const depsMet = await this.checkDependencies(
          integrationId,
          connectionId,
          null,
          dependsOn,
          scheduleHours
        );

        if (!depsMet) {
          Logger.trace({
            module: 'QueryJobScheduler',
            context: 'dispatchJob',
            message: `Skipping connection ${connectionId} — unmet sync deps for ${name}`,
          });
          continue;
        }

        const payload: QueryJobData = { queryJobId, tenantId, connectionId, siteId: null };
        await queueManager.addJob(QueueNames.query(integrationId), payload);
        enqueued++;
      }
    }

    // Update query_jobs: last_run_at, next_run_at
    const nextRunAt = new Date(Date.now() + scheduleHours * 60 * 60 * 1000).toISOString();
    await supabase
      .from('query_jobs')
      .update({
        last_run_at: new Date().toISOString(),
        next_run_at: nextRunAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', queryJobId);

    Logger.info({
      module: 'QueryJobScheduler',
      context: 'dispatchJob',
      message: `Dispatched ${enqueued} jobs for ${name} (${integrationId})`,
    });
  }

  private async checkDependencies(
    integrationId: string,
    connectionId: string | null,
    siteId: string | null,
    dependsOn: string[],
    scheduleHours: number
  ): Promise<boolean> {
    if (dependsOn.length === 0) return true;

    const supabase = getSupabase();
    const cutoff = new Date(Date.now() - scheduleHours * 2 * 60 * 60 * 1000).toISOString();

    for (const depType of dependsOn) {
      let query = supabase
        .from('sync_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('integration_id', integrationId)
        .eq('entity_type', depType)
        .eq('status', 'completed')
        .gte('updated_at', cutoff);

      if (siteId) {
        query = query.eq('site_id', siteId);
      }
      if (connectionId) {
        query = query.eq('connection_id', connectionId);
      }

      const { count } = await query;

      if (!count || count === 0) {
        return false;
      }
    }

    return true;
  }

  private async cleanupOldHistory(): Promise<void> {
    const supabase = getSupabase();
    const cutoff = new Date(
      Date.now() - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const { error } = await supabase.from('query_job_history').delete().lt('created_at', cutoff);

    if (error) {
      Logger.error({
        module: 'QueryJobScheduler',
        context: 'cleanupOldHistory',
        message: `Error cleaning up query_job_history: ${error.message}`,
      });
    }
  }
}
