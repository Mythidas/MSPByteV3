import { supabase } from '$lib/utils/supabase.js';
import { INTEGRATIONS } from '@workspace/core/config/integrations';

export interface CoveOverviewStats {
  totalEndpoints: number;
  failedEndpoints: number;
  noRecentBackup: number;
  totalSelectedSize: number;
  totalUsedStorage: number;
  activeAlerts: number;
}

export function createCoveOverview(
  getParams: () => { tenantId: string; siteId?: string | null } | null,
) {
  let data = $state<CoveOverviewStats | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    const params = getParams();
    if (!params) return;

    const { tenantId, siteId } = params;
    loading = true;
    error = null;

    const integration = INTEGRATIONS['cove'];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

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
          .from('cove_endpoints' as any)
          .select('*', { count: 'exact', head: true }),
      ),
      applyScope(
        supabase
          .schema('vendors')
          .from('cove_endpoints' as any)
          .select('*', { count: 'exact', head: true })
          .neq('status', 'Completed')
          .neq('status', 'In Process'),
      ),
      applyScope(
        supabase
          .schema('vendors')
          .from('cove_endpoints' as any)
          .select('*', { count: 'exact', head: true })
          .or(`last_success_at.is.null,last_success_at.lt.${sevenDaysAgo}`),
      ),
      applyScope(
        supabase
          .schema('vendors')
          .from('cove_endpoints' as any)
          .select('selected_size,used_storage'),
      ),
      alertsQuery,
    ])
      .then(([total, failed, noBackup, storageData, alerts]) => {
        const storage = (storageData.data ?? []) as { selected_size: number; used_storage: number }[];
        data = {
          totalEndpoints: total.count ?? 0,
          failedEndpoints: failed.count ?? 0,
          noRecentBackup: noBackup.count ?? 0,
          totalSelectedSize: storage.reduce((acc, s) => acc + (s.selected_size ?? 0), 0),
          totalUsedStorage: storage.reduce((acc, s) => acc + (s.used_storage ?? 0), 0),
          activeAlerts: alerts.count ?? 0,
        };
      })
      .catch((e) => {
        error = e?.message ?? 'Failed to load Cove overview data';
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
