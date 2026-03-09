import { Logger } from '@workspace/shared/lib/utils/logger';
import type { PageServerLoad } from './$types';
import type { Tables } from '@workspace/shared/types/database';

async function getIntegrations(locals: App.Locals) {
  try {
    const { data } = await locals.supabase
      .from('integrations')
      .select('*')
      .eq('tenant_id', locals.tenant.id);
    return (data as Tables<'public', 'integrations'>[]) ?? [];
  } catch (err) {
    Logger.error({
      module: '/integrations',
      context: 'getIntegrations',
      message: `Failed to fetch integrations: ${err}`,
    });

    return [];
  }
}

export const load: PageServerLoad = async ({ locals }) => {
  return {
    getIntegrations: getIntegrations(locals),
  };
};
