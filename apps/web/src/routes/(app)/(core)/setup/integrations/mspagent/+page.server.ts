import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { decryptSecret } from '$lib/server/encryption';
import { DattoRMMConnector } from '@workspace/shared/lib/integrations/dattormm/connector';
import { DattoRMMConfigSchema } from '@workspace/shared/types/integrations/datto/index.js';
import {
  MSPAgentConfigSchema,
  type MSPAgentConfig,
} from '@workspace/shared/types/integrations/mspagent/index.js';
import type { TablesInsert } from '@workspace/shared/types/database';
import { isString } from '@workspace/shared/lib/utils/validators';

type MSPAgentLinkMeta = {
  rmm: 'dattormm';
  variableName: string;
  variableStatus: 'ok' | 'missing' | 'mismatch' | null;
  lastCheckedAt: string | null;
};

async function getDattoConnector(locals: App.Locals) {
  const { data: dattoIntegration } = await locals.supabase
    .from('integrations')
    .select('*')
    .eq('id', 'dattormm')
    .eq('tenant_id', locals.tenant!.id)
    .is('deleted_at', null)
    .single();

  if (!dattoIntegration) return { error: 'DattoRMM integration not configured' };

  const dattoConfig = DattoRMMConfigSchema.parse(dattoIntegration.config);
  if (!dattoConfig?.url || !dattoConfig?.apiKey || !dattoConfig?.apiSecretKey) {
    return { error: 'DattoRMM integration not fully configured' };
  }

  const apiSecretKey = await decryptSecret(dattoConfig.apiSecretKey);
  if (!apiSecretKey) return { error: 'Failed to decrypt DattoRMM credentials' };

  return {
    connector: new DattoRMMConnector({
      url: dattoConfig.url,
      apiKey: dattoConfig.apiKey,
      apiSecretKey,
    }),
  };
}

export const actions = {
  pushVars: async ({ request, locals }) => {
    const formData = await request.formData();
    const siteIds = formData.getAll('siteId');

    const { data: mspagentIntegration } = await locals.supabase
      .from('integrations')
      .select('*')
      .eq('id', 'mspagent')
      .eq('tenant_id', locals.tenant!.id)
      .is('deleted_at', null)
      .single();

    const mspagentConfig = MSPAgentConfigSchema.parse(mspagentIntegration?.config);
    const variableName = mspagentConfig.siteVariableName ?? 'MSPSiteCode';

    const { connector, error: connectorError } = await getDattoConnector(locals);
    if (connectorError) return fail(404, { error: connectorError });

    let linksQuery = locals.supabase
      .from('integration_links')
      .select('*')
      .eq('integration_id', 'dattormm')
      .eq('tenant_id', locals.tenant!.id);

    if (siteIds.length > 0) {
      linksQuery = linksQuery.in(
        'site_id',
        siteIds.map((si) => (isString(si) ? si : ''))
      );
    }

    const { data: links, error: linksError } = await linksQuery;
    if (linksError) return fail(500, { error: linksError.message });

    let pushed = 0;
    let failed = 0;
    const errors: string[] = [];
    const mspagentUpserts: TablesInsert<'public', 'integration_links'>[] = [];

    for (const link of links ?? []) {
      if (!link.external_id || !link.site_id) continue;
      try {
        await connector!.site.variables.set(link.external_id, variableName, link.site_id);
      } catch (err) {
        failed++;
        errors.push(
          `${link.name ?? link.external_id}: ${err instanceof Error ? err.message : String(err)}`
        );
        continue;
      }
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

    if (mspagentUpserts.length > 0) {
      await locals.supabase.from('integration_links').upsert(mspagentUpserts, {
        onConflict: 'tenant_id,integration_id,site_id,external_id',
      });
    }

    return { pushResult: { pushed, failed, errors } };
  },

  checkVars: async ({ request, locals }) => {
    const formData = await request.formData();
    const siteId = formData.get('siteId');

    const { data: mspagentIntegration } = await locals.supabase
      .from('integrations')
      .select('*')
      .eq('id', 'mspagent')
      .eq('tenant_id', locals.tenant!.id)
      .is('deleted_at', null)
      .single();

    const mspagentConfig = MSPAgentConfigSchema.parse(mspagentIntegration?.config);
    const variableName = mspagentConfig.siteVariableName ?? 'MSPSiteCode';

    const { connector, error: connectorError } = await getDattoConnector(locals);
    if (connectorError) return fail(404, { error: connectorError });

    let linksQuery = locals.supabase
      .from('integration_links')
      .select('*')
      .eq('integration_id', 'dattormm')
      .eq('tenant_id', locals.tenant!.id);

    if (isString(siteId)) {
      linksQuery = linksQuery.eq('site_id', siteId);
    }

    const { data: links, error: linksError } = await linksQuery;
    if (linksError) return fail(500, { error: linksError.message });

    type CheckResultItem = {
      siteId: string;
      status: 'ok' | 'missing' | 'mismatch';
      currentValue: string | null;
    };
    const checkResult: CheckResultItem[] = [];
    const mspagentUpserts: TablesInsert<'public', 'integration_links'>[] = [];

    for (const link of links ?? []) {
      if (!link.external_id || !link.site_id) continue;

      const currentValue = await connector!.site.variables.get(link.external_id, variableName);

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
      await locals.supabase.from('integration_links').upsert(mspagentUpserts, {
        onConflict: 'tenant_id,integration_id,site_id,external_id',
      });
    }

    return { checkResult };
  },

  save: async ({ request, locals }) => {
    const formData = await request.formData();
    const primaryPsa = formData.get('primaryPsa');
    const siteVariableName = formData.get('siteVariableName') || undefined;

    if (!primaryPsa || !isString(primaryPsa)) {
      return fail(400, { error: 'Primary PSA is required' });
    }

    const config: MSPAgentConfig = {
      primaryPsa,
      siteVariableName: isString(siteVariableName) ? siteVariableName : undefined,
    };

    const { error } = await locals.supabase
      .from('integrations')
      .upsert(
        { id: 'mspagent', tenant_id: locals.tenant!.id, config, deleted_at: null },
        { onConflict: 'id,tenant_id' }
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
    return redirect(303, '/integrations');
  },
} satisfies Actions;
