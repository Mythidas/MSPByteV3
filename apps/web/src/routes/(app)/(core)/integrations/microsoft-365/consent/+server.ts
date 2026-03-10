import { redirect } from '@sveltejs/kit';
import { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET } from '$env/static/private';
import { Microsoft365Connector } from '@workspace/shared/lib/connectors/Microsoft365Connector';
import { Microsoft365RoleManager } from '@workspace/shared/lib/services/microsoft/RoleManager';
import { TenantCapabilityService } from '@workspace/shared/lib/services/microsoft/TenantCapabilityService';
import { REQUIRED_DIRECTORY_ROLES, CONSENT_VERSION } from '@workspace/shared/config/microsoft';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { writeAuditLog, writeDiagnosticLog } from '@workspace/shared/lib/utils/audit';
import { safeErrorMessage } from '@workspace/shared/lib/utils/errors';
import { withRetry } from '@workspace/shared/lib/utils/retry';
import type { RequestHandler } from './$types';
import type { Tables } from '@workspace/shared/types/database';

const RETRY_OPTS = { maxRetries: 5, baseDelayMs: 2_000, module: 'consent' } as const;

export const GET: RequestHandler = async ({ url, locals }) => {
  const msTenantId = url.searchParams.get('tenant');
  const stateRaw = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  if (errorParam) {
    const desc = url.searchParams.get('error_description') ?? errorParam;
    return redirect(302, `/integrations/microsoft-365?error=${encodeURIComponent(desc)}`);
  }

  if (!msTenantId || !stateRaw) {
    return redirect(
      302,
      `/integrations/microsoft-365?error=${encodeURIComponent('Consent flow returned impartial parameters')}`
    );
  }

  let state: { mspbyteTenantId?: string; gdapTenantId?: string };
  try {
    state = JSON.parse(stateRaw);
  } catch {
    return redirect(
      302,
      `/integrations/microsoft-365?error=${encodeURIComponent('Failed to parse consent flow state')}`
    );
  }

  const { mspbyteTenantId, gdapTenantId } = state;

  // Build connectors. For GDAP tenant consent, scope the connector to that tenant.
  const partnerConnector = new Microsoft365Connector({
    tenantId: msTenantId,
    clientId: MICROSOFT_CLIENT_ID,
    clientSecret: MICROSOFT_CLIENT_SECRET,
    mode: 'partner',
  });
  const tenantConnector = gdapTenantId
    ? partnerConnector.forTenant(gdapTenantId)
    : partnerConnector;

  // Assign required directory roles, retrying to allow SP/GDAP propagation after consent redirect.
  const logTarget = gdapTenantId ?? mspbyteTenantId;
  let assigned: string[] = [];
  let failed: string[] = [];
  try {
    ({ assigned, failed } = await withRetry(
      () => {
        tenantConnector.clearTokenCache();
        return new Microsoft365RoleManager(tenantConnector).ensureDirectoryRoles(
          REQUIRED_DIRECTORY_ROLES
        );
      },
      RETRY_OPTS.maxRetries,
      {
        baseDelayMs: RETRY_OPTS.baseDelayMs,
        module: RETRY_OPTS.module,
        context: 'ensureDirectoryRoles',
      }
    ));
  } catch (err) {
    Logger.warn({
      module: 'consent',
      context: 'ensureDirectoryRoles',
      message: `All retries exhausted for ${logTarget}: ${safeErrorMessage(err)}`,
    });
  }

  if (assigned.length > 0) {
    Logger.info({
      module: 'consent',
      context: 'ensureDirectoryRoles',
      message: `Assigned [${assigned.join(', ')}] to ${logTarget}`,
    });
  }
  if (failed.length > 0) {
    Logger.warn({
      module: 'consent',
      context: 'ensureDirectoryRoles',
      message: `Failed to assign roles [${failed.join(', ')}] to ${logTarget}`,
    });
    await writeDiagnosticLog(locals.supabase, {
      tenant_id: mspbyteTenantId!,
      level: 'warn',
      module: 'consent',
      context: 'ensureDirectoryRoles',
      message: `Failed to assign roles [${failed.join(', ')}] to ${logTarget}`,
      meta: { failed, gdapTenantId: logTarget },
    });
  }

  await writeAuditLog(locals.supabase, {
    tenant_id: mspbyteTenantId!,
    actor: 'system',
    action: 'role_assigned',
    target_type: 'integration_connection',
    target_id: logTarget ?? '',
    result: failed.length === 0 ? 'success' : assigned.length > 0 ? 'success' : 'failure',
    detail: { assigned, failed, gdapTenantId: logTarget },
  });

  if (gdapTenantId) {
    // Activate the GDAP connection: populate meta with domains + capabilities, then mark active.
    // Both lookups are retried to handle propagation delays; failure is non-fatal.
    let domains: string[] = [];
    let defaultDomain = '';
    let capabilities: unknown = undefined;

    try {
      const result = await withRetry(
        async () => {
          tenantConnector.clearTokenCache();
          const r = await tenantConnector.getTenantDomains(undefined, true);
          if (r.error) throw new Error(safeErrorMessage(r.error));
          return r;
        },
        RETRY_OPTS.maxRetries,
        {
          baseDelayMs: RETRY_OPTS.baseDelayMs,
          module: RETRY_OPTS.module,
          context: 'getTenantDomains',
        }
      );
      domains = (result.data?.domains ?? [])
        .filter((d: any) => d.isVerified)
        .map((d: any) => d.id as string)
        .filter(Boolean);
      defaultDomain = (result.data?.domains ?? []).find((d: any) => d.isDefault)?.id ?? '';
    } catch (err) {
      Logger.warn({
        module: 'consent',
        context: 'getTenantDomains',
        message: `Could not fetch domains for ${gdapTenantId}: ${safeErrorMessage(err)}`,
      });
    }

    try {
      const capsResult = await withRetry(
        async () => {
          tenantConnector.clearTokenCache();
          const r = await new TenantCapabilityService(tenantConnector).probe();
          if (r.error) throw new Error(safeErrorMessage(r.error));
          return r;
        },
        RETRY_OPTS.maxRetries,
        { baseDelayMs: RETRY_OPTS.baseDelayMs, module: RETRY_OPTS.module, context: 'probe' }
      );
      capabilities = capsResult.data;
    } catch (err) {
      Logger.warn({
        module: 'consent',
        context: 'probe',
        message: `Could not probe capabilities for ${gdapTenantId}: ${safeErrorMessage(err)}`,
      });
    }

    let userCount = 0;
    try {
      const identitiesResult = await withRetry(
        async () => {
          tenantConnector.clearTokenCache();
          const r = await tenantConnector.getIdentities({ select: ['id'] }, true);
          if (r.error) throw new Error(safeErrorMessage(r.error));
          return r;
        },
        RETRY_OPTS.maxRetries,
        { baseDelayMs: RETRY_OPTS.baseDelayMs, module: RETRY_OPTS.module, context: 'getUserCount' }
      );
      userCount = identitiesResult.data?.identities.length ?? 0;
    } catch (err) {
      Logger.warn({
        module: 'consent',
        context: 'getUserCount',
        message: `Could not fetch user count for ${gdapTenantId}: ${safeErrorMessage(err)}`,
      });
    }

    const { data: existingResult } = await locals.supabase
      .from('integration_links')
      .select('*')
      .eq('integration_id', 'microsoft-365')
      .eq('tenant_id', locals.tenant.id)
      .eq('external_id', gdapTenantId)
      .is('site_id', null)
      .single();

    const existing = existingResult as Tables<'public', 'integration_links'>;
    const updatedMeta = {
      ...((existing?.meta as any) ?? {}),
      consentVersion: CONSENT_VERSION,
      domains,
      defaultDomain,
      userCount,
      ...(capabilities ? { capabilities, capabilitiesCheckedAt: new Date().toISOString() } : {}),
    };

    if (existing) {
      await locals.supabase
        .from('integration_links')
        .update({
          status: 'active',
          meta: updatedMeta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    }

    return redirect(
      302,
      `/integrations/microsoft-365?consentedTenant=${encodeURIComponent(gdapTenantId)}`
    );
  }

  // MSP initial consent — persist the partner tenant ID and redirect.
  const { error } = await locals.supabase.from('integrations').upsert(
    {
      id: 'microsoft-365',
      tenant_id: mspbyteTenantId!,
      config: {
        tenantId: msTenantId,
      },
      updated_at: new Date().toISOString(),
      deleted_at: null,
    },
    { onConflict: 'id,tenant_id' }
  );

  if (error) {
    Logger.error({
      module: 'consent',
      context: 'upsertIntegration',
      message: safeErrorMessage(error.message),
    });
    return redirect(
      302,
      `/integrations/microsoft-365?error=${encodeURIComponent(safeErrorMessage(error.message))}`
    );
  }

  return redirect(302, `/integrations/microsoft-365?initialConsent=success`);
};
