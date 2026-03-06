import { Logger } from '@workspace/shared/lib/utils/logger.js';
import { getSupabase } from '../supabase.js';
import { buildRunContext } from '../context.js';
import { runStage } from './stage-runner.js';
import type { RunStatus, TaskRunRow } from '../types.js';

export async function executeRun(runId: string): Promise<void> {
  const supabase = getSupabase();

  // 1. Fetch task_runs row
  const { data: run, error: fetchError } = await (supabase.from('task_runs' as any) as any)
    .select('*')
    .eq('id', runId)
    .single();

  if (fetchError || !run) {
    Logger.error({
      module: 'ExecuteRun',
      context: 'fetch',
      message: `Failed to fetch run ${runId}: ${fetchError?.message ?? 'not found'}`,
    });
    return;
  }

  const typedRun = run as TaskRunRow;

  // Guard: idempotency — only process pending runs
  if (typedRun.status !== 'pending') {
    Logger.warn({
      module: 'ExecuteRun',
      context: 'guard',
      message: `Run ${runId} is already ${typedRun.status}, skipping`,
    });
    return;
  }

  const startMs = Date.now();

  // 2. Mark as running
  await (supabase.from('task_runs' as any) as any)
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', runId);

  // 3. Build context
  const ctx = buildRunContext(typedRun);

  // 4. Execute stages in order
  let overallStatus: RunStatus = 'completed';
  let hasPartial = false;
  const stages = typedRun.workflow_snapshot ?? [];

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]!;

    Logger.info({
      module: 'ExecuteRun',
      context: 'stage',
      message: `[${runId}] Running stage ${i + 1}/${stages.length}: ${stage.id} (${stage.type})`,
    });

    const result = await runStage(stage, ctx, i, runId);

    if (result.status === 'failed') {
      if (stage.on_error === 'fail') {
        overallStatus = 'failed';
        Logger.error({
          module: 'ExecuteRun',
          context: 'stage',
          message: `[${runId}] Stage "${stage.id}" failed with on_error=fail — aborting run`,
        });
        break;
      } else {
        hasPartial = true;
        Logger.warn({
          module: 'ExecuteRun',
          context: 'stage',
          message: `[${runId}] Stage "${stage.id}" failed with on_error=${stage.on_error} — continuing`,
        });
      }
    }
  }

  // 5. Determine final status
  if (overallStatus !== 'failed' && hasPartial) {
    overallStatus = 'partial';
  }

  const durationMs = Date.now() - startMs;

  // 6. Update task_runs with final state
  await (supabase.from('task_runs' as any) as any)
    .update({
      status: overallStatus,
      entity_log: Object.values(ctx.entity_log).map(({ raw_data: _raw, ...rest }) => rest),
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
    })
    .eq('id', runId);

  Logger.info({
    module: 'ExecuteRun',
    context: 'complete',
    message: `[${runId}] Run completed with status "${overallStatus}" in ${durationMs}ms`,
  });
}
