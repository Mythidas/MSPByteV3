import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prepareSensitiveFormData } from '$lib/utils/forms';
import { Microsoft365Connector } from '@workspace/shared/lib/connectors/Microsoft365Connector';
import { microsoft365ConfigSchema } from './_forms';
import { Encryption } from '$lib/server/encryption';
import { PUBLIC_ORIGIN } from '$env/static/public';
import { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET } from '$env/static/private';
import { Debug } from '@workspace/shared/lib/utils/debug';

export const load: PageServerLoad = async ({ locals }) => {
  const { data: integration } = await locals.orm.selectSingle('public', 'integrations', (q) =>
    q.eq('id', 'microsoft-365')
  );
  const { data: sites } = await locals.orm.select('public', 'sites');

  const config = integration?.config as any;
  const mode = config?.mode ?? 'direct';

  let formDefaults: any = { mode };

  if (config && mode === 'direct') {
    formDefaults = {
      mode: 'direct',
      tenantId: config.tenantId ?? '',
      clientId: config.clientId ?? '',
      clientSecret: config.clientSecret ? '••••••••••' : '',
    };
  }

  const form = await superValidate(formDefaults, zod4(microsoft365ConfigSchema));

  // Reconstruct domainMappings from site_to_integration.meta.domains
  const { data: links } = await locals.orm.select('public', 'site_to_integration', (q) =>
    q.eq('integration_id', 'microsoft-365').eq('tenant_id', locals.user?.tenant_id || '')
  );

  const domainMappings: { domain: string; siteId: string }[] = [];
  for (const link of links?.rows ?? []) {
    for (const domain of (link.meta as any)?.domains ?? []) {
      domainMappings.push({ domain, siteId: link.site_id });
    }
  }

  return {
    integration,
    sites: sites?.rows || [],
    form,
    partnerClientId: MICROSOFT_CLIENT_ID ?? null,
    partnerTenantId: (config?.tenantId as string | undefined) ?? null,
    domainMappings,
  };
};

