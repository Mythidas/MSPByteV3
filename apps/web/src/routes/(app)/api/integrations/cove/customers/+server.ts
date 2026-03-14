import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { decryptSecret } from '$lib/server/encryption';
import { CoveConnector } from '@workspace/shared/lib/connectors/CoveConnector';
import type { CoveConnectorConfig } from '@workspace/shared/types/integrations/cove/index.js';
import type { CoveChildPartner } from '@workspace/shared/types/integrations/cove/partners.js';

function flattenCustomers(customers: CoveChildPartner[]): CoveChildPartner[] {
  return customers.flatMap((c) => [
    ...(c.Info.Level === 'EndCustomer' ? [c] : []),
    ...flattenCustomers(c.Children ?? []),
  ]);
}

export const GET: RequestHandler = async ({ locals }) => {
  const { data: integration } = await locals.supabase
    .from('integrations')
    .select('*')
    .eq('id', 'cove')
    .eq('tenant_id', locals.tenant!.id)
    .is('deleted_at', null)
    .single();

  if (!integration) {
    return json({ error: 'Integration not configured' }, { status: 404 });
  }

  const config = integration.config as CoveConnectorConfig;
  if (!config?.server || !config?.clientId || !config?.clientSecret || config?.partnerId == null) {
    return json({ error: 'Integration not fully configured' }, { status: 404 });
  }

  const clientSecret = await decryptSecret(config.clientSecret);
  if (!clientSecret) {
    return json({ error: 'Failed to decrypt credentials' }, { status: 500 });
  }

  const connector = new CoveConnector({
    server: config.server,
    partnerId: config.partnerId,
    clientId: config.clientId,
    clientSecret,
  });
  const { data: customers, error } = await connector.getCustomers();

  if (error) {
    return json({ error }, { status: 500 });
  }

  const endCustomers = flattenCustomers(customers ?? []);
  return json(endCustomers);
};
