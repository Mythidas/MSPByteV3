import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prepareSensitiveFormData } from '$lib/utils/forms';
import { Microsoft365Connector } from '@workspace/shared/lib/connectors/Microsoft365Connector';
import { TenantCapabilityService } from '@workspace/shared/lib/services/microsoft/TenantCapabilityService';
import { microsoft365ConfigSchema } from './_forms';
import { Encryption } from '$lib/server/encryption';
import { PUBLIC_ORIGIN } from '$env/static/public';
import { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET } from '$env/static/private';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { safeErrorMessage } from '@workspace/shared/lib/utils/errors';

export const load: PageServerLoad = async ({ locals, url }) => {
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

  // Load persisted GDAP connections from DB
  const { data: connectionsData } = await locals.orm.select(
    'public',
    'integration_connections',
    (q) => q.eq('integration_id', 'microsoft-365').eq('tenant_id', locals.user?.tenant_id || '')
  );
  const connections = connectionsData?.rows ?? [];

  // Load domain→site mappings from site_to_integration, keyed by external_id
  const { data: links } = await locals.orm.select('public', 'site_to_integration', (q) =>
    q.eq('integration_id', 'microsoft-365').eq('tenant_id', locals.user?.tenant_id || '')
  );

  // domainMappings: { [externalId]: { [domain]: siteId } }
  const domainMappings: Record<string, Record<string, string>> = {};
  for (const link of links?.rows ?? []) {
    const externalId = link.external_id;
    if (!domainMappings[externalId]) domainMappings[externalId] = {};
    for (const domain of (link.meta as any)?.domains ?? []) {
      domainMappings[externalId][domain] = link.site_id;
    }
  }

  const consentedTenant = url.searchParams.get('consentedTenant') ?? null;
  const consentError = url.searchParams.get('error') ?? null;

  // Load orphan counts (entities with site_id = null) per connection
  const orphanCounts = Object.fromEntries(
    await Promise.all(
      connections.map(async (conn) => {
        const { data: count } = await locals.orm.getCount('public', 'entities', (q) =>
          q
            .eq('integration_id', 'microsoft-365')
            .eq('tenant_id', locals.user?.tenant_id || '')
            .eq('entity_type', 'identity')
            .is('site_id', null)
            .eq('raw_data->>_gdapTenantId', conn.external_id)
        );
        return [conn.external_id, count ?? 0] as [string, number];
      })
    )
  );

  return {
    integration,
    sites: sites?.rows || [],
    form,
    partnerClientId: MICROSOFT_CLIENT_ID ?? null,
    partnerTenantId: (config?.tenantId as string | undefined) ?? null,
    connections: connections.sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    ),
    domainMappings,
    consentedTenant,
    consentError,
    orphanCounts,
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
      return message(form, `Connection failed: ${safeErrorMessage(err)}`, { status: 500 });
    }
  },

  save: async ({ request, locals }) => {
    const form = await superValidate(request, zod4(microsoft365ConfigSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      if (form.data.mode === 'partner') {
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
          { status: 400 }
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
      return message(form, `Failed to save: ${safeErrorMessage(err)}`, { status: 500 });
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
      return fail(500, { error: safeErrorMessage(err) });
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

      const consentUrl = new URL('https://login.microsoftonline.com/common/adminconsent');
      consentUrl.searchParams.set('client_id', clientId);
      consentUrl.searchParams.set('redirect_uri', `${origin}/integrations/microsoft-365/consent`);
      consentUrl.searchParams.set(
        'state',
        JSON.stringify({ mspbyteTenantId: locals.user?.tenant_id })
      );

      return consentUrl.href;
    } catch (err) {
      return fail(500, { error: safeErrorMessage(err) });
    }
  },

  generateGDAPConsentUrl: async ({ request, locals }) => {
    try {
      const formData = await request.formData();
      const gdapTenantId = formData.get('gdapTenantId') as string;
      if (!gdapTenantId) return fail(400, { error: 'gdapTenantId is required' });

      const clientId = MICROSOFT_CLIENT_ID;
      const origin = PUBLIC_ORIGIN;
      if (!clientId || !origin) return fail(500, { error: 'Missing env vars' });

      const consentUrl = new URL(`https://login.microsoftonline.com/${gdapTenantId}/adminconsent`);
      consentUrl.searchParams.set('client_id', clientId);
      consentUrl.searchParams.set('redirect_uri', `${origin}/integrations/microsoft-365/consent`);
      consentUrl.searchParams.set(
        'state',
        JSON.stringify({ mspbyteTenantId: locals.user?.tenant_id, gdapTenantId })
      );

      return consentUrl.href;
    } catch (err) {
      return fail(500, { error: safeErrorMessage(err) });
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
        return fail(400, {
          error:
            'MSPByte is not connected to Microsoft. Click "Connect MSPByte to Microsoft" first.',
        });
      }

      const clientId = MICROSOFT_CLIENT_ID;
      const clientSecret = MICROSOFT_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
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

      const { data: gdapData, error: gdapError } = await connector.getGDAPCustomers(undefined, true);
      if (gdapError || !gdapData?.customers.length) {
        return fail(500, { error: `Failed to list GDAP customers: ${gdapError?.message}` });
      }
      const gdapCustomers = gdapData.customers;

      const currentTenant = locals.user?.tenant_id || '';

      // Load existing connections from DB
      const { data: existingData } = await locals.orm.select(
        'public',
        'integration_connections',
        (q) => q.eq('integration_id', 'microsoft-365').eq('tenant_id', currentTenant)
      );
      const existingConnections = existingData?.rows ?? [];
      const existingByExternalId = new Map(existingConnections.map((c) => [c.external_id, c]));

      // De-duplicate GDAP customers by tenant ID
      const seen = new Set<string>();
      const tenantEntries: { tenantId: string; displayName: string }[] = [];

      for (const customer of gdapCustomers) {
        const tenantId = customer.customer?.tenantId as string | undefined;
        if (!tenantId || seen.has(tenantId)) continue;
        seen.add(tenantId);
        tenantEntries.push({
          tenantId,
          displayName: customer?.customer?.displayName ?? customer?.displayName ?? 'Unknown',
        });
      }

      // Upsert each tenant: insert if new (status='pending'), update domains if active
      await Promise.all(
        tenantEntries.map(async ({ tenantId, displayName }) => {
          const existing = existingByExternalId.get(tenantId);

          if (!existing) {
            // New connection — insert as pending
            const { error } = await locals.orm.insert('public', 'integration_connections', [
              {
                integration_id: 'microsoft-365',
                external_id: tenantId,
                tenant_id: currentTenant,
                name: displayName,
                status: 'pending',
                meta: {},
                updated_at: new Date().toISOString(),
              },
            ]);

            if (error) {
              Logger.error({
                module: 'M365Integration',
                context: 'listGDAPTenants',
                message: `Failed to insert connection for ${tenantId}: ${error.message}`,
              });
            }
          } else if (existing.status === 'active') {
            // Active connection — refresh domains from Graph API
            const { data: domainData } = await connector.forTenant(tenantId).getTenantDomains(undefined, true);

            const defaultDomain = (domainData?.domains ?? []).find((d) => d.isDefault)?.id ?? '';
            const domains = (domainData?.domains ?? [])
              .filter((d: any) => d.isVerified)
              .map((d: any) => d.id as string)
              .filter(Boolean);

            await locals.orm.update('public', 'integration_connections', existing.id, {
              name: displayName,
              meta: { ...((existing.meta as any) ?? {}), domains, defaultDomain },
              updated_at: new Date().toISOString(),
            });
          } else {
            // Pending — just update display name in case it changed
            await locals.orm.update('public', 'integration_connections', existing.id, {
              name: displayName,
              updated_at: new Date().toISOString(),
            });
          }
        })
      );

      // Return updated connections from DB
      const { data: updatedData } = await locals.orm.select(
        'public',
        'integration_connections',
        (q) => q.eq('integration_id', 'microsoft-365').eq('tenant_id', currentTenant)
      );

      return {
        connections:
          updatedData?.rows.sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase())
          ) ?? [],
      };
    } catch (err) {
      return fail(500, { error: safeErrorMessage(err) });
    }
  },

  saveMappings: async ({ request, locals }) => {
    try {
      const formData = await request.formData();
      const siteLinksRaw = formData.get('siteLinks') as string;
      const connectionExternalId = formData.get('connectionExternalId') as string;

      if (!connectionExternalId) {
        return fail(400, { error: 'connectionExternalId is required' });
      }

      let siteLinks: { siteId: string; domains: string[] }[];

      try {
        siteLinks = JSON.parse(siteLinksRaw || '[]');
      } catch {
        return fail(400, { error: 'Invalid JSON in mappings data' });
      }

      const currentTenant = locals.user?.tenant_id || '';

      // Delete existing links for this specific connection
      await locals.orm.delete('public', 'site_to_integration', (q) =>
        q
          .eq('integration_id', 'microsoft-365')
          .eq('tenant_id', currentTenant)
          .eq('external_id', connectionExternalId)
      );

      // Insert new links grouped by site
      for (const { siteId, domains } of siteLinks) {
        if (!siteId || domains.length === 0) continue;

        const { error } = await locals.orm.upsert('public', 'site_to_integration', [
          {
            site_id: siteId,
            external_id: connectionExternalId,
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
      return fail(500, { error: safeErrorMessage(err) });
    }
  },

  getOrphanedEntities: async ({ request, locals }) => {
    try {
      const formData = await request.formData();
      const externalId = formData.get('externalId') as string;
      const offset = parseInt((formData.get('offset') as string) ?? '0', 10);

      if (!externalId) return fail(400, { error: 'externalId is required' });

      const { data } = await locals.orm.selectPaginated(
        'public',
        'entities',
        { page: Math.floor(offset / 50), size: 50 },
        (q) =>
          q
            .eq('integration_id', 'microsoft-365')
            .eq('tenant_id', locals.user?.tenant_id || '')
            .eq('entity_type', 'identity')
            .is('site_id', null)
            .eq('raw_data->>_gdapTenantId', externalId)
      );

      return { entities: data?.rows ?? [], total: data?.total ?? 0 };
    } catch (err) {
      return fail(500, { error: safeErrorMessage(err) });
    }
  },

  assignEntitySites: async ({ request, locals }) => {
    try {
      const formData = await request.formData();
      const assignmentsRaw = formData.get('assignments') as string;

      if (!assignmentsRaw) return fail(400, { error: 'assignments is required' });

      let assignments: { entityId: string; siteId: string }[];
      try {
        assignments = JSON.parse(assignmentsRaw);
      } catch {
        return fail(400, { error: 'Invalid JSON in assignments' });
      }

      // Group by siteId for batch update
      const bySite = new Map<string, string[]>();
      for (const { entityId, siteId } of assignments) {
        if (!siteId) continue;
        if (!bySite.has(siteId)) bySite.set(siteId, []);
        bySite.get(siteId)!.push(entityId);
      }

      for (const [siteId, ids] of bySite) {
        const { error } = await locals.orm.batchUpdate('public', 'entities', ids, {
          site_id: siteId,
        });
        if (error) return fail(500, { error: `Failed to update entities: ${error.message}` });
      }

      return { success: true };
    } catch (err) {
      return fail(500, { error: safeErrorMessage(err) });
    }
  },

  refreshCapabilities: async ({ request, locals }) => {
    try {
      const formData = await request.formData();
      const gdapTenantId = formData.get('gdapTenantId') as string;
      if (!gdapTenantId) return fail(400, { error: 'gdapTenantId is required' });

      const { data: integration } = await locals.orm.selectSingle('public', 'integrations', (q) =>
        q.eq('id', 'microsoft-365')
      );

      const config = integration?.config as any;
      const mspTenantId = config?.tenantId as string | undefined;

      if (!mspTenantId) {
        return fail(400, { error: 'MSPByte is not connected to Microsoft.' });
      }

      const clientId = MICROSOFT_CLIENT_ID;
      const clientSecret = MICROSOFT_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return fail(500, {
          error: 'MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET env vars are required',
        });
      }

      const refreshToken = config?.refreshToken ? Encryption.decrypt(config.refreshToken) : undefined;

      const baseConnector = new Microsoft365Connector({
        tenantId: mspTenantId,
        clientId,
        clientSecret,
        mode: 'partner',
        refreshToken,
      });

      const connector = baseConnector.forTenant(gdapTenantId);
      const { data: caps, error: capsError } = await new TenantCapabilityService(connector).probe();

      if (capsError || !caps) {
        return fail(500, { error: `Failed to probe capabilities: ${capsError?.message}` });
      }

      // Load existing connection to preserve its meta
      const { data: existing } = await locals.orm.selectSingle(
        'public',
        'integration_connections',
        (q) =>
          q
            .eq('integration_id', 'microsoft-365')
            .eq('tenant_id', locals.user?.tenant_id || '')
            .eq('external_id', gdapTenantId)
      );

      if (!existing) {
        return fail(404, { error: `No connection found for tenant ${gdapTenantId}` });
      }

      const updatedMeta = {
        ...((existing.meta as any) ?? {}),
        capabilities: caps,
        capabilitiesCheckedAt: new Date().toISOString(),
      };

      const { error: updateError } = await locals.orm.update(
        'public',
        'integration_connections',
        existing.id,
        {
          meta: updatedMeta,
          updated_at: new Date().toISOString(),
        }
      );

      if (updateError) {
        return fail(500, { error: `Failed to update connection: ${updateError.message}` });
      }

      Logger.info({
        module: 'M365Integration',
        context: 'refreshCapabilities',
        message: `Capabilities updated for tenant ${gdapTenantId}: ${JSON.stringify(caps)}`,
      });

      return { connection: { ...existing, meta: updatedMeta } };
    } catch (err) {
      return fail(500, { error: safeErrorMessage(err) });
    }
  },
};
