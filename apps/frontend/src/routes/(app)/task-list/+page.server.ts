import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  const user = locals.user!;
  const filterMine = url.searchParams.get('filter') !== 'all';

  let query = locals.supabase
    .from('task_runs')
    .select(
      'id, workflow_id, tenant_id, triggered_by, triggered_by_user, status, started_at, completed_at, duration_ms, created_at'
    )
    .eq('tenant_id', user.tenant_id)
    .order('created_at', { ascending: false })
    .limit(25);

  if (filterMine) {
    query = query.eq('triggered_by_user', user.id);
  }

  const { data: runs } = await query;

  // Collect unique workflow_ids and fetch workflow names
  const workflowIds = [...new Set((runs ?? []).map((r: any) => r.workflow_id).filter(Boolean))];
  let workflowNames: Record<string, string> = {};

  if (workflowIds.length > 0) {
    const { data: workflows } = await locals.supabase
      .from('workflows')
      .select('id, name')
      .in('id', workflowIds);

    for (const wf of workflows ?? []) {
      workflowNames[wf.id] = wf.name;
    }
  }

  return {
    runs: runs ?? [],
    workflowNames,
    currentUserId: user.id,
    filterMine,
  };
};
