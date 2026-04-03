import { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET } from '$env/static/private';
import { PUBLIC_ORIGIN } from '$env/static/public';
import { fail, redirect } from '@sveltejs/kit';
import { Microsoft365Connector } from '@workspace/shared/lib/integrations/microsoft-365/connector';
import { probeCapabilities } from './_capabilities';
import type { Actions, PageServerLoad } from './$types';
import { isRecord, isString, parseSafeErrorMessage } from '@workspace/shared/lib/utils/validators';

async function getFrameworks({ locals }: { locals: App.Locals }) {
  return await locals.supabase
    .from('compliance_frameworks')
    .select('*, compliance_framework_checks(*)')
    .eq('tenant_id', locals.tenant?.id || '')
    .eq('integration_id', 'microsoft-365')
    .order('name')
    .then(({ data }) => data ?? []);
}

async function getAssignments({ locals }: { locals: App.Locals }) {
  return await locals.supabase
    .from('compliance_assignments')
    .select('*')
    .eq('tenant_id', locals.tenant?.id ?? '')
    .eq('integration_id', 'microsoft-365')
    .then(({ data }) => data ?? []);
}

export const load: PageServerLoad = ({ locals }) => {
  return {
    getFrameworks: getFrameworks({ locals }),
    getAssignments: getAssignments({ locals }),
  };
};