export const actions: Actions = {
  testConnection: async ({ request, locals }) => {
    const form = await superValidate(request, zod4(microsoft365ConfigSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      if (form.data.mode === 'partner') {
        const clientId = MICROSOFT_CLIENT_ID;
        const clientSecret = MICROSOFT_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
          return message(
            form,
            'Partner mode requires MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET env vars.',
            { status: 400 }
          );
        }

        // Use saved MSP tenant ID from config (set after consent)
        const { data: integration } = await locals.orm.selectSingle('public', 'integrations', (q) =>
          q.eq('id', 'microsoft-365')
        );
        const savedTenantId = (integration?.config as any)?.tenantId ?? '';

        const savedRefreshToken = (integration?.config as any)?.refreshToken
          ? Encryption.decrypt((integration?.config as any).refreshToken)
          : undefined;

        const connector = new Microsoft365Connector({
          tenantId: savedTenantId,
          clientId,
          clientSecret,
          mode: 'partner',
          refreshToken: savedRefreshToken,
        });

        const result = await connector.checkHealth();
        if (!result.data) {
          return message(
            form,
            'Connection failed. Check MSPByte app credentials and ensure MSP tenant consent is granted.',
            { status: 400 }
          );
        }

        return message(form, 'Connection successful!');
      }

      // Direct mode
      const { data: integration } = await locals.orm.selectSingle('public', 'integrations', (q) =>
        q.eq('id', 'microsoft-365')
      );

      const configData = prepareSensitiveFormData(
        form.data as any,
        (integration?.config as any) || null,
        ['clientSecret']
      );

      const connector = new Microsoft365Connector({
        tenantId: (configData as any).tenantId,
        clientId: (configData as any).clientId,
        clientSecret: (configData as any).clientSecret,
        mode: 'direct',
      });

      const result = await connector.checkHealth();

      if (!result.data) {
        return message(form, 'Connection failed. Please check your credentials.', { status: 400 });
      }

      return message(form, 'Connection successful!');
    } catch (err) {
      return message(form, `Connection failed: ${String(err)}`, { status: 500 });
    }
  },

  save: async ({ request, locals }) => {
    const form = await superValidate(request, zod4(microsoft365ConfigSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      if (form.data.mode === 'partner') {
        // Partner mode: preserve existing config (tenantId from consent) — just update mode flag
        const { data: integration } = await locals.orm.selectSingle('public', 'integrations', (q) =>
          q.eq('id', 'microsoft-365')
        );
        const existingConfig = (integration?.config as any) ?? {};

        const { error } = await locals.orm.upsert('public', 'integrations', [
          {
            id: 'microsoft-365',
            tenant_id: locals.user?.tenant_id,
            config: { ...existingConfig, mode: 'partner' },
            updated_at: new Date().toISOString(),
          },
        ]);

        if (error) {
          return message(form, `Failed to save: ${error.message}`, { status: 500 });
        }

        return message(form, 'Partner mode configured successfully!');
      }

      // Direct mode
      const { data: integration } = await locals.orm.selectSingle('public', 'integrations', (q) =>
        q.eq('id', 'microsoft-365')
      );

      const configData = prepareSensitiveFormData(
        form.data as any,
        (integration?.config as any) || null,
        ['clientSecret']
      );

      const connector = new Microsoft365Connector({
        tenantId: (configData as any).tenantId,
        clientId: (configData as any).clientId,
        clientSecret: (configData as any).clientSecret,
        mode: 'direct',
      });

      const healthCheck = await connector.checkHealth();
      if (!healthCheck.data) {
        return message(
          form,
          'Cannot save: Connection test failed. Please verify your credentials.',
          {
            status: 400,
          }
        );
      }

      (configData as any).clientSecret = Encryption.encrypt((configData as any).clientSecret);

      const { error } = await locals.orm.upsert('public', 'integrations', [
        {
          id: 'microsoft-365',
          tenant_id: locals.user?.tenant_id,
          config: configData,
          updated_at: new Date().toISOString(),
        },
      ]);

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
        q.eq('id', 'microsoft-365').eq('tenant_id', locals.user?.tenant_id || '')
      );

      if (error) {
        return fail(500, { error: error.message });
      }

      return { success: true };
    } catch (err) {
      return fail(500, { error: String(err) });
    }
  },

  generateConsentUrl: async ({ locals }) => {
    try {
      const clientId = MICROSOFT_CLIENT_ID;
      const origin = PUBLIC_ORIGIN;

      if (!clientId || !origin) {
        return fail(500, {
          error: 'MICROSOFT_CLIENT_ID and PUBLIC_ORIGIN env vars are required for partner mode',
        });
      }

      // Authorization Code flow — delegated permissions work across GDAP tenants
      // without requiring an Enterprise App in each customer tenant.
      const consentUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      consentUrl.searchParams.set('client_id', clientId);
      consentUrl.searchParams.set('response_type', 'code');
      consentUrl.searchParams.set('redirect_uri', `${origin}/integrations/microsoft-365/consent`);
      consentUrl.searchParams.set('response_mode', 'query');
      consentUrl.searchParams.set(
        'scope',
        'openid offline_access https://graph.microsoft.com/.default'
      );
      consentUrl.searchParams.set(
        'state',
        JSON.stringify({ mspbyteTenantId: locals.user?.tenant_id })
      );
      consentUrl.searchParams.set('prompt', 'consent');

      return consentUrl.href;
    } catch (err) {
      return fail(500, { error: String(err) });
    }
  },

  testGDAPTenant: async ({ request, locals }) => {
    try {
      const formData = await request.formData();
      const gdapTenantId = formData.get('gdapTenantId') as string;

      if (!gdapTenantId) {
        return fail(400, { error: 'gdapTenantId is required' });
      }

      const { data: integration } = await locals.orm.selectSingle('public', 'integrations', (q) =>
        q.eq('id', 'microsoft-365')
      );
      const config = integration?.config as any;
      const refreshToken = config?.refreshToken
        ? Encryption.decrypt(config.refreshToken)
        : undefined;

      if (!refreshToken) {
        return fail(400, {
          error: 'No refresh token stored. Please reconnect MSPByte to Microsoft.',
        });
      }

      const connector = new Microsoft365Connector({
        tenantId: config.tenantId,
        clientId: MICROSOFT_CLIENT_ID,
        clientSecret: MICROSOFT_CLIENT_SECRET,
        mode: 'partner',
        refreshToken,
      });

      const { data: domains, error } = await connector.forTenant(gdapTenantId).getTenantDomains();
      if (error) {
        return fail(400, { error: `GDAP access failed: ${error.message}` });
      }

      return { success: true, domainCount: (domains ?? []).length };
    } catch (err) {
      return fail(500, { error: String(err) });
    }
  },

  listGDAPTenants: async ({ locals }) => {
    try {
      const { data: integration } = await locals.orm.selectSingle('public', 'integrations', (q) =>
        q.eq('id', 'microsoft-365')
      );

      const config = integration?.config as any;
      const mspTenantId = config?.tenantId as string | undefined;

      if (!mspTenantId) {
        Debug.error({
          module: 'M365Integration',
          context: 'listGDAPTenants',
          message:
            'MSPByte is not connected to Microsoft. Click "Connect MSPByte to Microsoft" first.',
        });
        return fail(400, {
          error:
            'MSPByte is not connected to Microsoft. Click "Connect MSPByte to Microsoft" first.',
        });
      }

      const clientId = MICROSOFT_CLIENT_ID;
      const clientSecret = MICROSOFT_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        Debug.error({
          module: 'M365Integration',
          context: 'listGDAPTenants',
          message: 'MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET env vars are required',
        });
        return fail(500, {
          error: 'MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET env vars are required',
        });
      }

      const refreshToken = config?.refreshToken
        ? Encryption.decrypt(config.refreshToken)
        : undefined;

      const connector = new Microsoft365Connector({
        tenantId: mspTenantId,
        clientId,
        clientSecret,
        mode: 'partner',
        refreshToken,
      });

      const { data: gdapCustomers, error: gdapError } = await connector.getGDAPCustomers();
      if (gdapError || !gdapCustomers.length) {
        Debug.error({
          module: 'M365Integration',
          context: 'listGDAPTenants',
          message: `Failed to list GDAP customers: ${gdapError?.message}`,
        });
        return fail(500, { error: `Failed to list GDAP customers: ${gdapError?.message}` });
      }

      // De-duplicate by customer tenant ID and fetch domains for each
      const seen = new Set<string>();
      const results: { tenantId: string; displayName: string; domains: string[] }[] = [];

      for (const customer of gdapCustomers) {
        const tenantId = customer.customer?.tenantId as string | undefined;
        if (!tenantId || seen.has(tenantId)) continue;
        seen.add(tenantId);

        const customerConnector = connector.forTenant(tenantId);
        const { data: domains } = await customerConnector.getTenantDomains();

        results.push({
          tenantId,
          displayName: customer.displayName ?? 'Unknown',
          domains: (domains ?? [])
            .filter((d: any) => d.isVerified)
            .map((d: any) => d.id as string)
            .filter(Boolean),
        });
      }

      return { gdapTenants: results };
    } catch (err) {
      return fail(500, { error: String(err) });
    }
  },

  saveMappings: async ({ request, locals }) => {
    try {
      const formData = await request.formData();
      const siteLinksRaw = formData.get('siteLinks') as string;

      let siteLinks: { siteId: string; gdapTenantId: string; domains: string[] }[];

      try {
        siteLinks = JSON.parse(siteLinksRaw || '[]');
      } catch {
        return fail(400, { error: 'Invalid JSON in mappings data' });
      }

      const currentTenant = locals.user?.tenant_id || '';

      // Delete all existing links for this integration+tenant
      await locals.orm.delete('public', 'site_to_integration', (q) =>
        q.eq('integration_id', 'microsoft-365').eq('tenant_id', currentTenant)
      );

      // Insert new links with meta.domains
      for (const { siteId, gdapTenantId, domains } of siteLinks) {
        const { error } = await locals.orm.upsert('public', 'site_to_integration', [
          {
            site_id: siteId,
            external_id: gdapTenantId,
            integration_id: 'microsoft-365',
            tenant_id: currentTenant,
            meta: { domains },
          },
        ]);

        if (error) {
          return fail(500, { error: `Failed to save site link: ${error.message}` });
        }
      }

      return { success: true, message: 'Mappings saved successfully' };
    } catch (err) {
      return fail(500, { error: String(err) });
    }
  },
};
