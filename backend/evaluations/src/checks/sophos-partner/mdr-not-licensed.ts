import type { CheckDefinition, CheckContext, CheckHit } from "../types";

// Matches the seeded alert_definitions row for this check (source='platform', tenant_id=null)
export const DEFINITION_ID = "ad100001-0000-0000-0000-000000000002";

async function fn({ tenantId, linkId, supabase }: CheckContext): Promise<CheckHit[]> {
  const { data, error } = await (supabase as any)
    .schema("vendors")
    .from("sophos_endpoints")
    .select("external_id, hostname, site_id")
    .eq("tenant_id", tenantId)
    .eq("link_id", linkId)
    .eq("has_mdr", false);

  if (error) throw new Error(`mdr-not-licensed: ${(error as { message: string }).message}`);

  return ((data as any[]) ?? []).map((ep: any) => ({
    definitionId: DEFINITION_ID,
    entityId: ep.external_id as string,
    entityType: "sophos_endpoint",
    siteId: (ep.site_id as string | null) ?? null,
    message: `${ep.hostname as string} does not have MDR licensed`,
    metadata: { hostname: ep.hostname as string },
  }));
}

export const mdrNotLicensed: CheckDefinition = {
  definitionId: DEFINITION_ID,
  fn,
};
