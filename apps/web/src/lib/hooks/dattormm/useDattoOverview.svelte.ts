import { supabase } from '$lib/utils/supabase.js';
import { INTEGRATIONS } from '@workspace/core/config/integrations';

export interface DattoOverviewStats {
  totalDevices: number;
  staleDevices: number;
  activeAlerts: number;
}

export function createDattoOverview(
  getParams: () => { tenantId: string; siteId?: string | null } | null,
) {
  let data = $state<DattoOverviewStats | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    const params = getParams();
    if (!params) return;

    const { tenantId, siteId } = params;
    loading = true;
    error = null;

    const integration = INTEGRATIONS['dattormm'];
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
          .from('datto_endpoints' as any)
          .select('*', { count: 'exact', head: true }),
      ),
      applyScope(
        supabase
          .schema('vendors')
          .from('datto_endpoints' as any)
          .select('*', { count: 'exact', head: true })
          .eq('online', false)
          .or(
            `and(online.eq.false,or(last_heartbeat_at.is.null,last_heartbeat_at.lt.${sixtyDaysAgo}))`,
          ),
      ),
      alertsQuery,
    ])
      .then(([total, stale, alerts]) => {
        data = {
          totalDevices: total.count ?? 0,
          staleDevices: stale.count ?? 0,
          activeAlerts: alerts.count ?? 0,
        };
      })
      .catch((e) => {
        error = e?.message ?? 'Failed to load DattoRMM overview data';
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
