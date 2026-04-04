import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { encryptSecret, decryptSecret } from '$lib/server/encryption';
import { HaloPSAConnector } from '@workspace/shared/lib/integrations/halopsa/connector';
import { HaloPSAConfigSchema } from '@workspace/shared/types/integrations/halopsa/index.js';
import type { HaloPSASite } from '@workspace/shared/types/integrations/halopsa/sites.js';
import { isString } from '@workspace/shared/lib/utils/validators';

type PageParent = Parameters<PageServerLoad>[0]['parent'];
async function getHalopSites(parent: PageParent, tenantId: string): Promise<HaloPSASite[]> {
  const { getIntegration } = await parent();
  const integration = await getIntegration;
  if (!integration) return [];
  const config = HaloPSAConfigSchema.safeParse(integration.config);
  if (!config.success || !config.data.url || !config.data.clientId || !config.data.clientSecret)
    return [];
  const clientSecret = await decryptSecret(config.data.clientSecret);
  if (!clientSecret) return [];
  const connector = new HaloPSAConnector(
    { url: config.data.url, clientId: config.data.clientId, clientSecret },
    tenantId
  );
  return connector.site.list().catch(() => []);
}

export const load: PageServerLoad = ({ parent, locals }) => {
  return { getHalopSites: getHalopSites(parent, locals.tenant!.id) };
};

export const actions = {
  save: async ({ request, locals }) => {
    const formData = await request.formData();
    const url = formData.get('url');
    const clientId = formData.get('clientId');
    const clientSecret = formData.get('clientSecret');

    if (!isString(url) || !isString(clientId)) {
      return fail(400, { error: 'URL and Client ID are required' });
    }

    let encryptedSecret: string;

    if (!isString(clientSecret)) {
      // Keep existing secret if not re-entered
      const { data: existing } = await locals.supabase
        .from('integrations')
        .select('config')
        .eq('id', 'halopsa')
        .eq('tenant_id', locals.tenant!.id)
        .is('deleted_at', null)
        .single();

      const existingConfig = HaloPSAConfigSchema.safeParse(existing?.config);
      if (!existingConfig.success || !existingConfig.data.clientSecret) {
        return fail(400, { error: 'Client Secret is required' });
      }
      encryptedSecret = existingConfig.data.clientSecret;
    } else {
      const connector = new HaloPSAConnector({ url, clientId, clientSecret }, locals.tenant!.id);
      const healthy = await connector.checkHealth();
      if (!healthy) {
        return fail(400, { error: 'Connection failed: unable to authenticate with HaloPSA' });
      }
      encryptedSecret = await encryptSecret(clientSecret);
    }

    const config = { url, clientId, clientSecret: encryptedSecret };

    const { error } = await locals.supabase
      .from('integrations')
      .upsert(
        { id: 'halopsa', tenant_id: locals.tenant!.id, config, deleted_at: null },
        { onConflict: 'id,tenant_id' }
      );

    if (error) return fail(500, { error: error.message });
    return { success: true };
  },

  testConnection: async ({ request, locals }) => {
    const formData = await request.formData();
    const url = formData.get('url');
    const clientId = formData.get('clientId');
    const clientSecret = formData.get('clientSecret');

    if (!isString(url) || !isString(clientId) || !isString(clientSecret)) {
      return fail(400, { error: 'URL, Client ID, and Client Secret are required' });
    }

    const connector = new HaloPSAConnector({ url, clientId, clientSecret }, locals.tenant!.id);
    const healthy = await connector.checkHealth();
    if (!healthy) {
      return fail(400, { error: 'Connection failed: unable to authenticate with HaloPSA' });
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
    return redirect(303, '/integrations');
  },
} satisfies Actions;
