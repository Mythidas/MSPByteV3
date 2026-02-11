import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prepareSensitiveFormData, isMaskedSecret } from '$lib/utils/forms';
import { HaloPSAConnector } from '@workspace/shared/lib/connectors/HaloPSAConnector';
import { haloPSAConfigSchema } from './_forms';
import { Encryption } from '$lib/server/encryption';
import { ORM } from '@workspace/shared/lib/utils/orm';

const fetchTenants = async (orm: ORM) => {
  const { data } = await orm.selectSingle('public', 'integrations', (q) => q.eq('id', 'halopsa'));
  if (!data) return { data: [] };

  (data.config as any).clientSecret = Encryption.decrypt((data.config as any).clientSecret);
  const halopsa = new HaloPSAConnector(data.config as any);
  const { data: companies, error } = await halopsa.getSites();

  if (error) {
    return { error };
  }

  return { data: companies.map((c) => ({ id: String(c.id), name: c.clientsite_name })) };
};

const fetchLinks = async (orm: ORM) => {
  const { data } = await orm.select('public', 'site_to_integration', (q) =>
    q.eq('integration_id', 'halopsa')
  );
  return { data: data?.rows || [] };
};

export const load: PageServerLoad = async ({ locals }) => {
  const { data: integration } = await locals.orm.selectSingle('public', 'integrations', (q) =>
    q.eq('id', 'halopsa')
  );
  const { data: sites } = await locals.orm.select('public', 'sites');

  const formDefaults = integration?.config
    ? {
        ...(integration.config as any),
        clientSecret: '••••••••••', // Mask existing secret
      }
    : null;

  const form = await superValidate(formDefaults, zod4(haloPSAConfigSchema));

  return {
    integration,
    sites: sites?.rows || [],
    form,
    tenants: fetchTenants(locals.orm),
    siteLinks: fetchLinks(locals.orm),
  };
};

export const actions: Actions = {
  testConnection: async ({ request, locals }) => {
    const form = await superValidate(request, zod4(haloPSAConfigSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      // Get existing config to handle masked secret
      const { data: integration } = await locals.orm.selectSingle('public', 'integrations', (q) =>
        q.eq('id', 'halopsa')
      );

      // Prepare data, using existing secret if it's still masked
      const configData = prepareSensitiveFormData(form.data, (integration?.config as any) || null, [
        'clientSecret',
      ]);

      const connector = new HaloPSAConnector(configData as any);
      const result = await connector.checkHealth();

      if (!result.data) {
        return message(form, 'Connection failed. Please check your credentials.', {
          status: 400,
        });
      }

      return message(form, 'Connection successful!');
    } catch (err) {
      return message(form, `Connection failed: ${String(err)}`, {
        status: 500,
      });
    }
  },

  save: async ({ request, locals }) => {
    const form = await superValidate(request, zod4(haloPSAConfigSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      // Get existing config to handle masked secret
      const { data: integration } = await locals.orm.selectSingle('public', 'integrations', (q) =>
        q.eq('id', 'halopsa')
      );

      // Prepare data, using existing secret if it's still masked
      const configData = prepareSensitiveFormData(form.data, (integration?.config as any) || null, [
        'clientSecret',
      ]);

      // Test connection before saving
      const connector = new HaloPSAConnector(configData);
      const healthCheck = await connector.checkHealth();

      if (!healthCheck.data) {
        return message(
          form,
          'Cannot save: Connection test failed. Please verify your credentials.',
          { status: 400 }
        );
      }

      configData.clientSecret = Encryption.encrypt(configData.clientSecret);
      const { error } = await locals.orm.upsert('public', 'integrations', [
        {
          id: 'halopsa',
          tenant_id: locals.user?.tenant_id,
          config: configData,
          updated_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        return message(form, `Failed to save: ${error.message}`, {
          status: 500,
        });
      }

      return message(form, 'Configuration saved successfully!');
    } catch (err) {
      return message(form, `Failed to save: ${String(err)}`, {
        status: 500,
      });
    }
  },

  delete: async ({ locals }) => {
    try {
      // DB Query: Delete integration
      const { error } = await locals.orm.delete('public', 'integrations', (q) =>
        q.eq('id', 'halopsa').eq('tenant_id', locals.user?.tenant_id || '')
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
