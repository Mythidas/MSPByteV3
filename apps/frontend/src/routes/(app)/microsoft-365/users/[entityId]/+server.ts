import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Microsoft365Connector } from '@workspace/shared/lib/connectors/Microsoft365Connector';
import { Encryption } from '$lib/server/encryption';
import { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET } from '$env/static/private';
import { Logger } from '@workspace/shared/lib/utils/logger';

export const GET: RequestHandler = async ({ locals, params, url }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  const tab = url.searchParams.get('tab');
  if (tab !== 'groups' && tab !== 'roles') {
    throw error(400, 'Invalid tab parameter. Must be "groups" or "roles".');
  }

  const { entityId } = params;

  // Fetch entity from d_entities_view
  const { data: entity, error: entityError } = await locals.supabase
    .schema('views')
    .from('d_entities_view')
    .select('external_id, connection_id')
    .eq('id', entityId)
    .single();

  if (entityError || !entity) {
    throw error(404, 'Entity not found');
  }

  const externalId = entity.external_id;
  const connectionId = entity.connection_id;

  if (!externalId || !connectionId) {
    throw error(422, 'Entity missing external_id or connection_id');
  }

  // Fetch the integration connection to get the customer MS tenant ID
  const { data: connection, error: connError } = await locals.orm.selectSingle(
    'public',
    'integration_connections',
    (q) => q.eq('id', connectionId)
  );

  if (connError || !connection) {
    throw error(404, 'Integration connection not found');
  }

  const customerTenantId = connection.external_id;

  // Fetch integration config to get MSP tenant ID
  const { data: integration, error: integError } = await locals.orm.selectSingle(
    'public',
    'integrations',
    (q) => q.eq('id', 'microsoft-365')
  );

  if (integError || !integration) {
    throw error(404, 'Microsoft 365 integration not configured');
  }

  const config = integration.config as any;
  const mspTenantId = config?.tenantId as string | undefined;

  if (!mspTenantId) {
    throw error(422, 'MSP tenant ID not configured');
  }

  const clientId = MICROSOFT_CLIENT_ID;
  const clientSecret = MICROSOFT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw error(500, 'Microsoft credentials not configured');
  }

  const refreshToken = config?.refreshToken ? Encryption.decrypt(config.refreshToken) : undefined;

  try {
    const connector = new Microsoft365Connector({
      tenantId: mspTenantId,
      clientId,
      clientSecret,
      mode: 'partner',
      refreshToken,
    }).forTenant(customerTenantId);

    const { data, error: connectorError } = await connector.getUserMemberOf(externalId, true);

    if (connectorError) {
      Logger.error({
        module: 'M365UserDetail',
        context: `GET /microsoft-365/users/${entityId}`,
        message: connectorError.message,
      });
      throw error(502, `Graph API error: ${connectorError.message}`);
    }

    const members = data?.members ?? [];

    let filtered: any[];
    if (tab === 'groups') {
      filtered = members.filter(
        (m) => m['@odata.type'] === '#microsoft.graph.group'
      );
    } else {
      filtered = members.filter(
        (m) => m['@odata.type'] === '#microsoft.graph.directoryRole'
      );
    }

    return json(filtered);
  } catch (err: any) {
    if (err?.status) throw err;
    Logger.error({
      module: 'M365UserDetail',
      context: `GET /microsoft-365/users/${entityId}`,
      message: String(err),
    });
    throw error(500, 'Unexpected error fetching live Graph data');
  }
};
