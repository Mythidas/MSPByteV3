import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { decryptSecret } from '$lib/server/encryption';
import { DattoRMMConnector } from '@workspace/shared/lib/connectors/DattoRMMConnector';
import type { DattoRMMConfig } from '@workspace/shared/types/integrations/datto/index.js';
import type { MSPAgentConfig } from '@workspace/shared/types/integrations/mspagent/index.js';

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json().catch(() => ({}));
  const siteIds: string[] | undefined = body.siteIds;

  const { data: mspagentIntegration } = await locals.supabase
    .from('integrations')
    .select('*')
    .eq('id', 'mspagent')
    .eq('tenant_id', locals.tenant!.id)
    .is('deleted_at', null)
    .single();

  const mspagentConfig = (mspagentIntegration?.config as MSPAgentConfig) ?? {};
  const variableName = mspagentConfig.siteVariableName ?? 'MSPSiteCode';

  const { data: dattoIntegration } = await locals.supabase
    .from('integrations')
    .select('*')
    .eq('id', 'dattormm')
    .eq('tenant_id', locals.tenant!.id)
    .is('deleted_at', null)
    .single();

  if (!dattoIntegration) {
    return json({ error: 'DattoRMM integration not configured' }, { status: 404 });
  }

  const dattoConfig = dattoIntegration.config as DattoRMMConfig;
  if (!dattoConfig?.url || !dattoConfig?.apiKey || !dattoConfig?.apiSecretKey) {
    return json({ error: 'DattoRMM integration not fully configured' }, { status: 404 });
  }

  const apiSecretKey = await decryptSecret(dattoConfig.apiSecretKey);
  if (!apiSecretKey) {
    return json({ error: 'Failed to decrypt DattoRMM credentials' }, { status: 500 });
  }

  let linksQuery = locals.supabase
    .from('integration_links')
    .select('*')
    .eq('integration_id', 'dattormm')
    .eq('tenant_id', locals.tenant!.id);

  if (siteIds && siteIds.length > 0) {
    linksQuery = linksQuery.in('site_id', siteIds);
  }

  const { data: links, error: linksError } = await linksQuery;
  if (linksError) {
    return json({ error: linksError.message }, { status: 500 });
  }

  const connector = new DattoRMMConnector({
    url: dattoConfig.url,
    apiKey: dattoConfig.apiKey,
    apiSecretKey,
  });

  let pushed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const link of links ?? []) {
    if (!link.external_id || !link.site_id) continue;

    const { error } = await connector.setSiteVariable(link.external_id, variableName, link.site_id);
    if (error) {
      failed++;
      errors.push(`${link.name ?? link.external_id}: ${error}`);
    } else {
      pushed++;
    }
  }

  return json({ pushed, failed, errors });
};
