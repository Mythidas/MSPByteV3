import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { IntegrationId } from '@workspace/shared/config/integrations';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user || !locals.role || !locals.tenant) {
    throw redirect(303, '/auth/login');
  }

  const { data: activeIntegrations } = await locals.supabase
    .from('integrations')
    .select('id')
    .is('deleted_at', null)
    .eq('tenant_id', locals.tenant.id);

  return {
    user: locals.user,
    role: locals.role,
    tenant: locals.tenant,
    activeIntegrations: activeIntegrations?.map((ai) => ai.id as IntegrationId) ?? [],
  };
};
