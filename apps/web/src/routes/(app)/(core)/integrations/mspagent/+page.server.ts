import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { decryptSecret } from '$lib/server/encryption';
import { DattoRMMConnector } from '@workspace/shared/lib/connectors/DattoRMMConnector';
import type { DattoRMMConfig } from '@workspace/shared/types/integrations/datto/index.js';
import type { MSPAgentConfig } from '@workspace/shared/types/integrations/mspagent/index.js';

export const load: PageServerLoad = async ({}) => {};

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

    const { data: dattoIntegration } = await locals.supabase
      .from('integrations')
      .select('*')
      .eq('id', 'dattormm')
      .eq('tenant_id', locals.tenant!.id)
      .is('deleted_at', null)
      .single();

    if (!dattoIntegration) {
      return fail(404, { error: 'DattoRMM integration not configured' });
    }

    const dattoConfig = dattoIntegration.config as DattoRMMConfig;
    if (!dattoConfig?.url || !dattoConfig?.apiKey || !dattoConfig?.apiSecretKey) {
      return fail(404, { error: 'DattoRMM integration not fully configured' });
    }

    const apiSecretKey = await decryptSecret(dattoConfig.apiSecretKey);
    if (!apiSecretKey) {
      return fail(500, { error: 'Failed to decrypt DattoRMM credentials' });
    }

    let linksQuery = locals.supabase
      .from('integration_links')
      .select('*')
      .eq('integration_id', 'dattormm')
      .eq('tenant_id', locals.tenant!.id);

    if (siteIds.length > 0) {
      linksQuery = linksQuery.in('site_id', siteIds);
    }

    const { data: links, error: linksError } = await linksQuery;
    if (linksError) {
      return fail(500, { error: linksError.message });
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

    return { pushResult: { pushed, failed, errors } };
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
