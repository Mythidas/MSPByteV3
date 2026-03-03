import { Logger } from '@workspace/shared/lib/utils/logger.js';
import { getSupabase } from '../supabase.js';
import { enqueueRun } from '../enqueue.js';

export class TaskScheduler {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
  private inflight = new Set<string>();
  private inflightRuns = new Set<string>();

  start(): void {
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), 60_000);

    this.reconcilePendingRuns();
    this.reconcileTimer = setInterval(() => this.reconcilePendingRuns(), 5_000);

    Logger.info({
      module: 'TaskScheduler',
      context: 'start',
      message: 'Scheduler started (60s poll, 5s reconcile)',
    });
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
    Logger.info({ module: 'TaskScheduler', context: 'stop', message: 'Scheduler stopped' });
  }

  private async poll(): Promise<void> {
    const supabase = getSupabase();

    const { data: tasks, error } = await (supabase.from('tasks' as any) as any)
      .select('id, tenant_id, workflow_id, scope_data, schedule, priority')
      .eq('enabled', true)
      .lte('next_run_at', new Date().toISOString());

    if (error) {
      Logger.error({
        module: 'TaskScheduler',
        context: 'poll',
        message: `Failed to query tasks: ${error.message}`,
      });
      return;
    }

    if (!tasks || tasks.length === 0) return;

    Logger.info({
      module: 'TaskScheduler',
      context: 'poll',
      message: `Found ${tasks.length} task(s) due for execution`,
    });

    for (const task of tasks) {
      if (this.inflight.has(task.id)) continue;
      this.processTask(task).catch((e) => {
        Logger.error({
          module: 'TaskScheduler',
          context: 'processTask',
          message: `Unhandled error for task ${task.id}: ${e}`,
        });
      });
    }
  }

  private async reconcilePendingRuns(): Promise<void> {
    const supabase = getSupabase();

    const { data: runs, error } = await (supabase.from('task_runs' as any) as any)
      .select('id')
      .eq('status', 'pending')
      .is('task_id', null);

    if (error) {
      Logger.error({
        module: 'TaskScheduler',
        context: 'reconcile',
        message: `Failed to query pending runs: ${error.message}`,
      });
      return;
    }

    if (!runs || runs.length === 0) return;

    for (const run of runs) {
      if (this.inflightRuns.has(run.id)) continue;
      this.inflightRuns.add(run.id);

      enqueueRun(run.id, 10)
        .then(() =>
          Logger.info({
            module: 'TaskScheduler',
            context: 'reconcile',
            message: `Enqueued manual run ${run.id}`,
          }),
        )
        .catch((e) =>
          Logger.error({
            module: 'TaskScheduler',
            context: 'reconcile',
            message: `Failed to enqueue run ${run.id}: ${String(e)}`,
          }),
        )
        .finally(() => this.inflightRuns.delete(run.id));
    }
  }

  private async processTask(task: any): Promise<void> {
    this.inflight.add(task.id);
    const supabase = getSupabase();

    try {
      // Fetch workflow stages snapshot
      const { data: workflow, error: wfError } = await (supabase.from('workflows' as any) as any)
        .select('stages')
        .eq('id', task.workflow_id)
        .single();

      if (wfError || !workflow) {
        Logger.error({
          module: 'TaskScheduler',
          context: 'processTask',
          message: `Workflow not found for task ${task.id}: ${wfError?.message ?? 'not found'}`,
        });
        return;
      }

      // Insert task_runs row
      const { data: run, error: runError } = await (supabase.from('task_runs' as any) as any)
        .insert({
          task_id: task.id,
          tenant_id: task.tenant_id,
          triggered_by: 'schedule',
          triggered_by_user: null,
          workflow_snapshot: workflow.stages,
          resolved_scope: task.scope ?? { scope_type: 'all_sites' },
          seed_params: {},
          status: 'pending',
        })
        .select('id')
        .single();

      if (runError || !run) {
        Logger.error({
          module: 'TaskScheduler',
          context: 'processTask',
          message: `Failed to create run for task ${task.id}: ${runError?.message ?? 'unknown'}`,
        });
        return;
      }

      await enqueueRun(run.id, task.priority ?? 5);

      const nextRunAt = computeNextRunAt(task.schedule);
      const isOneShot = task.schedule?.type === 'one_shot';

      await (supabase.from('tasks' as any) as any)
        .update({
          last_run_at: new Date().toISOString(),
          next_run_at: nextRunAt,
          ...(isOneShot ? { enabled: false } : {}),
        })
        .eq('id', task.id);

      Logger.info({
        module: 'TaskScheduler',
        context: 'processTask',
        message: `Enqueued run ${run.id} for task ${task.id}`,
      });
    } finally {
      this.inflight.delete(task.id);
    }
  }
}

function computeNextRunAt(schedule: { type: string; interval_minutes?: number }): string {
  if (schedule?.type === 'one_shot') {
    return new Date(8640000000000000).toISOString();
  }
  const minutes = schedule?.interval_minutes ?? 60;
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}
