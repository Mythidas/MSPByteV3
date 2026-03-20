import { supabase } from '$lib/utils/supabase.js';
import { INTEGRATIONS } from '@workspace/core/config/integrations';

export interface SophosOverviewStats {
  totalEndpoints: number;
  healthIssues: number;
  tamperDisabledEndpoints: number;
  staleEndpoints: number;
  upgradableEndpoints: number;
  activeAlerts: number;
}

export function createSophosOverview(
  getParams: () => { tenantId: string; siteId?: string | null } | null,
) {
  let data = $state<SophosOverviewStats | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    const params = getParams();
    if (!params) return;

    const { tenantId, siteId } = params;
    loading = true;
    error = null;

    const integration = INTEGRATIONS['sophos-partner'];
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const applyScope = (q: any) => {
      q.eq('tenant_id', tenantId);
      if (siteId) q.eq('site_id', siteId);
      return q;
    };

    const alertsQuery = supabase
      .schema('views')
      .from('d_alerts_view' as any)
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .in(
        'entity_type',
        integration.supportedTypes.filter((t) => t.type).map((t) => t.type),
      );
    if (siteId) alertsQuery.eq('site_id', siteId);

    Promise.all([
      applyScope(
        supabase
          .schema('vendors')
          .from('sophos_endpoints')
          .select('*', { count: 'exact', head: true }),
      ),
      applyScope(
        supabase
          .schema('vendors')
          .from('sophos_endpoints')
          .select('*', { count: 'exact', head: true })
          .neq('health', 'good'),
      ),
      applyScope(
        supabase
          .schema('vendors')
          .from('sophos_endpoints')
          .select('*', { count: 'exact', head: true })
          .eq('tamper_protection_enabled', false),
      ),
      applyScope(
        supabase
          .schema('vendors')
          .from('sophos_endpoints')
          .select('*', { count: 'exact', head: true })
          .or(`last_heartbeat_at.is.null,last_heartbeat_at.lt.${sixtyDaysAgo}`),
      ),
      applyScope(
        supabase
          .schema('vendors')
          .from('sophos_endpoints')
          .select('*', { count: 'exact', head: true })
          .eq('needs_upgrade', true),
      ),
      alertsQuery,
    ])
      .then(([total, health, tamper, stale, upgradable, alerts]) => {
        data = {
          totalEndpoints: total.count ?? 0,
          healthIssues: health.count ?? 0,
          tamperDisabledEndpoints: tamper.count ?? 0,
          staleEndpoints: stale.count ?? 0,
          upgradableEndpoints: upgradable.count ?? 0,
          activeAlerts: alerts.count ?? 0,
        };
      })
      .catch((e) => {
        error = e?.message ?? 'Failed to load Sophos overview data';
      })
      .finally(() => {
        loading = false;
      });
  });

  return {
    get data() { return data; },
    get loading() { return loading; },
    get error() { return error; },
  };
}
