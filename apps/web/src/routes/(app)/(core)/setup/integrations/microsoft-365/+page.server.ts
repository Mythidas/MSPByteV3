import { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET } from '$env/static/private';
import { PUBLIC_ORIGIN } from '$env/static/public';
import { fail, redirect } from '@sveltejs/kit';
import { Microsoft365Connector } from '@workspace/shared/lib/connectors/Microsoft365Connector';
import { probeCapabilities } from './_capabilities';
import { safeErrorMessage } from '@workspace/shared/lib/utils/errors';
import type { Tables } from '@workspace/shared/types/database';
import type { Actions, PageServerLoad } from './$types';

async function getFrameworks({ locals }: { locals: App.Locals }) {
  return await locals.supabase
    .from('compliance_frameworks')
    .select('*, compliance_framework_checks(*)')
    .eq('tenant_id', locals.tenant.id)
    .eq('integration_id', 'microsoft-365')
    .order('name')
    .then(({ data }) => data ?? []);
}

async function getAssignments({ locals }: { locals: App.Locals }) {
  return await locals.supabase
    .from('compliance_assignments')
    .select('*')
    .eq('tenant_id', locals.tenant.id)
    .eq('integration_id', 'microsoft-365')
    .then(({ data }) => data ?? []);
}

export const load: PageServerLoad = async ({ locals }) => {
  return {
    getFrameworks: getFrameworks({ locals }),
    getAssignments: getAssignments({ locals }),
  };
};

export const actions = {
  initialConsent: async ({ locals }) => {
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

    throw redirect(303, consentUrl.href);
  },
  deleteIntegration: async ({ locals }) => {
    const { error } = await locals.supabase
      .from('integrations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', 'microsoft-365')
      .eq('tenant_id', locals.tenant.id);

    if (error) return fail(500, { error: error.message });
    throw redirect(303, '/integrations');
  },
  gdapConsent: async ({ request }) => {
    const formData = await request.formData();
    const gdapTenantId = formData.get('gdapTenantId') as string;
    if (!gdapTenantId) return fail(400, { error: 'gdapTenantId is required' });

    const clientId = MICROSOFT_CLIENT_ID;
    const origin = PUBLIC_ORIGIN;

    if (!clientId || !origin) {
      return fail(500, {
        error: 'MICROSOFT_CLIENT_ID and PUBLIC_ORIGIN env vars are required for partner mode',
      });
    }

    const consentUrl = new URL(`https://login.microsoftonline.com/${gdapTenantId}/adminconsent`);
    consentUrl.searchParams.set('client_id', clientId);
    consentUrl.searchParams.set('redirect_uri', `${origin}/integrations/microsoft-365/consent`);
    consentUrl.searchParams.set('state', JSON.stringify({ gdapTenantId }));

    throw redirect(303, consentUrl.href);
  },
  syncGDAPRelationships: async ({ locals }) => {
    const { data: integrationRow } = await locals.supabase
      .from('integrations')
      .select('config')
      .eq('id', 'microsoft-365')
      .eq('tenant_id', locals.tenant.id)
      .is('deleted_at', null)
      .single();

    const mspTenantId = (integrationRow?.config as any)?.tenantId as string | undefined;
    if (!mspTenantId) return fail(400, { error: 'Integration not configured' });

    const connector = new Microsoft365Connector({
      tenantId: mspTenantId,
      clientId: MICROSOFT_CLIENT_ID,
      clientSecret: MICROSOFT_CLIENT_SECRET,
    });

    const { data: gdapData, error: gdapError } = await connector.getGDAPCustomers(undefined, true);
    if (gdapError) return fail(502, { error: safeErrorMessage(gdapError) });

    const activeRelationships = (gdapData?.customers ?? []).filter(
      (r: any) => r.status === 'active' && r.customer?.tenantId
    );

    const { data: existingLinks, error: linksError } = await locals.supabase
      .from('integration_links')
      .select('id, external_id, name')
      .eq('integration_id', 'microsoft-365')
      .eq('tenant_id', locals.tenant.id)
      .is('site_id', null);

    if (linksError) return fail(500, { error: linksError.message });

    const gdapTenantIds = new Set(
      activeRelationships.map((r: any) => r.customer.tenantId as string)
    );
    const dbExternalIds = new Set((existingLinks ?? []).map((l) => l.external_id));

    const toInsert = activeRelationships.filter(
      (r: any) => !dbExternalIds.has(r.customer.tenantId)
    );
    const toDelete = (existingLinks ?? []).filter((l) => !gdapTenantIds.has(l.external_id));

    if (toInsert.length > 0) {
      const inserts = toInsert.map((r: any) => ({
        integration_id: 'microsoft-365',
        tenant_id: locals.tenant.id,
        external_id: r.customer.tenantId as string,
        name: (r.customer.displayName as string) ?? null,
        site_id: null,
        status: 'pending',
        meta: {},
      }));

      const { error: insertError } = await locals.supabase
        .from('integration_links')
        .insert(inserts);
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

    return { success: true, inserted: toInsert.length, removed: toDelete.length };
  },
  refreshCapabilities: async ({ request, locals }) => {
    const formData = await request.formData();
    const gdapTenantId = formData.get('gdapTenantId') as string;
    if (!gdapTenantId) return fail(400, { error: 'gdapTenantId is required' });

    const { data: integrationRow } = await locals.supabase
      .from('integrations')
      .select('config')
      .eq('id', 'microsoft-365')
      .eq('tenant_id', locals.tenant.id)
      .is('deleted_at', null)
      .single();

    const mspTenantId = (integrationRow?.config as any)?.tenantId as string | undefined;
    if (!mspTenantId) return fail(400, { error: 'Integration not configured' });

    const tenantConnector = new Microsoft365Connector({
      tenantId: mspTenantId,
      clientId: MICROSOFT_CLIENT_ID,
      clientSecret: MICROSOFT_CLIENT_SECRET,
    }).forTenant(gdapTenantId);

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
      .eq('tenant_id', locals.tenant.id)
      .eq('external_id', gdapTenantId)
      .is('site_id', null)
      .single();

    if (!existing) return fail(404, { error: 'Integration link not found' });

    const link = existing as Tables<'public', 'integration_links'>;
    const updatedMeta = {
      ...((link.meta as any) ?? {}),
      capabilities,
      capabilitiesCheckedAt: new Date().toISOString(),
    };

    const { error: updateError } = await locals.supabase
      .from('integration_links')
      .update({ meta: updatedMeta, updated_at: new Date().toISOString() })
      .eq('id', link.id);

    if (updateError) return fail(500, { error: safeErrorMessage(updateError) });

    return { success: true };
  },
} satisfies Actions;