export const actions = {
  initialConsent: ({ locals }) => {
    const clientId = MICROSOFT_CLIENT_ID;
    const origin = PUBLIC_ORIGIN;

    if (!clientId || !origin) {
      return fail(500, {
        error: 'MICROSOFT_CLIENT_ID and PUBLIC_ORIGIN env vars are required for partner mode',
      });
    }

    const consentUrl = new URL('https://login.microsoftonline.com/common/adminconsent');
    consentUrl.searchParams.set('client_id', clientId);
    consentUrl.searchParams.set(
      'redirect_uri',
      `${origin}/setup/integrations/microsoft-365/consent`
    );
    consentUrl.searchParams.set(
      'state',
      JSON.stringify({ mspbyteTenantId: locals.user?.tenant_id })
    );

    return redirect(303, consentUrl.href);
  },
  deleteIntegration: async ({ locals }) => {
    const { error } = await locals.supabase
      .from('integrations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', 'microsoft-365')
      .eq('tenant_id', locals.tenant?.id ?? '');

    if (error) return fail(500, { error: error.message });
    return redirect(303, '/integrations');
  },
  gdapConsent: async ({ request }) => {
    const formData = await request.formData();
    const gdapTenantId = formData.get('gdapTenantId');
    if (!gdapTenantId || !isString(gdapTenantId))
      return fail(400, { error: 'gdapTenantId is required' });

    const clientId = MICROSOFT_CLIENT_ID;
    const origin = PUBLIC_ORIGIN;

    if (!clientId || !origin) {
      return fail(500, {
        error: 'MICROSOFT_CLIENT_ID and PUBLIC_ORIGIN env vars are required for partner mode',
      });
    }

    const consentUrl = new URL(`https://login.microsoftonline.com/${gdapTenantId}/adminconsent`);
    consentUrl.searchParams.set('client_id', clientId);
    consentUrl.searchParams.set(
      'redirect_uri',
      `${origin}/setup/integrations/microsoft-365/consent`
    );
    consentUrl.searchParams.set('state', JSON.stringify({ gdapTenantId }));

    return redirect(303, consentUrl.href);
  },
  syncGDAPRelationships: async ({ locals }) => {
    const { data: integrationRow } = await locals.supabase
      .from('integrations')
      .select('config')
      .eq('id', 'microsoft-365')
      .eq('tenant_id', locals.tenant?.id ?? '')
      .is('deleted_at', null)
      .single();

    const config = isRecord(integrationRow?.config) ? integrationRow.config : {};
    const mspTenantId = config.tenantId;
    if (!mspTenantId || !isString(mspTenantId))
      return fail(400, { error: 'Integration not configured' });

    const connector = new Microsoft365Connector(
      {
        tenantId: mspTenantId,
        clientId: MICROSOFT_CLIENT_ID,
        clientSecret: MICROSOFT_CLIENT_SECRET,
      },
      locals.tenant!.id
    );

    let gdapRelationships;
    try {
      gdapRelationships = await connector.tenantRelationships.delegatedAdminRelationships.listAll();
    } catch (err) {
      return fail(502, { error: parseSafeErrorMessage(err) });
    }

    const activeRelationships = gdapRelationships.filter(
      (r) => r.status === 'active' && r.customer?.tenantId
    );

    let mspDisplayName: string | null = null;
    try {
      const org = await connector.organization.get();
      mspDisplayName = org.displayName || null;
    } catch {
      /* non-fatal */
    }

    const { data: existingLinks, error: linksError } = await locals.supabase
      .from('integration_links')
      .select('id, external_id, name')
      .eq('integration_id', 'microsoft-365')
      .eq('tenant_id', locals.tenant?.id ?? '')
      .is('site_id', null);

    if (linksError) return fail(500, { error: linksError.message });

    const gdapTenantIds = new Set(activeRelationships.map((r) => r.customer.tenantId));
    const dbExternalIds = new Set((existingLinks ?? []).map((l) => l.external_id));

    const toInsert = activeRelationships.filter((r) => !dbExternalIds.has(r.customer.tenantId));
    // Exclude MSP's own tenant from deletion — it is not a GDAP relationship
    const toDelete = (existingLinks ?? []).filter(
      (l) => !gdapTenantIds.has(l.external_id) && l.external_id !== mspTenantId
    );

    const mspInserts = dbExternalIds.has(mspTenantId)
      ? []
      : [
          {
            integration_id: 'microsoft-365',
            tenant_id: locals.tenant?.id ?? '',
            external_id: mspTenantId,
            name: mspDisplayName,
            site_id: null,
            status: 'active',
            meta: {},
          },
        ];

    const allInserts = [
      ...toInsert.map((r) => ({
        integration_id: 'microsoft-365',
        tenant_id: locals.tenant?.id ?? '',
        external_id: r.customer.tenantId,
        name: r.customer.displayName ?? null,
        site_id: null,
        status: 'pending',
        meta: {},
      })),
      ...mspInserts,
    ];

    if (allInserts.length > 0) {
      const { error: insertError } = await locals.supabase
        .from('integration_links')
        .insert(allInserts);
      if (insertError) return fail(500, { error: insertError.message });
    }

    if (toDelete.length > 0) {
      const idsToDelete = toDelete.map((l) => l.id);
      const { error: deleteError } = await locals.supabase
        .from('integration_links')
        .delete()
        .in('id', idsToDelete);
      if (deleteError) return fail(500, { error: deleteError.message });
    }

    return { success: true, inserted: allInserts.length, removed: toDelete.length };
  },
  refreshCapabilities: async ({ request, locals }) => {
    const formData = await request.formData();
    const gdapTenantId = formData.get('gdapTenantId');
    if (!gdapTenantId || !isString(gdapTenantId))
      return fail(400, { error: 'gdapTenantId is required' });

    const { data: integrationRow } = await locals.supabase
      .from('integrations')
      .select('config')
      .eq('id', 'microsoft-365')
      .eq('tenant_id', locals.tenant?.id ?? '')
      .is('deleted_at', null)
      .single();

    const config = isRecord(integrationRow?.config) ? integrationRow.config : {};
    const mspTenantId = config.tenantId;
    if (!mspTenantId || !isString(mspTenantId))
      return fail(400, { error: 'Integration not configured' });

    const tenantConnector = new Microsoft365Connector(
      {
        tenantId: mspTenantId,
        clientId: MICROSOFT_CLIENT_ID,
        clientSecret: MICROSOFT_CLIENT_SECRET,
      },
      locals.tenant!.id,
      gdapTenantId
    );

    const capabilities = await probeCapabilities(tenantConnector, {
      maxRetries: 2,
      context: `refreshCapabilities:${gdapTenantId}`,
    });

    if (!capabilities)
      return fail(502, { error: 'Could not probe capabilities — check GDAP permissions' });

    const { data: existing } = await locals.supabase
      .from('integration_links')
      .select('*')
      .eq('integration_id', 'microsoft-365')
      .eq('tenant_id', locals.tenant?.id ?? '')
      .eq('external_id', gdapTenantId)
      .is('site_id', null)
      .single();

    if (!existing) return fail(404, { error: 'Integration link not found' });

    const meta = isRecord(existing.meta) ? existing.meta : {};
    const updatedMeta = {
      ...meta,
      capabilities,
      capabilitiesCheckedAt: new Date().toISOString(),
    };

    const { error: updateError } = await locals.supabase
      .from('integration_links')
      .update({ meta: updatedMeta, updated_at: new Date().toISOString() })
      .eq('id', existing.id);

    if (updateError) return fail(500, { error: parseSafeErrorMessage(updateError) });

    return { success: true };
  },
} satisfies Actions;
