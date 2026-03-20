import { supabase } from '$lib/utils/supabase.js';
import { INTEGRATIONS } from '@workspace/core/config/integrations';

export interface TenantCardStats {
  identities: { total: number; noMfa: number; disabled: number };
  licenses: { consumed: number; total: number };
  compliance: { pass: number; total: number };
  alerts: number;
}

export function createM365TenantCard(getParams: () => { tenantId: string; linkId: string } | null) {
  let data = $state<TenantCardStats | null>(null);
  let loading = $state(true);

  $effect(() => {
    const params = getParams();
    if (!params) return;

    const { tenantId, linkId } = params;
    loading = true;

    const applyScope = (q: any) => q.eq('tenant_id', tenantId).eq('link_id', linkId);
    const integration = INTEGRATIONS['microsoft-365'];

    Promise.all([
      // Identity counts — head: true avoids row limit entirely
      applyScope(
        supabase
          .schema('vendors')
          .from('m365_identities' as any)
          .select('*', { count: 'exact', head: true })
      ),
      applyScope(
        supabase
          .schema('vendors')
          .from('m365_identities' as any)
          .select('*', { count: 'exact', head: true })
          .eq('mfa_enforced', false)
      ),
      applyScope(
        supabase
          .schema('vendors')
          .from('m365_identities' as any)
          .select('*', { count: 'exact', head: true })
          .eq('enabled', false)
      ),
      // Licenses — scoped to one link, row count is small
      applyScope(
        supabase
          .schema('vendors')
          .from('m365_licenses' as any)
          .select('total_units,consumed_units')
          .not('friendly_name', 'ilike', '%free%')
          .not('friendly_name', 'ilike', '%tria%')
          .not('friendly_name', 'ilike', '%Credits%')
          .not('friendly_name', 'ilike', '%Windows Store%')
          .not('friendly_name', 'ilike', '%Microsoft Power Apps for Developer%')
      ),
      // Compliance — scoped to one link, newest-first for dedup
      (supabase as any)
        .from('compliance_results')
        .select('framework_check_id, status, evaluated_at')
        .eq('tenant_id', tenantId)
        .eq('link_id', linkId)
        .order('evaluated_at', { ascending: false }),
      // Alert count
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
      .then(([totalRes, noMfaRes, disabledRes, licensesRes, complianceRes, alertsRes]) => {
        const licenseRows = (licensesRes.data ?? []) as {
          total_units: number;
          consumed_units: number;
        }[];

        const complianceRows = (complianceRes.data ?? []) as {
          framework_check_id: string;
          status: string;
        }[];
        const seen = new Set<string>();
        let pass = 0,
          total = 0;
        for (const row of complianceRows) {
          if (seen.has(row.framework_check_id)) continue;
          seen.add(row.framework_check_id);
          total++;
          if (row.status === 'pass') pass++;
        }

        data = {
          identities: {
            total: totalRes.count ?? 0,
            noMfa: noMfaRes.count ?? 0,
            disabled: disabledRes.count ?? 0,
          },
          licenses: {
            consumed: licenseRows.reduce((acc, l) => acc + (l.consumed_units ?? 0), 0),
            total: licenseRows.reduce((acc, l) => acc + (l.total_units ?? 0), 0),
          },
          compliance: { pass, total },
          alerts: alertsRes.count ?? 0,
        };
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
  };
}
