import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { encryptSecret, decryptSecret } from '$lib/server/encryption';
import { HaloPSAConnector } from '@workspace/shared/lib/connectors/HaloPSAConnector';
import type { HaloPSAConfig } from '@workspace/shared/types/integrations/halopsa/index.js';
import type { HaloPSASite } from '@workspace/shared/types/integrations/halopsa/sites.js';

async function getHalopSites(parent: () => Promise<any>): Promise<HaloPSASite[]> {
  const { getIntegration } = await parent();
  const integration = await getIntegration;
  if (!integration) return [];
  const config = integration.config as HaloPSAConfig;
  if (!config?.url || !config?.clientId || !config?.clientSecret) return [];
  const clientSecret = await decryptSecret(config.clientSecret);
  if (!clientSecret) return [];
  const connector = new HaloPSAConnector({ url: config.url, clientId: config.clientId, clientSecret });
  const { data } = await connector.getSites();
  return data ?? [];
}

export const load: PageServerLoad = async ({ parent }) => {
  return { getHalopSites: getHalopSites(parent) };
};

export const actions = {
  save: async ({ request, locals }) => {
    const formData = await request.formData();
    const url = formData.get('url') as string;
    const clientId = formData.get('clientId') as string;
    const clientSecret = formData.get('clientSecret') as string;

    if (!url || !clientId) {
      return fail(400, { error: 'URL and Client ID are required' });
    }

    let encryptedSecret: string;

    if (!clientSecret) {
      // Keep existing secret if not re-entered
      const { data: existing } = await locals.supabase
        .from('integrations')
        .select('config')
        .eq('id', 'halopsa')
        .eq('tenant_id', locals.tenant!.id)
        .is('deleted_at', null)
        .single();

      const existingSecret = (existing?.config as HaloPSAConfig)?.clientSecret;
      if (!existingSecret) {
        return fail(400, { error: 'Client Secret is required' });
      }
      encryptedSecret = existingSecret;
    } else {
      const connector = new HaloPSAConnector({ url, clientId, clientSecret });
      const { error: healthError } = await connector.checkHealth();
      if (healthError) {
        return fail(400, { error: `Connection failed: ${healthError}` });
      }
      encryptedSecret = await encryptSecret(clientSecret);
    }

    const config: HaloPSAConfig = { url, clientId, clientSecret: encryptedSecret };

    const { error } = await locals.supabase.from('integrations').upsert(
      { id: 'halopsa', tenant_id: locals.tenant!.id, config, deleted_at: null },
      { onConflict: 'id,tenant_id' },
    );

    if (error) return fail(500, { error: error.message });
    return { success: true };
  },

  testConnection: async ({ request }) => {
    const formData = await request.formData();
    const url = formData.get('url') as string;
    const clientId = formData.get('clientId') as string;
    const clientSecret = formData.get('clientSecret') as string;

    if (!url || !clientId || !clientSecret) {
      return fail(400, { error: 'URL, Client ID, and Client Secret are required' });
    }

    const connector = new HaloPSAConnector({ url, clientId, clientSecret });
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
      .eq('id', 'halopsa')
      .eq('tenant_id', locals.tenant!.id);

    if (error) return fail(500, { error: error.message });
    throw redirect(303, '/integrations');
  },
} satisfies Actions;
