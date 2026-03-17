import { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET } from '$env/static/private';
import { PUBLIC_ORIGIN } from '$env/static/public';
import { fail, redirect } from '@sveltejs/kit';
import { Microsoft365Connector } from '@workspace/shared/lib/connectors/Microsoft365Connector';
import { probeCapabilities } from './_capabilities';
import { safeErrorMessage } from '@workspace/shared/lib/utils/errors';
import type { Tables } from '@workspace/shared/types/database';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { data: frameworks } = await (locals.supabase as any)
    .from('compliance_frameworks')
    .select('*, compliance_framework_checks(*)')
    .eq('tenant_id', locals.tenant.id)
    .eq('integration_id', 'microsoft-365')
    .order('name');

  const { data: assignments } = await (locals.supabase as any)
    .from('compliance_assignments')
    .select('*')
    .eq('tenant_id', locals.tenant.id)
    .eq('integration_id', 'microsoft-365');

  return { frameworks: frameworks ?? [], assignments: assignments ?? [] };
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
      mode: 'partner',
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
