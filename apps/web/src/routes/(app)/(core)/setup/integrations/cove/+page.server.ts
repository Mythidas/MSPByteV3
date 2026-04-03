import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { encryptSecret, decryptSecret } from '$lib/server/encryption';
import { CoveConnector } from '@workspace/shared/lib/integrations/cove/connector';
import {
  CoveConnectorConfigSchema,
  type CoveConnectorConfig,
} from '@workspace/shared/types/integrations/cove/index.js';
import type { CoveChildPartner } from '@workspace/shared/types/integrations/cove/partners.js';
import { isString } from '@workspace/shared/lib/utils/validators';

type PageParent = Parameters<PageServerLoad>[0]['parent'];
async function getCustomers(parent: PageParent): Promise<CoveChildPartner[]> {
  const { getIntegration } = await parent();
  const integration = await getIntegration;
  if (!integration) return [];
  const config = CoveConnectorConfigSchema.parse(integration.config);
  if (!config?.server || !config?.clientId || !config?.clientSecret || config?.partnerId == null) return [];
  const clientSecret = await decryptSecret(config.clientSecret);
  if (!clientSecret) return [];
  const connector = new CoveConnector({
    server: config.server,
    partnerId: config.partnerId,
    clientId: config.clientId,
    clientSecret,
  });
  const data = await connector.partner.children.list().catch(() => []);
  return data;
}

export const load: PageServerLoad = ({ parent }) => {
  return { getCustomers: getCustomers(parent) };
};

export const actions = {
  save: async ({ request, locals }) => {
    const formData = await request.formData();
    const server = formData.get('server');
    const partnerIdRaw = formData.get('partnerId');
    const clientId = formData.get('clientId');
    const clientSecret = formData.get('clientSecret');

    if (!isString(server) || !isString(clientId) || !isString(partnerIdRaw)) {
      return fail(400, { error: 'Server URL, Partner ID, and Client ID are required' });
    }

    const partnerId = parseInt(partnerIdRaw, 10);
    if (isNaN(partnerId)) {
      return fail(400, { error: 'Partner ID must be a valid number' });
    }

    let encryptedSecret: string;

    if (!isString(clientSecret)) {
      const { data: existing } = await locals.supabase
        .from('integrations')
        .select('config')
        .eq('id', 'cove')
        .eq('tenant_id', locals.tenant!.id)
        .is('deleted_at', null)
        .single();

      const existingConfig = CoveConnectorConfigSchema.safeParse(existing?.config);
      if (!existingConfig.success || !existingConfig.data.clientSecret) {
        return fail(400, { error: 'Client Secret is required' });
      }
      encryptedSecret = existingConfig.data.clientSecret;
    } else {
      const connector = new CoveConnector({ server, partnerId, clientId, clientSecret });
      const healthy = await connector.checkHealth();
      if (!healthy) {
        return fail(400, { error: 'Connection failed: unable to authenticate with Cove' });
      }
      encryptedSecret = await encryptSecret(clientSecret);
    }

    const credentialExpirationRaw = formData.get('credentialExpiration');
    const credentialExpiration = isString(credentialExpirationRaw) ? credentialExpirationRaw : null;
    const config: CoveConnectorConfig = { server, partnerId, clientId, clientSecret: encryptedSecret };

    const { error } = await locals.supabase.from('integrations').upsert(
      { id: 'cove', tenant_id: locals.tenant!.id, config, deleted_at: null, credential_expiration: credentialExpiration },
      { onConflict: 'id,tenant_id' },
    );

    if (error) return fail(500, { error: error.message });
    return { success: true };
  },

  testConnection: async ({ request }) => {
    const formData = await request.formData();
    const server = formData.get('server');
    const partnerIdRaw = formData.get('partnerId');
    const clientId = formData.get('clientId');
    const clientSecret = formData.get('clientSecret');

    if (!isString(server) || !isString(partnerIdRaw) || !isString(clientId) || !isString(clientSecret)) {
      return fail(400, { error: 'All fields are required for connection test' });
    }

    const partnerId = parseInt(partnerIdRaw, 10);
    if (isNaN(partnerId)) {
      return fail(400, { error: 'Partner ID must be a valid number' });
    }

    const connector = new CoveConnector({ server, partnerId, clientId, clientSecret });
    const healthy = await connector.checkHealth();
    if (!healthy) {
      return fail(400, { error: 'Connection failed: unable to authenticate with Cove' });
    }

    return { success: true };
  },

  deleteIntegration: async ({ locals }) => {
    const { error } = await locals.supabase
      .from('integrations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', 'cove')
      .eq('tenant_id', locals.tenant!.id);

    if (error) return fail(500, { error: error.message });
    return redirect(303, '/integrations');
  },
} satisfies Actions;
