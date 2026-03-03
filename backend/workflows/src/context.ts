import type { RunContext, TaskRunRow } from './types.js';

export function buildRunContext(run: TaskRunRow): RunContext {
  return {
    run_id: run.id,
    tenant_id: run.tenant_id,
    triggered_by: run.triggered_by,
    triggered_by_user: run.triggered_by_user ?? undefined,
    seed: {
      ...run.resolved_scope,
      params: {
        ...(run.resolved_scope.params ?? {}),
        ...(run.seed_params ?? {}),
      },
    },
    stage_outputs: {},
    entity_log: {},
  };
}
