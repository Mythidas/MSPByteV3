import { supabase } from '$lib/utils/supabase.js';
import type { LicenseStats } from './types.js';

export function createM365Licenses(getParams: () => { tenantId: string; linkId: string } | null) {
  let data = $state<LicenseStats | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    const params = getParams();
    if (!params) return;

    const { tenantId, linkId } = params;
    loading = true;
    error = null;

    Promise.all([
      supabase
        .schema('vendors')
        .from('m365_licenses')
        .select('total_units,consumed_units,warning_units')
        .eq('tenant_id', tenantId)
        .eq('link_id', linkId)
        .not('friendly_name', 'ilike', '%free%')
        .not('friendly_name', 'ilike', '%tria%')
        .not('friendly_name', 'ilike', '%Credits%')
        .not('friendly_name', 'ilike', '%Windows Store%')
        .not('friendly_name', 'ilike', '%Microsoft Power Apps for Developer%'),
    ])
      .then(([res]) => {
        const licenses = (res.data ?? []) as { total_units: number; consumed_units: number }[];
        data = {
          totalSKUs: licenses.length,
          totalConsumed: licenses.reduce((acc, l) => acc + (l.consumed_units ?? 0), 0),
          totalAvailable: licenses.reduce(
            (acc, l) => acc + ((l.total_units ?? 0) - (l.consumed_units ?? 0)),
            0
          ),
        };
      })
      .catch((e) => {
        error = e?.message ?? 'Failed to load license data';
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
