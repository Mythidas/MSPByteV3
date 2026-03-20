import { supabase } from '$lib/utils/supabase.js';

export type ComplianceFramework = { id: string; name: string };
export type ComplianceCheck = {
  id: string;
  name: string;
  severity: string;
  description: string | null;
  check_config: Record<string, unknown>;
  framework_id: string;
};
export type ComplianceResult = {
  id: string;
  framework_check_id: string;
  link_id: string;
  status: string;
  detail: Record<string, unknown> | null;
  evaluated_at: string;
};
export type ComplianceLink = { id: string; name: string };

export function createM365ComplianceData(getTenantId: () => string | null) {
  let frameworks = $state<ComplianceFramework[]>([]);
  let checks = $state<ComplianceCheck[]>([]);
  let results = $state<ComplianceResult[]>([]);
  let links = $state<ComplianceLink[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    const tenantId = getTenantId();
    if (!tenantId) return;

    loading = true;
    error = null;

    Promise.all([
      (supabase as any)
        .from('compliance_frameworks' as any)
        .select('id, name')
        .eq('tenant_id', tenantId)
        .eq('integration_id', 'microsoft-365'),
      (supabase as any)
        .from('compliance_framework_checks' as any)
        .select('id, name, description, severity, check_config, framework_id')
        .eq('tenant_id', tenantId),
      (supabase as any)
        .from('compliance_results' as any)
        .select('id, framework_check_id, link_id, status, detail, evaluated_at')
        .eq('tenant_id', tenantId)
        .order('evaluated_at', { ascending: false }),
      (supabase as any)
        .from('integration_links' as any)
        .select('id, name')
        .eq('tenant_id', tenantId)
        .eq('integration_id', 'microsoft-365'),
    ])
      .then(([fwRes, checkRes, resultRes, linkRes]) => {
        frameworks = (fwRes.data ?? []) as ComplianceFramework[];
        checks = (checkRes.data ?? []) as ComplianceCheck[];
        results = (resultRes.data ?? []) as ComplianceResult[];
        links = (linkRes.data ?? []) as ComplianceLink[];
      })
      .catch((e) => {
        error = e?.message ?? 'Failed to load compliance data';
      })
      .finally(() => {
        loading = false;
      });
  });

  return {
    get frameworks() { return frameworks; },
    get checks() { return checks; },
    get results() { return results; },
    get links() { return links; },
    get loading() { return loading; },
    get error() { return error; },
  };
}
