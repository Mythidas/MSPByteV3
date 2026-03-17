import type { SupabaseClient } from '@supabase/supabase-js';

export async function resolveAssignments(
  supabase: SupabaseClient<any>,
  tenantId: string,
  linkId: string,
  integrationId: string,
): Promise<string[]> {
  const { data, error } = await (supabase as any)
    .from('compliance_assignments')
    .select('framework_id, link_id')
    .eq('tenant_id', tenantId)
    .eq('integration_id', integrationId)
    .or(`link_id.eq.${linkId},link_id.is.null`);

  if (error) throw new Error(`resolveAssignments failed: ${error.message}`);
  if (!data || data.length === 0) return [];

  // Group by framework_id — link-level row wins over integration-level
  const byFramework = new Map<string, { hasLinkLevel: boolean }>();

  for (const row of data as { framework_id: string; link_id: string | null }[]) {
    const existing = byFramework.get(row.framework_id);
    const isLinkLevel = row.link_id === linkId;

    if (!existing) {
      byFramework.set(row.framework_id, { hasLinkLevel: isLinkLevel });
    } else if (isLinkLevel) {
      byFramework.set(row.framework_id, { hasLinkLevel: true });
    }
  }

  return Array.from(byFramework.keys());
}
