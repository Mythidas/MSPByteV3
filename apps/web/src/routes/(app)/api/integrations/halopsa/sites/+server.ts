import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { decryptSecret } from '$lib/server/encryption';
import { HaloPSAConnector } from '@workspace/shared/lib/connectors/HaloPSAConnector';
import type { HaloPSAConfig } from '@workspace/shared/types/integrations/halopsa/index.js';

export const GET: RequestHandler = async ({ locals }) => {
  const { data: integration } = await locals.supabase
    .from('integrations')
    .select('*')
    .eq('id', 'halopsa')
    .eq('tenant_id', locals.tenant!.id)
    .is('deleted_at', null)
    .single();

  if (!integration) {
    return json({ error: 'Integration not configured' }, { status: 404 });
  }

  const config = integration.config as HaloPSAConfig;
  if (!config?.url || !config?.clientId || !config?.clientSecret) {
    return json({ error: 'Integration not fully configured' }, { status: 404 });
  }

  const clientSecret = await decryptSecret(config.clientSecret);
  if (!clientSecret) {
    return json({ error: 'Failed to decrypt credentials' }, { status: 500 });
  }

  const connector = new HaloPSAConnector({ url: config.url, clientId: config.clientId, clientSecret });
  const { data: sites, error } = await connector.getSites();

  if (error) {
    return json({ error }, { status: 500 });
  }

  return json(sites);
};
