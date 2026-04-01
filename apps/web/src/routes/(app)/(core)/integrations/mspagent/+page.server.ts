import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { decryptSecret } from '$lib/server/encryption';
import { DattoRMMConnector } from '@workspace/shared/lib/connectors/DattoRMMConnector';
import type { DattoRMMConfig } from '@workspace/shared/types/integrations/datto/index.js';
import type { MSPAgentConfig } from '@workspace/shared/types/integrations/mspagent/index.js';
import type { TablesInsert } from '@workspace/shared/types/database';

type MSPAgentLinkMeta = {
  rmm: 'dattormm';
  variableName: string;
  variableStatus: 'ok' | 'missing' | 'mismatch' | null;
  lastCheckedAt: string | null;
};

export const load: PageServerLoad = async ({}) => {};

async function getDattoConnector(locals: App.Locals) {
  const { data: dattoIntegration } = await locals.supabase
    .from('integrations')
    .select('*')
    .eq('id', 'dattormm')
    .eq('tenant_id', locals.tenant!.id)
    .is('deleted_at', null)
    .single();

  if (!dattoIntegration) return { error: 'DattoRMM integration not configured' };

  const dattoConfig = dattoIntegration.config as DattoRMMConfig;
  if (!dattoConfig?.url || !dattoConfig?.apiKey || !dattoConfig?.apiSecretKey) {
    return { error: 'DattoRMM integration not fully configured' };
  }

  const apiSecretKey = await decryptSecret(dattoConfig.apiSecretKey);
  if (!apiSecretKey) return { error: 'Failed to decrypt DattoRMM credentials' };

  return {
    connector: new DattoRMMConnector({ url: dattoConfig.url, apiKey: dattoConfig.apiKey, apiSecretKey }),
  };
}

export const actions = {
  pushVars: async ({ request, locals }) => {
    const formData = await request.formData();
    const siteIds = formData.getAll('siteId') as string[];

    const { data: mspagentIntegration } = await locals.supabase
      .from('integrations')
      .select('*')
      .eq('id', 'mspagent')
      .eq('tenant_id', locals.tenant!.id)
      .is('deleted_at', null)
      .single();

    const mspagentConfig = (mspagentIntegration?.config as MSPAgentConfig) ?? {};
    const variableName = mspagentConfig.siteVariableName ?? 'MSPSiteCode';

    const { connector, error: connectorError } = await getDattoConnector(locals);
    if (connectorError) return fail(404, { error: connectorError });

    let linksQuery = locals.supabase
      .from('integration_links')
      .select('*')
      .eq('integration_id', 'dattormm')
      .eq('tenant_id', locals.tenant!.id);

    if (siteIds.length > 0) {
      linksQuery = linksQuery.in('site_id', siteIds);
    }

    const { data: links, error: linksError } = await linksQuery;
    if (linksError) return fail(500, { error: linksError.message });

    let pushed = 0;
    let failed = 0;
    const errors: string[] = [];
    const mspagentUpserts: TablesInsert<'public', 'integration_links'>[] = [];

    for (const link of links ?? []) {
      if (!link.external_id || !link.site_id) continue;
      const { error } = await connector!.setSiteVariable(link.external_id, variableName, link.site_id);
      if (error) {
        failed++;
        errors.push(`${link.name ?? link.external_id}: ${error}`);
      } else {
        pushed++;
        mspagentUpserts.push({
          integration_id: 'mspagent',
          tenant_id: locals.tenant!.id,
          site_id: link.site_id,
          external_id: link.external_id,
          name: link.name,
          status: 'active',
          meta: {
            rmm: 'dattormm',
            variableName,
            variableStatus: null,
            lastCheckedAt: null,
          } as MSPAgentLinkMeta,
        });
      }
    }

    if (mspagentUpserts.length > 0) {
      await locals.supabase
        .from('integration_links')
        .upsert(mspagentUpserts as any, { onConflict: 'tenant_id,integration_id,site_id,external_id' });
    }

    return { pushResult: { pushed, failed, errors } };
  },

  checkVars: async ({ request, locals }) => {
    const formData = await request.formData();
    const siteId = formData.get('siteId') as string | null;

    const { data: mspagentIntegration } = await locals.supabase
      .from('integrations')
      .select('*')
      .eq('id', 'mspagent')
      .eq('tenant_id', locals.tenant!.id)
      .is('deleted_at', null)
      .single();

    const mspagentConfig = (mspagentIntegration?.config as MSPAgentConfig) ?? {};
    const variableName = mspagentConfig.siteVariableName ?? 'MSPSiteCode';

    const { connector, error: connectorError } = await getDattoConnector(locals);
    if (connectorError) return fail(404, { error: connectorError });

    let linksQuery = locals.supabase
      .from('integration_links')
      .select('*')
      .eq('integration_id', 'dattormm')
      .eq('tenant_id', locals.tenant!.id);

    if (siteId) {
      linksQuery = linksQuery.eq('site_id', siteId);
    }

    const { data: links, error: linksError } = await linksQuery;
    if (linksError) return fail(500, { error: linksError.message });

    type CheckResultItem = { siteId: string; status: 'ok' | 'missing' | 'mismatch'; currentValue: string | null };
    const checkResult: CheckResultItem[] = [];
    const mspagentUpserts: TablesInsert<'public', 'integration_links'>[] = [];

    for (const link of links ?? []) {
      if (!link.external_id || !link.site_id) continue;

      const { data: currentValue } = await connector!.getSiteVariable(link.external_id, variableName);

      let status: 'ok' | 'missing' | 'mismatch';
      if (currentValue === null || currentValue === undefined) {
        status = 'missing';
      } else if (currentValue === link.site_id) {
        status = 'ok';
      } else {
        status = 'mismatch';
      }

      checkResult.push({ siteId: link.site_id, status, currentValue: currentValue ?? null });

      mspagentUpserts.push({
        integration_id: 'mspagent',
        tenant_id: locals.tenant!.id,
        site_id: link.site_id,
        external_id: link.external_id,
        name: link.name,
        status: 'active',
        meta: {
          rmm: 'dattormm',
          variableName,
          variableStatus: status,
          lastCheckedAt: new Date().toISOString(),
        } as MSPAgentLinkMeta,
      });
    }

    if (mspagentUpserts.length > 0) {
      await locals.supabase
        .from('integration_links')
        .upsert(mspagentUpserts as any, { onConflict: 'tenant_id,integration_id,site_id,external_id' });
    }

    return { checkResult };
  },

  save: async ({ request, locals }) => {
    const formData = await request.formData();
    const primaryPsa = formData.get('primaryPsa') as string;
    const siteVariableName = (formData.get('siteVariableName') as string) || undefined;

    if (!primaryPsa) {
      return fail(400, { error: 'Primary PSA is required' });
    }

    const config: MSPAgentConfig = { primaryPsa, siteVariableName };

    const { error } = await locals.supabase.from('integrations').upsert(
      { id: 'mspagent', tenant_id: locals.tenant!.id, config, deleted_at: null },
      { onConflict: 'id,tenant_id' },
    );

    if (error) return fail(500, { error: error.message });
    return { success: true };
  },

  deleteIntegration: async ({ locals }) => {
    const { error } = await locals.supabase
      .from('integrations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', 'mspagent')
      .eq('tenant_id', locals.tenant!.id);

    if (error) return fail(500, { error: error.message });
    throw redirect(303, '/integrations');
  },
} satisfies Actions;
