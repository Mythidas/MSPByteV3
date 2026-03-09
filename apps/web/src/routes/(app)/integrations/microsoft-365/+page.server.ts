import { MICROSOFT_CLIENT_ID } from '$env/static/private';
import { PUBLIC_ORIGIN } from '$env/static/public';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({}) => {};

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
} satisfies Actions;
