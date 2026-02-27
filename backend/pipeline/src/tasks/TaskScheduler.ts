import { getSupabase } from '../supabase.js';
import { queueManager } from '../lib/queue.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import type { TaskRow, TaskJobData, RetryConfig } from './types.js';

const SCHEDULED_POLL_INTERVAL_MS = 60 * 1000; // 1 minute for recurring/one-shot scheduled tasks
const ADHOC_POLL_INTERVAL_MS = 5 * 1000;      // 5 seconds for user-triggered quick-run tasks
const QUEUE_NAME = 'tasks';

/**
 * TaskScheduler
 *
 * Polls the `tasks` table for due, enabled tasks and enqueues BullMQ jobs.
 *
 * Two poll loops run independently:
 *   - Scheduled (60s): picks up recurring + one-shot tasks seeded by TaskReconciler
 *   - Ad-hoc (5s):     picks up quick-run tasks created by the frontend quick-run API
 *
 * Ad-hoc tasks are enqueued with higher BullMQ priority so they are processed
 * before already-queued scheduled jobs.
 */
export class TaskScheduler {
  private scheduledTimer: ReturnType<typeof setInterval> | null = null;
  private adhocTimer: ReturnType<typeof setInterval> | null = null;
  private isPollingScheduled = false;
  private isPollingAdhoc = false;

  start(): void {
    // Immediate first run for both loops
    this.pollScheduled();
    this.pollAdhoc();

    this.scheduledTimer = setInterval(() => this.pollScheduled(), SCHEDULED_POLL_INTERVAL_MS);
    this.adhocTimer = setInterval(() => this.pollAdhoc(), ADHOC_POLL_INTERVAL_MS);

    Logger.info({
      module: 'TaskScheduler',
      context: 'start',
      message: `Scheduler started (scheduled: ${SCHEDULED_POLL_INTERVAL_MS / 1000}s, adhoc: ${ADHOC_POLL_INTERVAL_MS / 1000}s)`,
    });
  }

  stop(): void {
    if (this.scheduledTimer) {
      clearInterval(this.scheduledTimer);
      this.scheduledTimer = null;
    }
    if (this.adhocTimer) {
      clearInterval(this.adhocTimer);
      this.adhocTimer = null;
    }
    Logger.info({
      module: 'TaskScheduler',
      context: 'stop',
      message: 'Scheduler stopped',
    });
  }

  private async pollScheduled(): Promise<void> {
    if (this.isPollingScheduled) return;
    this.isPollingScheduled = true;
    try {
      await this.poll(false);
    } finally {
      this.isPollingScheduled = false;
    }
  }

  private async pollAdhoc(): Promise<void> {
    if (this.isPollingAdhoc) return;
    this.isPollingAdhoc = true;
    try {
      await this.poll(true);
    } finally {
      this.isPollingAdhoc = false;
    }
  }

  private async poll(isAdhoc: boolean): Promise<void> {
    try {
      const supabase = getSupabase();
      const now = new Date().toISOString();

      const { data: dueTasks, error } = await (supabase.from('tasks' as any) as any)
        .select('*')
        .eq('enabled', true)
        .eq('is_adhoc', isAdhoc)
        .lte('next_run_at', now);

      if (error) {
        Logger.error({
          module: 'TaskScheduler',
          context: 'poll',
          message: `Error polling ${isAdhoc ? 'adhoc' : 'scheduled'} tasks: ${error.message}`,
        });
        return;
      }

      if (!dueTasks || dueTasks.length === 0) return;

      Logger.trace({
        module: 'TaskScheduler',
        context: 'poll',
        message: `Found ${dueTasks.length} due ${isAdhoc ? 'adhoc' : 'scheduled'} task(s)`,
      });

      for (const task of dueTasks as TaskRow[]) {
        await this.enqueueTask(task);
      }
    } catch (err) {
      Logger.error({
        module: 'TaskScheduler',
        context: 'poll',
        message: `Poll error: ${err}`,
      });
    }
  }

  private async enqueueTask(task: TaskRow): Promise<void> {
    const supabase = getSupabase();

    try {
      // Pre-create history row so the worker can update it
      const { data: historyRow, error: historyErr } = await (
        supabase.from('task_history' as any) as any
      )
        .insert({
          task_id: task.id,
          tenant_id: task.tenant_id,
          scope: task.scope,
          status: 'pending',
        })
        .select('id')
        .single();

      if (historyErr || !historyRow) {
        Logger.error({
          module: 'TaskScheduler',
          context: 'enqueueTask',
          message: `Failed to create history row for task ${task.id}: ${historyErr?.message}`,
        });
        return;
      }

      const retryConfig: RetryConfig = task.retry_config ?? {
        max_attempts: 3,
        initial_delay_ms: 2000,
        backoff_type: 'exponential',
      };

      const payload: TaskJobData = {
        taskId: task.id,
        tenantId: task.tenant_id,
        historyId: historyRow.id,
      };

      await queueManager.addJob(QUEUE_NAME, payload, {
        priority: task.priority ?? 0,
        attempts: retryConfig.max_attempts,
        backoff: {
          type: retryConfig.backoff_type === 'exponential' ? 'exponential' : 'fixed',
          delay: retryConfig.initial_delay_ms,
        },
      });

      // Compute next run time or disable one_shot/adhoc tasks
      const updates: any = {
        last_run_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (task.schedule.type === 'one_shot' || task.is_adhoc) {
        updates.enabled = false;
        updates.next_run_at = new Date().toISOString();
      } else if (task.schedule.cron) {
        const nextRunAt = this.computeNextRunAt(task.schedule.cron);
        updates.next_run_at = nextRunAt;
      } else {
        // No cron defined for a recurring task — disable to prevent tight loop
        Logger.warn({
          module: 'TaskScheduler',
          context: 'enqueueTask',
          message: `Recurring task ${task.id} has no cron expression — disabling`,
        });
        updates.enabled = false;
      }

      await (supabase.from('tasks' as any) as any).update(updates).eq('id', task.id);

      Logger.info({
        module: 'TaskScheduler',
        context: 'enqueueTask',
        message: `Enqueued task ${task.id} (history: ${historyRow.id}, priority: ${task.priority ?? 0}, adhoc: ${task.is_adhoc})`,
      });
    } catch (err) {
      Logger.error({
        module: 'TaskScheduler',
        context: 'enqueueTask',
        message: `Failed to enqueue task ${task.id}: ${err}`,
      });
    }
  }

  /**
   * Compute the next ISO timestamp for a cron expression.
   */
  private computeNextRunAt(cronExpression: string): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const cronParser = require('cron-parser');
      const interval = cronParser.parseExpression(cronExpression);
      return interval.next().toISOString();
    } catch (err) {
      Logger.error({
        module: 'TaskScheduler',
        context: 'computeNextRunAt',
        message: `Failed to parse cron expression "${cronExpression}": ${err}`,
      });
      return new Date(Date.now() + 60 * 60 * 1000).toISOString();
    }
  }
}
