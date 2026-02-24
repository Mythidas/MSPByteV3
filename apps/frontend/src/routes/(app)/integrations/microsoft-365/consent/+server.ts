import { redirect } from '@sveltejs/kit';
import { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET } from '$env/static/private';
import { Microsoft365Connector } from '@workspace/shared/lib/connectors/Microsoft365Connector';
import { Microsoft365RoleManager } from '@workspace/shared/lib/services/microsoft/RoleManager';
import { TenantCapabilityService } from '@workspace/shared/lib/services/microsoft/TenantCapabilityService';
import { REQUIRED_DIRECTORY_ROLES } from '@workspace/shared/config/microsoft';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { writeAuditLog, writeDiagnosticLog } from '@workspace/shared/lib/utils/audit';
import { safeErrorMessage } from '@workspace/shared/lib/utils/errors';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const msTenantId = url.searchParams.get('tenant');
  const stateRaw = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    const desc = url.searchParams.get('error_description') ?? errorParam;
    return redirect(302, `/integrations/microsoft-365?error=${encodeURIComponent(desc)}`);
  }

  if (!msTenantId || !stateRaw) {
    return redirect(302, '/integrations/microsoft-365?error=missing_params');
  }

  let state: { mspbyteTenantId?: string; gdapTenantId?: string };
  try {
    state = JSON.parse(stateRaw);
  } catch {
    return redirect(302, '/integrations/microsoft-365?error=invalid_state');
  }

  if (state.mspbyteTenantId !== locals.user?.tenant_id) {
    return redirect(302, '/integrations/microsoft-365?error=state_mismatch');
  }

  // Customer tenant GDAP consent — assign required directory roles then redirect
  const tenantId = state.gdapTenantId ?? state.mspbyteTenantId;
  const baseConnector = new Microsoft365Connector({
    tenantId: msTenantId,
    clientId: MICROSOFT_CLIENT_ID,
    clientSecret: MICROSOFT_CLIENT_SECRET,
    mode: 'partner',
  });
  const connector = state.gdapTenantId
    ? baseConnector.forTenant(state.gdapTenantId)
    : baseConnector;

  const roleManager = new Microsoft365RoleManager(connector);
  const { assigned, failed } = await roleManager.ensureDirectoryRoles(REQUIRED_DIRECTORY_ROLES);

  if (assigned.length > 0) {
    Logger.info({
      module: 'consent',
      context: 'ensureDirectoryRoles',
      message: `Assigned [${assigned.join(', ')}] to ${tenantId}`,
    });
  }
  if (failed.length > 0) {
    Logger.warn({
      module: 'consent',
      context: 'ensureDirectoryRoles',
      message: `Failed to assign [${failed.join(', ')}] to ${tenantId}`,
    });
    await writeDiagnosticLog(locals.supabase, {
      tenant_id: state.mspbyteTenantId!,
      level: 'warn',
      module: 'consent',
      context: 'ensureDirectoryRoles',
      message: `Failed to assign roles [${failed.join(', ')}] to ${tenantId}`,
      meta: { failed, gdapTenantId: tenantId },
    });
  }

  // Write audit log for role assignment result
  await writeAuditLog(locals.supabase, {
    tenant_id: state.mspbyteTenantId!,
    actor: 'system',
    action: 'role_assigned',
    target_type: 'integration_connection',
    target_id: tenantId ?? '',
    result: failed.length === 0 ? 'success' : assigned.length > 0 ? 'success' : 'failure',
    detail: { assigned, failed, gdapTenantId: tenantId },
  });

  if (state.gdapTenantId) {
    // Activate the connection and populate meta with domains + capabilities
    try {
      const [domainResult, capsResult, existingResult] = await Promise.all([
        connector.getTenantDomains(undefined, true),
        new TenantCapabilityService(connector).probe(),
        locals.orm.selectSingle('public', 'integration_connections', (q) =>
          q
            .eq('integration_id', 'microsoft-365')
            .eq('tenant_id', state.mspbyteTenantId!)
            .eq('external_id', state.gdapTenantId!)
        ),
      ]);

      const domains = (domainResult.data?.domains ?? [])
        .filter((d: any) => d.isVerified)
        .map((d: any) => d.id as string)
        .filter(Boolean);
      const defaultDomain =
        (domainResult.data?.domains ?? []).find((d: any) => d.isDefault)?.id ?? '';

      const existing = existingResult.data;
      const updatedMeta = {
        ...((existing?.meta as any) ?? {}),
        domains,
        defaultDomain,
        ...(capsResult.data
          ? { capabilities: capsResult.data, capabilitiesCheckedAt: new Date().toISOString() }
          : {}),
      };

      if (existing) {
        await locals.orm.update('public', 'integration_connections', existing.id, {
          status: 'active',
          meta: updatedMeta,
          updated_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      Logger.warn({
        module: 'consent',
        context: 'activateGDAPConnection',
        message: `Failed to activate connection for ${state.gdapTenantId}: ${safeErrorMessage(err)}`,
      });
    }

    return redirect(
      302,
      `/integrations/microsoft-365?tab=connections&consentedTenant=${encodeURIComponent(state.gdapTenantId)}`
    );
  }

  // MSP-level consent — save tenant ID and refresh token
  try {
    await locals.orm.upsert(
      'public',
      'integrations',
      [
        {
          id: 'microsoft-365',
          tenant_id: state.mspbyteTenantId,
          config: {
            mode: 'partner',
            tenantId: msTenantId,
          },
          updated_at: new Date().toISOString(),
        },
      ],
      ['id', 'tenant_id']
    );
  } catch (err) {
    Logger.error({
      module: 'consent',
      context: 'upsertIntegration',
      message: safeErrorMessage(err),
    });
    return redirect(302, `/integrations/microsoft-365?error=${encodeURIComponent(String(err))}`);
  }

  return redirect(302, '/integrations/microsoft-365?tab=connections');
};
