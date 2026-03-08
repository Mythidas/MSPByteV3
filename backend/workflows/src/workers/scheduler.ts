import { Worker } from 'bullmq';
import { Cron } from 'croner';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { orm } from '../lib/orm.js';
import { getRedisConnection } from '../redis.js';
import { SCHEDULER_QUEUE } from '../queues/scheduler.js';
import workflowRunQueue from '../queues/workflow-run.js';
import type { RunSeed, SchedulerJobPayload } from '../types.js';

const processingTasks = new Set<string>();

async function checkDueTasks(): Promise<void> {
  const { data: tasks } = await orm.select('public', 'tasks', (q) =>
    q.eq('enabled', true).lte('next_run_at', new Date().toISOString())
  );
  if (!tasks?.rows.length) return;

  const due = tasks.rows.filter((t) => !processingTasks.has(t.id));

  await Promise.all(
    due.map(async (task) => {
      if (!(task.schedule as any)?.cron) return;

      processingTasks.add(task.id);
      try {
        const { data: workflow } = await orm.selectSingle('public', 'workflows', (q) =>
          q.eq('id', task.workflow_id)
        );
        if (!workflow) throw new Error(`workflow ${task.workflow_id} not found`);

        const scope = task.scope as any;
        const seed: RunSeed = {
          scope_type: scope.type,
          site_ids: scope.site_ids,
          link_ids: scope.link_ids,
          entity_ids: scope.entity_ids,
          params: (task.param_defaults as any) ?? {},
        };

        const { data: runs, error: insertErr } = await orm.insert('public', 'task_runs' as any, [
          {
            tenant_id: task.tenant_id,
            task_id: task.id,
            workflow_id: task.workflow_id,
            workflow_snapshot: (workflow as any).graph,
            triggered_by: 'schedule',
            seed: seed as any,
            status: 'pending',
          },
        ] as any);
        if (insertErr || !runs?.length) throw new Error(`failed to insert task_run: ${insertErr}`);

        await workflowRunQueue.add('workflow-run', { run_id: (runs as any[])[0].id });

        const next = new Cron((task.schedule as any).cron).nextRun();
        await orm.update('public', 'tasks', task.id, {
          last_run_at: new Date().toISOString(),
          next_run_at: next?.toISOString() ?? null,
        } as any);
      } catch (err) {
        Logger.error({
          module: 'workflows',
          context: 'scheduler',
          message: `failed to enqueue task ${task.id}: ${err instanceof Error ? err.message : String(err)}`,
        });
      } finally {
        processingTasks.delete(task.id);
      }
    })
  );

  Logger.info({
    module: 'workflows',
    context: 'scheduler',
    message: `enqueued ${due.length} runs`,
  });
}

const schedulerWorker = new Worker<SchedulerJobPayload>(
  SCHEDULER_QUEUE,
  async (job) => {
    Logger.info({
      module: 'workflows',
      context: 'worker:scheduler',
      message: `tick at ${job.data.tick_at}`,
    });
    await checkDueTasks();
    Logger.info({ module: 'workflows', context: 'worker:scheduler', message: 'tick complete' });
  },
  {
    connection: getRedisConnection(),
    concurrency: 1,
  }
);

schedulerWorker.on('failed', (job, err) => {
  Logger.error({
    module: 'workflows',
    context: 'worker:scheduler',
    message: `job failed: ${job?.id}`,
    meta: { err },
  });
});

schedulerWorker.on('error', (err) => {
  Logger.error({ module: 'workflows', context: 'worker:scheduler', message: 'worker error', meta: { err } });
});

export default schedulerWorker;
