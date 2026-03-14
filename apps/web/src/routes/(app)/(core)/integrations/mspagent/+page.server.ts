import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { MSPAgentConfig } from '@workspace/shared/types/integrations/mspagent/index.js';

export const load: PageServerLoad = async ({}) => {};

export const actions = {
  save: async ({ request, locals }) => {
    const formData = await request.formData();
    const primaryPsa = formData.get('primaryPsa') as string;
    const siteVariableName = (formData.get('siteVariableName') as string) || undefined;

    if (!primaryPsa) {
      return fail(400, { error: 'Primary PSA is required' });
    }

    const config: MSPAgentConfig = { primaryPsa, siteVariableName };

    const { error } = await locals.supabase.from('integrations').upsert(
      { id: 'mspagent', tenant_id: locals.tenant!.id, config, deleted_at: null },
      { onConflict: 'id,tenant_id' },
    );

    if (error) return fail(500, { error: error.message });
    return { success: true };
  },

  deleteIntegration: async ({ locals }) => {
    const { error } = await locals.supabase
      .from('integrations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', 'mspagent')
      .eq('tenant_id', locals.tenant!.id);

    if (error) return fail(500, { error: error.message });
    throw redirect(303, '/integrations');
  },
} satisfies Actions;
