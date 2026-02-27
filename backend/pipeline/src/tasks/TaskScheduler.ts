import { getSupabase } from '../supabase.js';
import { queueManager } from '../lib/queue.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import type { TaskRow, TaskJobData, RetryConfig } from './types.js';

const POLL_INTERVAL_MS = 60 * 1000; // 1 minute
const QUEUE_NAME = 'tasks';

/**
 * TaskScheduler
 *
 * Polls the `tasks` table for due, enabled tasks and enqueues BullMQ jobs.
 * Mirrors the QueryJobScheduler pattern.
 *
 * For recurring tasks: advances next_run_at using the cron expression.
 * For one_shot tasks: disables the task after enqueueing.
 */
export class TaskScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;

  start(): void {
    this.poll();
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    Logger.info({
      module: 'TaskScheduler',
      context: 'start',
      message: `Scheduler started (polling every ${POLL_INTERVAL_MS / 1000}s)`,
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    Logger.info({
      module: 'TaskScheduler',
      context: 'stop',
      message: 'Scheduler stopped',
    });
  }

  private async poll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const supabase = getSupabase();
      const now = new Date().toISOString();

      const { data: dueTasks, error } = await (supabase.from('tasks' as any) as any)
        .select('*')
        .eq('enabled', true)
        .lte('next_run_at', now);

      if (error) {
        Logger.error({
          module: 'TaskScheduler',
          context: 'poll',
          message: `Error polling tasks: ${error.message}`,
        });
        return;
      }

      if (!dueTasks || dueTasks.length === 0) return;

      Logger.trace({
        module: 'TaskScheduler',
        context: 'poll',
        message: `Found ${dueTasks.length} due tasks`,
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
    } finally {
      this.isPolling = false;
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
        attempts: retryConfig.max_attempts,
        backoff: {
          type: retryConfig.backoff_type === 'exponential' ? 'exponential' : 'fixed',
          delay: retryConfig.initial_delay_ms,
        },
      });

      // Compute next run time or disable one_shot tasks
      const updates: any = {
        last_run_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (task.schedule.type === 'one_shot') {
        updates.enabled = false;
        updates.next_run_at = new Date().toISOString(); // keep current value
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
        message: `Enqueued task ${task.id} (history: ${historyRow.id})`,
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
   * Uses cron-parser (bundled as a transitive dependency of bullmq).
   */
  private computeNextRunAt(cronExpression: string): string {
    try {
      // Dynamic import to handle cron-parser as transitive dep
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
      // Fall back to 1 hour from now if cron parse fails
      return new Date(Date.now() + 60 * 60 * 1000).toISOString();
    }
  }
}
