import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET } from '$env/static/private';
import { PUBLIC_ORIGIN } from '$env/static/public';
import { Encryption } from '$lib/server/encryption';

export const GET: RequestHandler = async ({ url, locals }) => {
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    const desc = url.searchParams.get('error_description') ?? errorParam;
    return redirect(302, `/integrations/microsoft-365?error=${encodeURIComponent(desc)}`);
  }

  if (!code || !stateRaw) {
    return redirect(302, '/integrations/microsoft-365?error=missing_params');
  }

  let state: { mspbyteTenantId?: string };
  try {
    state = JSON.parse(stateRaw);
  } catch {
    return redirect(302, '/integrations/microsoft-365?error=invalid_state');
  }

  if (!state.mspbyteTenantId) {
    return redirect(302, '/integrations/microsoft-365?error=missing_tenant');
  }

  // CSRF check: state tenant must match the logged-in user's tenant
  if (state.mspbyteTenantId !== locals.user?.tenant_id) {
    return redirect(302, '/integrations/microsoft-365?error=state_mismatch');
  }

  // Exchange auth code for tokens
  const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${PUBLIC_ORIGIN}/integrations/microsoft-365/consent`,
      scope: 'openid offline_access https://graph.microsoft.com/.default',
    }).toString(),
  });

  if (!tokenRes.ok) {
    return redirect(302, '/integrations/microsoft-365?error=token_exchange_failed');
  }

  const tokens = await tokenRes.json();
  const refreshToken: string = tokens.refresh_token;

  if (!refreshToken) {
    return redirect(302, '/integrations/microsoft-365?error=no_refresh_token');
  }

  // Extract MSP tenant ID from the id_token JWT (middle segment, base64url-decode)
  let msEntraTenantId: string;
  try {
    const idTokenPayload = JSON.parse(
      Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString()
    );
    msEntraTenantId = idTokenPayload.tid;
  } catch {
    return redirect(302, '/integrations/microsoft-365?error=invalid_id_token');
  }

  try {
    await locals.orm.upsert('public', 'integrations', [
      {
        id: 'microsoft-365',
        tenant_id: state.mspbyteTenantId,
        config: {
          mode: 'partner',
          tenantId: msEntraTenantId,
          refreshToken: Encryption.encrypt(refreshToken),
        },
        updated_at: new Date().toISOString(),
      },
    ]);
  } catch (err) {
    return redirect(
      302,
      `/integrations/microsoft-365?error=${encodeURIComponent(String(err))}`,
    );
  }

  return redirect(302, '/integrations/microsoft-365?tab=mappings');
};
