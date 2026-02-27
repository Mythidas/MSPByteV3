import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const ADHOC_PRIORITY = 10; // Higher than scheduled tasks (priority 0) — processed first by BullMQ

/**
 * POST /workflows/[workflowId]/quick-run
 *
 * Creates an ad-hoc one-shot task for an existing workflow and returns the
 * task_id and history_id for the frontend to poll. The pipeline's TaskScheduler
 * detects the new task on its 5-second ad-hoc poll loop and enqueues it with
 * higher priority so it runs before any pending scheduled tasks.
 *
 * Body:
 *   params_override  – user-supplied param overrides merged with query/action defaults
 *   scope            – optional scope override (defaults to tenant-level)
 *   name             – optional display name for this run (defaults to workflow name)
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  const { workflowId } = params;
  const supabase = locals.supabase;
  const user = locals.user;

  if (!user) {
    error(401, 'Unauthorized');
  }

  let body: {
    params_override?: Record<string, any>;
    scope?: {
      level: 'tenant' | 'site' | 'connection' | 'device';
      site_id?: string;
      entity_id?: string;
      connection_id?: string;
    };
    name?: string;
  } = {};

  try {
    body = await request.json();
  } catch {
    // Empty body is fine — all fields are optional
  }

  // Load the workflow to verify it exists and get its name / integration_id
  const { data: workflow, error: wfError } = await (supabase.from('workflows' as any) as any)
    .select('id, name, integration_id, is_built_in')
    .eq('id', workflowId)
    .single();

  if (wfError || !workflow) {
    error(404, `Workflow not found: ${workflowId}`);
  }

  const tenantId = user.tenant_id as string;
  if (!tenantId) {
    error(400, 'User is not associated with a tenant');
  }

  const now = new Date().toISOString();
  const scope = body.scope ?? { level: 'tenant' };
  const paramsOverride = body.params_override ?? {};
  const name = body.name ?? `${workflow.name} (Quick Run)`;

  // Insert the ad-hoc task row
  const { data: task, error: taskError } = await (supabase.from('tasks' as any) as any)
    .insert({
      tenant_id: tenantId,
      name,
      workflow_id: workflowId,
      scope,
      schedule: { type: 'one_shot' },
      retry_config: { max_attempts: 1, initial_delay_ms: 0, backoff_type: 'fixed' },
      next_run_at: now,
      enabled: true,
      is_adhoc: true,
      priority: ADHOC_PRIORITY,
      params_override: paramsOverride,
    })
    .select('id')
    .single();

  if (taskError || !task) {
    error(500, `Failed to create task: ${taskError?.message}`);
  }

  // Pre-create the task_history row so the frontend can poll it immediately
  const { data: history, error: historyError } = await (supabase.from('task_history' as any) as any)
    .insert({
      task_id: task.id,
      tenant_id: tenantId,
      scope,
      status: 'pending',
    })
    .select('id')
    .single();

  if (historyError || !history) {
    // Clean up the task row if history creation fails
    await (supabase.from('tasks' as any) as any).delete().eq('id', task.id);
    error(500, `Failed to create task history: ${historyError?.message}`);
  }

  return json({
    task_id: task.id,
    history_id: history.id,
    workflow_name: workflow.name,
    status: 'pending',
  });
};
