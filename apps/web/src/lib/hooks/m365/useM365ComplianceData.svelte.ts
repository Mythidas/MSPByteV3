import { supabase } from '$lib/utils/supabase.js';
import { parseSafeErrorMessage } from '@workspace/shared/lib/utils/validators';
import type { Json } from '@workspace/shared/types/schema';

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

function jsonToRecord(val: Json): Record<string, unknown> {
  if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
    return val;
  }
  return {};
}

function jsonToRecordOrNull(val: Json): Record<string, unknown> | null {
  if (val === null) return null;
  if (typeof val === 'object' && !Array.isArray(val)) {
    return val;
  }
  return null;
}

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
      supabase
        .from('compliance_frameworks')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .eq('integration_id', 'microsoft-365'),
      supabase
        .from('compliance_framework_checks')
        .select('id, name, description, severity, check_config, framework_id')
        .eq('tenant_id', tenantId),
      supabase
        .from('compliance_results')
        .select('id, framework_check_id, link_id, status, detail, evaluated_at')
        .eq('tenant_id', tenantId)
        .order('evaluated_at', { ascending: false }),
      supabase
        .from('integration_links')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .eq('integration_id', 'microsoft-365')
        .eq('status', 'active'),
    ])
      .then(([fwRes, checkRes, resultRes, linkRes]) => {
        frameworks = fwRes.data ?? [];
        checks = (checkRes.data ?? []).map((r) => ({
          ...r,
          check_config: jsonToRecord(r.check_config),
        }));
        results = (resultRes.data ?? []).map((r) => ({
          ...r,
          detail: jsonToRecordOrNull(r.detail),
        }));
        links = (linkRes.data ?? []).map((l) => ({ id: l.id, name: l.name ?? '' }));
      })
      .catch((e) => {
        error = parseSafeErrorMessage(e);
      })
      .finally(() => {
        loading = false;
      });
  });

  return {
    get frameworks() {
      return frameworks;
    },
    get checks() {
      return checks;
    },
    get results() {
      return results;
    },
    get links() {
      return links;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
  };
}
