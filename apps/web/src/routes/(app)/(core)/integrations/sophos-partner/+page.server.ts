import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { encryptSecret, decryptSecret } from '$lib/server/encryption';
import { SophosPartnerConnector } from '@workspace/shared/lib/connectors/SophosConnector';
import type { SophosPartnerConfig, SophosPartnerTenant } from '@workspace/shared/types/integrations/sophos/index.js';

async function getTenants(parent: () => Promise<any>): Promise<SophosPartnerTenant[]> {
  const { getIntegration } = await parent();
  const integration = await getIntegration;
  if (!integration) return [];
  const config = integration.config as SophosPartnerConfig;
  if (!config?.clientId || !config?.clientSecret) return [];
  const clientSecret = await decryptSecret(config.clientSecret);
  if (!clientSecret) return [];
  const connector = new SophosPartnerConnector({ clientId: config.clientId, clientSecret });
  const { data } = await connector.getTenants();
  return data ?? [];
}

export const load: PageServerLoad = async ({ parent }) => {
  return { getTenants: getTenants(parent) };
};

export const actions = {
  save: async ({ request, locals }) => {
    const formData = await request.formData();
    const clientId = formData.get('clientId') as string;
    const clientSecret = formData.get('clientSecret') as string;

    if (!clientId) {
      return fail(400, { error: 'Client ID is required' });
    }

    let encryptedSecret: string;

    if (!clientSecret) {
      const { data: existing } = await locals.supabase
        .from('integrations')
        .select('config')
        .eq('id', 'sophos-partner')
        .eq('tenant_id', locals.tenant!.id)
        .is('deleted_at', null)
        .single();

      const existingSecret = (existing?.config as SophosPartnerConfig)?.clientSecret;
      if (!existingSecret) {
        return fail(400, { error: 'Client Secret is required' });
      }
      encryptedSecret = existingSecret;
    } else {
      const connector = new SophosPartnerConnector({ clientId, clientSecret });
      const { error: healthError } = await connector.checkHealth();
      if (healthError) {
        return fail(400, { error: `Connection failed: ${healthError}` });
      }
      encryptedSecret = await encryptSecret(clientSecret);
    }

    const config: SophosPartnerConfig = { clientId, clientSecret: encryptedSecret };

    const { error } = await locals.supabase.from('integrations').upsert(
      { id: 'sophos-partner', tenant_id: locals.tenant!.id, config, deleted_at: null },
      { onConflict: 'id,tenant_id' },
    );

    if (error) return fail(500, { error: error.message });
    return { success: true };
  },

  testConnection: async ({ request }) => {
    const formData = await request.formData();
    const clientId = formData.get('clientId') as string;
    const clientSecret = formData.get('clientSecret') as string;

    if (!clientId || !clientSecret) {
      return fail(400, { error: 'Client ID and Client Secret are required' });
    }

    const connector = new SophosPartnerConnector({ clientId, clientSecret });
    const { error: healthError } = await connector.checkHealth();
    if (healthError) {
      return fail(400, { error: `Connection failed: ${healthError}` });
    }

    return { success: true };
  },

  deleteIntegration: async ({ locals }) => {
    const { error } = await locals.supabase
      .from('integrations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', 'sophos-partner')
      .eq('tenant_id', locals.tenant!.id);

    if (error) return fail(500, { error: error.message });
    throw redirect(303, '/integrations');
  },
} satisfies Actions;
