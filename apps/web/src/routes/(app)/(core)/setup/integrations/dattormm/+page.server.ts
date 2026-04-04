import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { encryptSecret, decryptSecret } from '$lib/server/encryption';
import { DattoRMMConnector } from '@workspace/shared/lib/integrations/dattormm/connector';
import {
  DattoRMMConfigSchema,
  type DattoRMMConfig,
} from '@workspace/shared/types/integrations/datto/index.js';
import type { DattoRMMSite } from '@workspace/shared/types/integrations/datto/sites.js';
import { isString } from '@workspace/shared/lib/utils/validators';

type PageParent = Parameters<PageServerLoad>[0]['parent'];
async function getDattoSites(parent: PageParent, tenantId: string): Promise<DattoRMMSite[]> {
  const { getIntegration } = await parent();
  const integration = await getIntegration;
  if (!integration) return [];
  const config = DattoRMMConfigSchema.parse(integration.config);
  if (!config?.url || !config?.apiKey || !config?.apiSecretKey) return [];
  const apiSecretKey = await decryptSecret(config.apiSecretKey);
  if (!apiSecretKey) return [];
  const connector = new DattoRMMConnector(
    { url: config.url, apiKey: config.apiKey, apiSecretKey },
    tenantId
  );
  return connector.account.sites.list().catch(() => []);
}

export const load: PageServerLoad = ({ parent, locals }) => {
  return { getDattoSites: getDattoSites(parent, locals.tenant!.id) };
};

export const actions = {
  save: async ({ request, locals }) => {
    const formData = await request.formData();
    const url = formData.get('url');
    const apiKey = formData.get('apiKey');
    const apiSecretKey = formData.get('apiSecretKey');
    const siteVariableNameRaw = formData.get('siteVariableName');
    const siteVariableName = isString(siteVariableNameRaw) ? siteVariableNameRaw : undefined;

    if (!isString(url) || !isString(apiKey)) {
      return fail(400, { error: 'URL and API Key are required' });
    }

    let encryptedSecret: string;

    if (!isString(apiSecretKey)) {
      const { data: existing } = await locals.supabase
        .from('integrations')
        .select('config')
        .eq('id', 'dattormm')
        .eq('tenant_id', locals.tenant!.id)
        .is('deleted_at', null)
        .single();

      const existingConfig = DattoRMMConfigSchema.safeParse(existing?.config);
      if (!existingConfig.success || !existingConfig.data.apiSecretKey) {
        return fail(400, { error: 'API Secret Key is required' });
      }
      encryptedSecret = existingConfig.data.apiSecretKey;
    } else {
      const connector = new DattoRMMConnector({ url, apiKey, apiSecretKey }, locals.tenant!.id);
      const healthy = await connector.checkHealth();
      if (!healthy) {
        return fail(400, { error: 'Connection failed: unable to authenticate with DattoRMM' });
      }
      encryptedSecret = await encryptSecret(apiSecretKey);
    }

    const credentialExpirationRaw = formData.get('credentialExpiration');
    const credentialExpiration = isString(credentialExpirationRaw) ? credentialExpirationRaw : null;
    const config: DattoRMMConfig = { url, apiKey, apiSecretKey: encryptedSecret, siteVariableName };

    const { error } = await locals.supabase
      .from('integrations')
      .upsert(
        {
          id: 'dattormm',
          tenant_id: locals.tenant!.id,
          config,
          deleted_at: null,
          credential_expiration: credentialExpiration,
        },
        { onConflict: 'id,tenant_id' }
      );

    if (error) return fail(500, { error: error.message });
    return { success: true };
  },

  testConnection: async ({ request, locals }) => {
    const formData = await request.formData();
    const url = formData.get('url');
    const apiKey = formData.get('apiKey');
    const apiSecretKey = formData.get('apiSecretKey');

    if (!isString(url) || !isString(apiKey) || !isString(apiSecretKey)) {
      return fail(400, { error: 'URL, API Key, and API Secret Key are required' });
    }

    const connector = new DattoRMMConnector({ url, apiKey, apiSecretKey }, locals.tenant!.id);
    const healthy = await connector.checkHealth();
    if (!healthy) {
      return fail(400, { error: 'Connection failed: unable to authenticate with DattoRMM' });
    }

    return { success: true };
  },

  deleteIntegration: async ({ locals }) => {
    const { error } = await locals.supabase
      .from('integrations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', 'dattormm')
      .eq('tenant_id', locals.tenant!.id);

    if (error) return fail(500, { error: error.message });
    return redirect(303, '/integrations');
  },
} satisfies Actions;
