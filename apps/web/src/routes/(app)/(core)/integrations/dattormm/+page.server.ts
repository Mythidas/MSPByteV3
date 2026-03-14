import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { encryptSecret } from '$lib/server/encryption';
import { DattoRMMConnector } from '@workspace/shared/lib/connectors/DattoRMMConnector';
import type { DattoRMMConfig } from '@workspace/shared/types/integrations/datto/index.js';

export const load: PageServerLoad = async ({}) => {};

export const actions = {
  save: async ({ request, locals }) => {
    const formData = await request.formData();
    const url = formData.get('url') as string;
    const apiKey = formData.get('apiKey') as string;
    const apiSecretKey = formData.get('apiSecretKey') as string;
    const siteVariableName = (formData.get('siteVariableName') as string) || undefined;

    if (!url || !apiKey) {
      return fail(400, { error: 'URL and API Key are required' });
    }

    let encryptedSecret: string;

    if (!apiSecretKey) {
      const { data: existing } = await locals.supabase
        .from('integrations')
        .select('config')
        .eq('id', 'dattormm')
        .eq('tenant_id', locals.tenant!.id)
        .is('deleted_at', null)
        .single();

      const existingSecret = (existing?.config as DattoRMMConfig)?.apiSecretKey;
      if (!existingSecret) {
        return fail(400, { error: 'API Secret Key is required' });
      }
      encryptedSecret = existingSecret;
    } else {
      const connector = new DattoRMMConnector({ url, apiKey, apiSecretKey });
      const { error: healthError } = await connector.checkHealth();
      if (healthError) {
        return fail(400, { error: `Connection failed: ${healthError}` });
      }
      encryptedSecret = await encryptSecret(apiSecretKey);
    }

    const config: DattoRMMConfig = { url, apiKey, apiSecretKey: encryptedSecret, siteVariableName };

    const { error } = await locals.supabase.from('integrations').upsert(
      { id: 'dattormm', tenant_id: locals.tenant!.id, config, deleted_at: null },
      { onConflict: 'id,tenant_id' },
    );

    if (error) return fail(500, { error: error.message });
    return { success: true };
  },

  testConnection: async ({ request }) => {
    const formData = await request.formData();
    const url = formData.get('url') as string;
    const apiKey = formData.get('apiKey') as string;
    const apiSecretKey = formData.get('apiSecretKey') as string;

    if (!url || !apiKey || !apiSecretKey) {
      return fail(400, { error: 'URL, API Key, and API Secret Key are required' });
    }

    const connector = new DattoRMMConnector({ url, apiKey, apiSecretKey });
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
      .eq('id', 'dattormm')
      .eq('tenant_id', locals.tenant!.id);

    if (error) return fail(500, { error: error.message });
    throw redirect(303, '/integrations');
  },
} satisfies Actions;
