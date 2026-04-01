import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { decryptSecret } from '$lib/server/encryption';
import { DattoRMMConnector } from '@workspace/shared/lib/connectors/DattoRMMConnector';
import { CoveConnector } from '@workspace/shared/lib/connectors/CoveConnector';
import { SophosPartnerConnector } from '@workspace/shared/lib/connectors/SophosConnector';
import { HaloPSAConnector } from '@workspace/shared/lib/connectors/HaloPSAConnector';
import type { DattoRMMConfig } from '@workspace/shared/types/integrations/datto/index.js';
import type { CoveConnectorConfig } from '@workspace/shared/types/integrations/cove/index.js';
import type { SophosPartnerConfig } from '@workspace/shared/types/integrations/sophos/index.js';
import type { HaloPSAConfig } from '@workspace/shared/types/integrations/halopsa/index.js';

export type ExternalResource = { id: string; name: string };

async function getMappedExternalIds(
  locals: App.Locals,
  integrationId: string,
): Promise<Set<string>> {
  const { data } = await locals.supabase
    .from('integration_links')
    .select('external_id')
    .eq('integration_id', integrationId)
    .eq('tenant_id', locals.tenant!.id)
    .not('site_id', 'is', null);
  return new Set((data ?? []).map((l) => l.external_id));
}

async function getDattoResources(locals: App.Locals): Promise<ExternalResource[]> {
  const { data: integration } = await locals.supabase
    .from('integrations')
    .select('config')
    .eq('id', 'dattormm')
    .eq('tenant_id', locals.tenant!.id)
    .is('deleted_at', null)
    .single();
  if (!integration) return [];
  const config = integration.config as DattoRMMConfig;
  if (!config?.url || !config?.apiKey || !config?.apiSecretKey) return [];
  const apiSecretKey = await decryptSecret(config.apiSecretKey);
  if (!apiSecretKey) return [];
  const [{ data }, mapped] = await Promise.all([
    new DattoRMMConnector({ url: config.url, apiKey: config.apiKey, apiSecretKey }).getSites(),
    getMappedExternalIds(locals, 'dattormm'),
  ]);
  return (data ?? []).filter((s) => !mapped.has(s.uid)).map((s) => ({ id: s.uid, name: s.name }));
}

async function getCoveResources(locals: App.Locals): Promise<ExternalResource[]> {
  const { data: integration } = await locals.supabase
    .from('integrations')
    .select('config')
    .eq('id', 'cove')
    .eq('tenant_id', locals.tenant!.id)
    .is('deleted_at', null)
    .single();
  if (!integration) return [];
  const config = integration.config as CoveConnectorConfig;
  if (!config?.server || !config?.clientId || !config?.clientSecret || config?.partnerId == null)
    return [];
  const clientSecret = await decryptSecret(config.clientSecret);
  if (!clientSecret) return [];
  const [{ data }, mapped] = await Promise.all([
    new CoveConnector({
      server: config.server,
      partnerId: config.partnerId,
      clientId: config.clientId,
      clientSecret,
    }).getCustomers(),
    getMappedExternalIds(locals, 'cove'),
  ]);
  return (data ?? [])
    .flatMap((c) => c)
    .filter((c) => !mapped.has(String(c.Info.Id)))
    .map((c) => ({ id: String(c.Info.Id), name: c.Info.Name }));
}

async function getSophosResources(locals: App.Locals): Promise<ExternalResource[]> {
  const { data: integration } = await locals.supabase
    .from('integrations')
    .select('config')
    .eq('id', 'sophos-partner')
    .eq('tenant_id', locals.tenant!.id)
    .is('deleted_at', null)
    .single();
  if (!integration) return [];
  const config = integration.config as SophosPartnerConfig;
  if (!config?.clientId || !config?.clientSecret) return [];
  const clientSecret = await decryptSecret(config.clientSecret);
  if (!clientSecret) return [];
  const [{ data }, mapped] = await Promise.all([
    new SophosPartnerConnector({ clientId: config.clientId, clientSecret }).getTenants(),
    getMappedExternalIds(locals, 'sophos-partner'),
  ]);
  return (data ?? []).filter((t) => !mapped.has(t.id)).map((t) => ({ id: t.id, name: t.name }));
}

async function getHaloResources(locals: App.Locals): Promise<ExternalResource[]> {
  const { data: integration } = await locals.supabase
    .from('integrations')
    .select('config')
    .eq('id', 'halopsa')
    .eq('tenant_id', locals.tenant!.id)
    .is('deleted_at', null)
    .single();
  if (!integration) return [];
  const config = integration.config as HaloPSAConfig;
  if (!config?.url || !config?.clientId || !config?.clientSecret) return [];
  const clientSecret = await decryptSecret(config.clientSecret);
  if (!clientSecret) return [];
  const [{ data }, mapped] = await Promise.all([
    new HaloPSAConnector({ url: config.url, clientId: config.clientId, clientSecret }).getSites(),
    getMappedExternalIds(locals, 'halopsa'),
  ]);
  return (data ?? [])
    .filter((s) => !mapped.has(String(s.id)))
    .map((s) => ({ id: String(s.id), name: s.clientsite_name }));
}

export const load: PageServerLoad = async ({ locals }) => ({
  dattoResources: getDattoResources(locals),
  coveResources: getCoveResources(locals),
  sophosResources: getSophosResources(locals),
  haloResources: getHaloResources(locals),
});

export const actions: Actions = {
  createSite: async ({ locals, request }) => {
    const formData = await request.formData();
    const name = (formData.get('name') as string)?.trim();
    if (!name) return fail(400, { message: 'Site name is required' });

    const { data: site, error: siteError } = await locals.supabase
      .from('sites')
      .insert({ name, tenant_id: locals.tenant!.id })
      .select('id')
      .single();
    if (siteError) return fail(500, { message: siteError.message });

    const MAPPABLE = ['dattormm', 'cove', 'sophos-partner', 'halopsa'] as const;
    const toUpsert = [];

    for (const integrationId of MAPPABLE) {
      const externalId = (formData.get(`${integrationId}_external_id`) as string)?.trim();
      const externalName = (formData.get(`${integrationId}_external_name`) as string)?.trim();
      if (!externalId) continue;
      toUpsert.push({
        integration_id: integrationId,
        tenant_id: locals.tenant!.id,
        site_id: site.id,
        external_id: externalId,
        name: externalName || externalId,
        status: 'active',
      });
    }

    if (toUpsert.length > 0) {
      const { error } = await locals.supabase
        .from('integration_links')
        .upsert(toUpsert, { onConflict: 'tenant_id,integration_id,site_id,external_id' });
      if (error) return fail(500, { message: error.message });
    }

    return { success: true };
  },
};
