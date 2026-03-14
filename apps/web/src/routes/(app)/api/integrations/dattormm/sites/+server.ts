import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { decryptSecret } from '$lib/server/encryption';
import { DattoRMMConnector } from '@workspace/shared/lib/connectors/DattoRMMConnector';
import type { DattoRMMConfig } from '@workspace/shared/types/integrations/datto/index.js';

export const GET: RequestHandler = async ({ locals }) => {
  const { data: integration } = await locals.supabase
    .from('integrations')
    .select('*')
    .eq('id', 'dattormm')
    .eq('tenant_id', locals.tenant!.id)
    .is('deleted_at', null)
    .single();

  if (!integration) {
    return json({ error: 'Integration not configured' }, { status: 404 });
  }

  const config = integration.config as DattoRMMConfig;
  if (!config?.url || !config?.apiKey || !config?.apiSecretKey) {
    return json({ error: 'Integration not fully configured' }, { status: 404 });
  }

  const apiSecretKey = await decryptSecret(config.apiSecretKey);
  if (!apiSecretKey) {
    return json({ error: 'Failed to decrypt credentials' }, { status: 500 });
  }

  const connector = new DattoRMMConnector({ url: config.url, apiKey: config.apiKey, apiSecretKey });
  const { data: sites, error } = await connector.getSites();

  if (error) {
    return json({ error }, { status: 500 });
  }

  return json(sites);
};
