import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { encryptSecret, decryptSecret } from '$lib/server/encryption';
import { SophosPartnerConnector } from '@workspace/shared/lib/integrations/sophos-partner/connector';
import {
  SophosPartnerConfigSchema,
  type SophosPartnerConfig,
  type SophosPartnerTenant,
} from '@workspace/shared/types/integrations/sophos/index.js';
import { isString } from '@workspace/shared/lib/utils/validators';

async function getTenants(locals: App.Locals): Promise<SophosPartnerTenant[]> {
  const { data: integration } = await locals.supabase
    .from('integrations')
    .select('config')
    .eq('id', 'sophos-partner')
    .single();
  if (!integration) return [];
  const config = SophosPartnerConfigSchema.parse(integration.config);
  if (!config?.clientId || !config?.clientSecret) return [];

  const clientSecret = await decryptSecret(config.clientSecret);
  if (!clientSecret) return [];
  const connector = new SophosPartnerConnector({ clientId: config.clientId, clientSecret }, locals.tenant!.id);
  try {
    return await connector.partner.tenants.list();
  } catch {
    return [];
  }
}

export const load: PageServerLoad = ({ locals }) => {
  return { getTenants: getTenants(locals) };
};

export const actions = {
  save: async ({ request, locals }) => {
    const formData = await request.formData();
    const clientId = formData.get('clientId');
    const clientSecret = formData.get('clientSecret');

    if (!clientId || !isString(clientId) || !isString(clientSecret)) {
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

      const existingConfig = SophosPartnerConfigSchema.parse(existing?.config);
      const existingSecret = existingConfig?.clientSecret;
      if (!existingSecret) {
        return fail(400, { error: 'Client Secret is required' });
      }
      encryptedSecret = existingSecret;
    } else {
      const connector = new SophosPartnerConnector({ clientId, clientSecret });
      const healthy = await connector.checkHealth();
      if (!healthy) {
        return fail(400, { error: 'Connection failed' });
      }
      encryptedSecret = await encryptSecret(clientSecret);
    }

    const credentialExpiration = formData.get('credentialExpiration') || null;
    const config: SophosPartnerConfig = { clientId, clientSecret: encryptedSecret };

    const { error } = await locals.supabase.from('integrations').upsert(
      {
        id: 'sophos-partner',
        tenant_id: locals.tenant!.id,
        config,
        deleted_at: null,
        credential_expiration: isString(credentialExpiration) ? credentialExpiration : null,
      },
      { onConflict: 'id,tenant_id' }
    );

    if (error) return fail(500, { error: error.message });
    return { success: true };
  },

  testConnection: async ({ request }) => {
    const formData = await request.formData();
    const clientId = formData.get('clientId');
    const clientSecret = formData.get('clientSecret');

    if (!clientId || !clientSecret || !isString(clientId) || !isString(clientSecret)) {
      return fail(400, { error: 'Client ID and Client Secret are required' });
    }

    const connector = new SophosPartnerConnector({ clientId, clientSecret });
    const healthy = await connector.checkHealth();
    if (!healthy) {
      return fail(400, { error: 'Connection failed' });
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
    return redirect(303, '/integrations');
  },
} satisfies Actions;
