import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { INTEGRATION_IDS, type IntegrationId } from '@workspace/shared/types/integrations';
import {
  deriveNotificationsFromHealth,
  deriveNotificationsFromExpiry,
} from '$lib/utils/integration-health';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user || !locals.role || !locals.tenant) {
    return redirect(303, '/auth/login');
  }

  const tenantId = locals.tenant.id;

  const [{ data: activeIntegrations }, { data: syncIssues }] = await Promise.all([
    locals.supabase
      .from('integrations')
      .select('id, credential_expiration')
      .is('deleted_at', null)
      .eq('tenant_id', tenantId),
    locals.supabase
      .from('ingest_sync_states')
      .select('integration_id, last_error_class, last_error_message, consecutive_failures')
      .eq('tenant_id', tenantId)
      .eq('last_status', 'failed'),
  ]);

  const notifications = [
    ...deriveNotificationsFromHealth(syncIssues ?? []),
    ...deriveNotificationsFromExpiry(
      activeIntegrations?.filter(
        (ai) =>
          ai.credential_expiration &&
          new Date(ai.credential_expiration).getTime() <
            new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).getTime()
      ) ?? []
    ),
  ];

  return {
    user: locals.user,
    role: locals.role,
    tenant: locals.tenant,
    activeIntegrations: (activeIntegrations?.map((ai) => ai.id) ?? []).filter(
      (id): id is IntegrationId => (INTEGRATION_IDS as readonly string[]).includes(id)
    ),
    notifications,
  };
};
