import { supabase } from "../lib/supabase";

export type ComplianceCheckRow = {
  id: string;
  framework_id: string;
  check_type_id: string;
  name: string;
  description: string | null;
  severity: string;
  check_config: Record<string, unknown>;
  sort_order: number;
  tenant_id: string;
  on_pass_workflow_id: string | null;
  on_fail_workflow_id: string | null;
  on_change_workflow_id: string | null;
};

export type AssignmentGroup = {
  frameworkId: string;
  frameworkName: string;
  checks: ComplianceCheckRow[];
};

export async function loadAssignmentsForLink(
  tenantId: string,
  linkId: string,
): Promise<AssignmentGroup[]> {
  // 0. Resolve integration_id for this link
  const { data: linkRow, error: linkError } = await (supabase as any)
    .from("integration_links")
    .select("integration_id")
    .eq("id", linkId)
    .single();

  if (linkError || !linkRow) throw new Error(`loadAssignmentsForLink: could not resolve integration for link ${linkId}`);
  const integrationId = linkRow.integration_id;

  // 1. Query assignments for this tenant/link
  const { data: assignments, error: assignError } = await (supabase as any)
    .from("compliance_assignments")
    .select("framework_id, link_id")
    .eq("tenant_id", tenantId)
    .or(`link_id.eq.${linkId},link_id.is.null`);

  if (assignError) throw new Error(`loadAssignmentsForLink failed: ${assignError.message}`);
  if (!assignments || assignments.length === 0) return [];

  // Link-level row wins over tenant-level (null link_id)
  const byFramework = new Map<string, { hasLinkLevel: boolean }>();
  for (const row of assignments as { framework_id: string; link_id: string | null }[]) {
    const existing = byFramework.get(row.framework_id);
    const isLinkLevel = row.link_id === linkId;
    if (!existing) {
      byFramework.set(row.framework_id, { hasLinkLevel: isLinkLevel });
    } else if (isLinkLevel) {
      byFramework.set(row.framework_id, { hasLinkLevel: true });
    }
  }

  const frameworkIds = Array.from(byFramework.keys());
  if (frameworkIds.length === 0) return [];

  // 2. Fetch framework names
  const { data: frameworks, error: fwError } = await (supabase as any)
    .from("compliance_frameworks")
    .select("id, name")
    .in("id", frameworkIds)
    .eq("tenant_id", tenantId)
    .eq("integration_id", integrationId);

  if (fwError) throw new Error(`loadAssignmentsForLink frameworks failed: ${fwError.message}`);

  const frameworkNames = new Map<string, string>(
    (frameworks as { id: string; name: string }[]).map((f) => [f.id, f.name]),
  );

  // 3. Fetch checks
  const { data: checks, error: checkError } = await (supabase as any)
    .from("compliance_framework_checks")
    .select("id, framework_id, check_type_id, name, description, severity, check_config, sort_order, tenant_id, on_pass_workflow_id, on_fail_workflow_id, on_change_workflow_id")
    .in("framework_id", frameworkIds)
    .eq("tenant_id", tenantId)
    .order("sort_order");

  if (checkError) throw new Error(`loadAssignmentsForLink checks failed: ${checkError.message}`);

  // 4. Group by framework
  const grouped = new Map<string, ComplianceCheckRow[]>();
  for (const check of (checks ?? []) as ComplianceCheckRow[]) {
    const list = grouped.get(check.framework_id) ?? [];
    list.push(check);
    grouped.set(check.framework_id, list);
  }

  return frameworkIds.map((fwId) => ({
    frameworkId: fwId,
    frameworkName: frameworkNames.get(fwId) ?? fwId,
    checks: grouped.get(fwId) ?? [],
  }));
}

export async function loadAssignmentsForTenant(
  tenantId: string,
): Promise<Map<string, AssignmentGroup[]>> {
  // Get all distinct link_ids with assignments
  const { data, error } = await (supabase as any)
    .from("compliance_assignments")
    .select("link_id")
    .eq("tenant_id", tenantId)
    .not("link_id", "is", null);

  if (error) throw new Error(`loadAssignmentsForTenant failed: ${error.message}`);

  const linkIds = [...new Set((data as { link_id: string }[]).map((r) => r.link_id))];

  const result = new Map<string, AssignmentGroup[]>();
  await Promise.all(
    linkIds.map(async (linkId) => {
      const groups = await loadAssignmentsForLink(tenantId, linkId);
      result.set(linkId, groups);
    }),
  );

  return result;
}
