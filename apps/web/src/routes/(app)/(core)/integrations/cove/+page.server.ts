import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { encryptSecret } from '$lib/server/encryption';
import { CoveConnector } from '@workspace/shared/lib/connectors/CoveConnector';
import type { CoveConnectorConfig } from '@workspace/shared/types/integrations/cove/index.js';

export const load: PageServerLoad = async ({}) => {};

export const actions = {
  save: async ({ request, locals }) => {
    const formData = await request.formData();
    const server = formData.get('server') as string;
    const partnerIdRaw = formData.get('partnerId') as string;
    const clientId = formData.get('clientId') as string;
    const clientSecret = formData.get('clientSecret') as string;

    if (!server || !clientId || !partnerIdRaw) {
      return fail(400, { error: 'Server URL, Partner ID, and Client ID are required' });
    }

    const partnerId = parseInt(partnerIdRaw, 10);
    if (isNaN(partnerId)) {
      return fail(400, { error: 'Partner ID must be a valid number' });
    }

    let encryptedSecret: string;

    if (!clientSecret) {
      const { data: existing } = await locals.supabase
        .from('integrations')
        .select('config')
        .eq('id', 'cove')
        .eq('tenant_id', locals.tenant!.id)
        .is('deleted_at', null)
        .single();

      const existingSecret = (existing?.config as CoveConnectorConfig)?.clientSecret;
      if (!existingSecret) {
        return fail(400, { error: 'Client Secret is required' });
      }
      encryptedSecret = existingSecret;
    } else {
      const connector = new CoveConnector({ server, partnerId, clientId, clientSecret });
      const result = await connector.checkHealth();
      if (!result.data) {
        return fail(400, { error: 'Connection failed: unable to authenticate with Cove' });
      }
      encryptedSecret = await encryptSecret(clientSecret);
    }

    const config: CoveConnectorConfig = { server, partnerId, clientId, clientSecret: encryptedSecret };

    const { error } = await locals.supabase.from('integrations').upsert(
      { id: 'cove', tenant_id: locals.tenant!.id, config, deleted_at: null },
      { onConflict: 'id,tenant_id' },
    );

    if (error) return fail(500, { error: error.message });
    return { success: true };
  },

  testConnection: async ({ request }) => {
    const formData = await request.formData();
    const server = formData.get('server') as string;
    const partnerIdRaw = formData.get('partnerId') as string;
    const clientId = formData.get('clientId') as string;
    const clientSecret = formData.get('clientSecret') as string;

    if (!server || !partnerIdRaw || !clientId || !clientSecret) {
      return fail(400, { error: 'All fields are required for connection test' });
    }

    const partnerId = parseInt(partnerIdRaw, 10);
    if (isNaN(partnerId)) {
      return fail(400, { error: 'Partner ID must be a valid number' });
    }

    const connector = new CoveConnector({ server, partnerId, clientId, clientSecret });
    const result = await connector.checkHealth();
    if (!result.data) {
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
    throw redirect(303, '/integrations');
  },
} satisfies Actions;
