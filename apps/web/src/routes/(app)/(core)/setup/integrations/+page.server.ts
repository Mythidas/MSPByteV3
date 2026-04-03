import { Logger } from '@workspace/shared/lib/utils/logger';
import { parseSafeErrorMessage } from '@workspace/shared/lib/utils/validators';
import type { PageServerLoad } from './$types';
import {
  deriveIntegrationHealthStatus,
  getCredentialExpirationStatus,
  getCredentialDaysRemaining,
} from '../../../../../lib/utils/integration-health';

type SyncStateRow = {
  integration_id: string;
  last_error_class: string | null;
  last_error_message: string | null;
  consecutive_failures: number;
};

async function getIntegrations(locals: App.Locals) {
  try {
    const tenantId = locals.tenant!.id;

    const [{ data: integrations }, { data: syncStates }] = await Promise.all([
      locals.supabase.from('integrations').select('*').eq('tenant_id', tenantId),
      locals.supabase
        .from('ingest_sync_states')
        .select('integration_id, last_error_class, last_error_message, consecutive_failures')
        .eq('tenant_id', tenantId),
    ]);

    const byIntegration = new Map<string, SyncStateRow[]>();
    for (const row of syncStates ?? []) {
      const existing = byIntegration.get(row.integration_id) ?? [];
      existing.push(row);
      byIntegration.set(row.integration_id, existing);
    }

    return (integrations ?? []).map((integration) => ({
      ...integration,
      healthStatus: deriveIntegrationHealthStatus(byIntegration.get(integration.id) ?? []),
      credExpiryStatus: getCredentialExpirationStatus(integration.credential_expiration),
      credDaysRemaining: getCredentialDaysRemaining(integration.credential_expiration),
    }));
  } catch (err) {
    Logger.error({
      module: '/integrations',
      context: 'getIntegrations',
      message: `Failed to fetch integrations: ${parseSafeErrorMessage(err)}`,
    });

    return [];
  }
}

export const load: PageServerLoad = ({ locals }) => {
  return {
    getIntegrations: getIntegrations(locals),
  };
};
