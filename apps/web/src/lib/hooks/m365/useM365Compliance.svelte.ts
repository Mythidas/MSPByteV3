import { supabase } from '$lib/utils/supabase.js';
import type { ComplianceStats } from './types.js';

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export function createM365Compliance(getParams: () => { tenantId: string; linkId: string } | null) {
  let data = $state<ComplianceStats | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    const params = getParams();
    if (!params) return;

    const { tenantId, linkId } = params;
    loading = true;
    error = null;

    Promise.all([
      (supabase as any)
        .from('compliance_results')
        .select('framework_check_id, status, evaluated_at')
        .eq('tenant_id', tenantId)
        .eq('link_id', linkId)
        .order('evaluated_at', { ascending: false }),
      (supabase as any)
        .from('compliance_framework_checks')
        .select('id, name, severity')
        .eq('tenant_id', tenantId),
    ])
      .then(([resultsRes, checksRes]) => {
        const results = (resultsRes.data ?? []) as {
          framework_check_id: string;
          status: string;
        }[];
        const checks = (checksRes.data ?? []) as { id: string; name: string; severity: string }[];

        const seen = new Set<string>();
        let pass = 0, fail = 0, total = 0;
        const failingIds = new Set<string>();

        for (const row of results) {
          if (seen.has(row.framework_check_id)) continue;
          seen.add(row.framework_check_id);
          total++;
          if (row.status === 'pass') pass++;
          else { fail++; failingIds.add(row.framework_check_id); }
        }

        const topFailing = checks
          .filter((c) => failingIds.has(c.id))
          .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99))
          .slice(0, 5);

        data = { pass, fail, total, topFailing };
      })
      .catch((e) => {
        error = e?.message ?? 'Failed to load compliance data';
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
