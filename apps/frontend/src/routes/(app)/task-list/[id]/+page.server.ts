import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
  const user = locals.user!;

  const [{ data: run }, { data: stages }] = await Promise.all([
    (locals.supabase.from('task_runs' as any) as any)
      .select('*')
      .eq('id', params.id)
      .eq('tenant_id', user.tenant_id)
      .single(),
    (locals.supabase.from('task_run_stages' as any) as any)
      .select('*')
      .eq('run_id', params.id)
      .order('stage_index', { ascending: true }),
  ]);

  if (!run) {
    error(404, 'Run not found');
  }

  let workflowName: string | null = null;
  if (run.workflow_id) {
    const { data: wf } = await (locals.supabase.from('workflows' as any) as any)
      .select('name')
      .eq('id', run.workflow_id)
      .single();
    workflowName = wf?.name ?? null;
  }

  return {
    run,
    stages: stages ?? [],
    workflowName,
  };
};
