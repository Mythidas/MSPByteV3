import { supabase } from '$lib/utils/supabase.js';
import { INTEGRATIONS } from '@workspace/core/config/integrations';
import type { AlertStats } from './types.js';

export function createM365Alerts(getParams: () => { tenantId: string; linkId: string } | null) {
  let data = $state<AlertStats | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    const params = getParams();
    if (!params) return;

    const { tenantId, linkId } = params;
    loading = true;
    error = null;

    const integration = INTEGRATIONS['microsoft-365'];

    Promise.all([
      supabase
        .schema('views')
        .from('d_alerts_view' as any)
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('link_id', linkId)
        .eq('status', 'active')
        .in(
          'entity_type',
          integration.supportedTypes.filter((t) => t.type).map((t) => t.type)
        ),
    ])
      .then(([res]) => {
        data = { active: res.count ?? 0 };
      })
      .catch((e) => {
        error = e?.message ?? 'Failed to load alert data';
      })
      .finally(() => {
        loading = false;
      });
  });

  return {
    get data() {
      return data;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
  };
}
