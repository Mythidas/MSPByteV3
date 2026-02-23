import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { DattoRMMConnector } from '@workspace/shared/lib/connectors/DattoRMMConnector';
import { mspagentConfigSchema } from './_forms';
import { Encryption } from '$lib/server/encryption';
import { ORM } from '@workspace/shared/lib/utils/orm';

const getDattoConnector = async (orm: ORM) => {
  const { data } = await orm.selectSingle('public', 'integrations', (q) => q.eq('id', 'dattormm'));
  if (!data) return null;

  const config = data.config as any;
  config.apiSecretKey = Encryption.decrypt(config.apiSecretKey);
  return new DattoRMMConnector(config);
};

const fetchLinks = async (orm: ORM) => {
  const { data } = await orm.select('public', 'site_to_integration', (q) =>
    q.eq('integration_id', 'dattormm')
  );
  return data?.rows || [];
};

const fetchDattoSites = async (orm: ORM) => {
  const connector = await getDattoConnector(orm);
  if (!connector) return { data: [] };

  const { data, error } = await connector.getSites();
  if (error) return { error };
  return { data: data.map((s) => ({ id: s.id, uid: s.uid, name: s.name })) };
};

export const load: PageServerLoad = async ({ locals }) => {
  const { data: integration } = await locals.orm.selectSingle('public', 'integrations', (q) =>
    q.eq('id', 'mspagent')
  );
  const { data: dattoIntegration } = await locals.orm.selectSingle('public', 'integrations', (q) =>
    q.eq('id', 'dattormm')
  );
  const { data: sites } = await locals.orm.select('public', 'sites');

  const formDefaults = integration?.config
    ? (integration.config as any)
    : { siteVariableName: 'MSPSiteCode', primaryPSA: 'autotask' };

  const form = await superValidate(formDefaults, zod4(mspagentConfigSchema));

  return {
    integration,
    dattoConfigured: !!dattoIntegration,
    sites: sites?.rows || [],
    form,
    siteLinks: fetchLinks(locals.orm),
    dattoSites: fetchDattoSites(locals.orm),
  };
};

export const actions: Actions = {
  save: async ({ request, locals }) => {
    const form = await superValidate(request, zod4(mspagentConfigSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      const { error } = await locals.orm.upsert(
        'public',
        'integrations',
        [
          {
            id: 'mspagent',
            tenant_id: locals.user?.tenant_id,
            config: form.data,
            updated_at: new Date().toISOString(),
          },
        ],
        ['id', 'tenant_id']
      );

      if (error) {
        return message(form, `Failed to save: ${error.message}`, { status: 500 });
      }

      return message(form, 'Configuration saved successfully!');
    } catch (err) {
      return message(form, `Failed to save: ${String(err)}`, { status: 500 });
    }
  },

  delete: async ({ locals }) => {
    try {
      const { error } = await locals.orm.delete('public', 'integrations', (q) =>
        q.eq('id', 'mspagent').eq('tenant_id', locals.user?.tenant_id || '')
      );

      if (error) {
        return fail(500, { error: error.message });
      }

      return { success: true };
    } catch (err) {
      return fail(500, { error: String(err) });
    }
  },
};
