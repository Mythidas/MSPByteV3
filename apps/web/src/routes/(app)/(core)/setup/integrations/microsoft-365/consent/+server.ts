import { redirect } from '@sveltejs/kit';
import { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET } from '$env/static/private';
import { Microsoft365Connector } from '@workspace/shared/lib/integrations/microsoft-365/connector';
import {
  REQUIRED_DIRECTORY_ROLES,
  CONSENT_VERSION,
} from '@workspace/shared/config/integrations/microsoft-365';
import { Microsoft365RoleManagerService } from '@workspace/shared/lib/integrations/microsoft-365/role-manager-service';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { writeAuditLog, writeDiagnosticLog } from '@workspace/shared/lib/utils/audit';
import { probeCapabilities } from '../_capabilities';
import type { RequestHandler } from './$types';
import { withRetry } from '@workspace/shared/lib/utils/fetch-with-retry';
import { isRecord, parseSafeErrorMessage } from '@workspace/shared/lib/utils/validators';
import z from 'zod';
import type { MSGraphDomain } from '@workspace/shared/types/integrations/microsoft/domains';

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

  const { mspbyteTenantId, gdapTenantId } = z
    .object({ mspbyteTenantId: z.string().optional(), gdapTenantId: z.string().optional() })
    .parse(stateRaw);

  // Build connectors. For GDAP tenant consent, scope the connector to that tenant.
  const partnerConnector = new Microsoft365Connector({
    tenantId: msTenantId,
    clientId: MICROSOFT_CLIENT_ID,
    clientSecret: MICROSOFT_CLIENT_SECRET,
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
        return new Microsoft365RoleManagerService(tenantConnector).ensureDirectoryRoles(
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
      message: `All retries exhausted for ${logTarget}: ${parseSafeErrorMessage(err)}`,
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

    try {
      const allDomains = await withRetry<MSGraphDomain[]>(
        async () => {
          tenantConnector.clearTokenCache();
          return tenantConnector.domains.listAll();
        },
        RETRY_OPTS.maxRetries,
        {
          baseDelayMs: RETRY_OPTS.baseDelayMs,
          module: RETRY_OPTS.module,
          context: 'getTenantDomains',
        }
      );
      domains = allDomains
        .filter((d) => d.isVerified)
        .map((d) => d.id)
        .filter(Boolean);
      defaultDomain = allDomains.find((d) => d.isDefault)?.id ?? '';
    } catch (err) {
      Logger.warn({
        module: 'consent',
        context: 'getTenantDomains',
        message: `Could not fetch domains for ${gdapTenantId}: ${parseSafeErrorMessage(err)}`,
      });
    }

    const capabilities = await probeCapabilities(tenantConnector, {
      context: `probe:${gdapTenantId}`,
    });

    let userCount = 0;
    try {
      const identities = await withRetry(
        async () => {
          tenantConnector.clearTokenCache();
          return tenantConnector.users.listAll({ $select: 'id' });
        },
        RETRY_OPTS.maxRetries,
        { baseDelayMs: RETRY_OPTS.baseDelayMs, module: RETRY_OPTS.module, context: 'getUserCount' }
      );
      userCount = identities.length;
    } catch (err) {
      Logger.warn({
        module: 'consent',
        context: 'getUserCount',
        message: `Could not fetch user count for ${gdapTenantId}: ${parseSafeErrorMessage(err)}`,
      });
    }

    const { data: existingResult } = await locals.supabase
      .from('integration_links')
      .select('id, meta')
      .eq('integration_id', 'microsoft-365')
      .eq('tenant_id', locals.tenant?.id ?? '')
      .eq('external_id', gdapTenantId)
      .is('site_id', null)
      .single();

    const meta = isRecord(existingResult?.meta) ? existingResult?.meta : {};
    const updatedMeta = {
      ...meta,
      consentVersion: CONSENT_VERSION,
      domains,
      defaultDomain,
      userCount,
      roles: assigned,
      ...(capabilities ? { capabilities, capabilitiesCheckedAt: new Date().toISOString() } : {}),
    };

    if (existingResult) {
      await locals.supabase
        .from('integration_links')
        .update({
          status: 'active',
          meta: updatedMeta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingResult.id);
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
      message: parseSafeErrorMessage(error.message),
    });
    return redirect(
      302,
      `/integrations/microsoft-365?error=${encodeURIComponent(parseSafeErrorMessage(error.message))}`
    );
  }

  return redirect(302, `/integrations/microsoft-365?initialConsent=success`);
};
