import { supabase } from '$lib/supabase';

// Workflow stage node shape — mirrors backend/workflows/src/types.ts
export interface WorkflowStageNode {
  id: string;
  label: string;
  type: string;
  integration: string | null;
  ref: string;
  params: Record<string, unknown>;
  input_map: Record<string, { from: string }>;
  template?: string;
  on_error: 'fail' | 'skip' | 'continue';
}

export interface RunWorkflowOptions {
  tenantId: string;
  workflowId: string;
  workflowSnapshot: WorkflowStageNode[];
  entityType: string;
  entityIds: string[];
  seedParams?: Record<string, unknown>;
}

export function createRunWorkflow() {
  let runId = $state<string | null>(null);
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  async function execute(options: RunWorkflowOptions): Promise<string | null> {
    isLoading = true;
    error = null;
    runId = null;

    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id ?? null;

      const { data: run, error: insertError } = await (supabase.from('task_runs' as any) as any)
        .insert({
          task_id: null,
          tenant_id: options.tenantId,
          triggered_by: 'manual',
          triggered_by_user: userId,
          workflow_snapshot: options.workflowSnapshot,
          resolved_scope: {
            scope_type: 'entity_ids',
            entity_ids: options.entityIds,
            entity_type: options.entityType,
          },
          seed_params: options.seedParams ?? {},
          status: 'pending',
        })
        .select('id')
        .single();

      if (insertError || !run) {
        error = insertError?.message ?? 'Failed to create run';
        return null;
      }

      const response = await fetch('/api/pipeline/execute-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: run.id }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        error = (body as any)?.message ?? `Server error: ${response.status}`;
        return null;
      }

      runId = run.id;
      return run.id;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return null;
    } finally {
      isLoading = false;
    }
  }

  return {
    get runId() { return runId; },
    get isLoading() { return isLoading; },
    get error() { return error; },
    execute,
  };
}
