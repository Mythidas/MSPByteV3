import { json, error } from '@sveltejs/kit';
import { enqueueRun } from '@workspace/workflows/enqueue';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) error(401, 'Unauthorized');

  const body = await request.json().catch(() => null);
  const runId = body?.run_id;
  if (!runId) error(400, 'run_id is required');

  // Validate run belongs to user's tenant and is still pending
  const { data: run } = await (locals.supabase.from('task_runs' as any) as any)
    .select('id, tenant_id, status')
    .eq('id', runId)
    .eq('tenant_id', user.tenant_id)
    .single();

  if (!run) error(404, 'Run not found or access denied');
  if (run.status !== 'pending') error(400, `Run is already ${run.status}`);

  await enqueueRun(runId, 10);

  return json({ success: true, run_id: runId });
};
