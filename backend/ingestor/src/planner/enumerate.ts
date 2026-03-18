import { INTEGRATIONS } from "@workspace/core/config/integrations";
import type { IntegrationId } from "@workspace/core/types/integrations";
import type { IngestType } from "@workspace/core/types/ingest";
import { Logger } from "@workspace/core/lib/utils/logger";
import { supabase } from "../lib/supabase";

export type PlannerEntry = {
  tenantId: string;
  integrationId: IntegrationId;
  ingestType: IngestType;
  siteId?: string;
  linkId?: string;
  config: Record<string, string>;
  priority: number;
};

export async function enumerate(): Promise<PlannerEntry[]> {
  const { data: rows, error } = await supabase
    .from("integrations")
    .select("id, tenant_id, config")
    .is("deleted_at", null);

  if (error) throw new Error(`enumerate: failed to query integrations: ${error.message}`);
  if (!rows) return [];

  const entries: PlannerEntry[] = [];

  for (const row of rows) {
    const integration = INTEGRATIONS[row.id as IntegrationId];
    if (!integration || integration.supportedTypes.length === 0) continue;

    const config = (row.config ?? {}) as Record<string, string>;

    if (integration.scope === "link") {
      const { data: links, error: linksError } = await supabase
        .from("integration_links")
        .select("id")
        .eq("integration_id", row.id)
        .eq("tenant_id", row.tenant_id);

      if (linksError) {
        Logger.error({ module: "ingestor", context: "planner:enumerate", message: `failed to query links for ${row.id}: ${linksError.message}` });
        continue;
      }

      for (const link of links ?? []) {
        for (const typeConfig of integration.supportedTypes) {
          entries.push({
            tenantId: row.tenant_id,
            integrationId: row.id as IntegrationId,
            ingestType: typeConfig.type,
            linkId: link.id,
            config,
            priority: typeConfig.priority,
          });
        }
      }
    } else {
      // scope === "site"
      const { data: sites, error: sitesError } = await supabase
        .from("sites")
        .select("id")
        .eq("tenant_id", row.tenant_id);

      if (sitesError) {
        Logger.error({ module: "ingestor", context: "planner:enumerate", message: `failed to query sites for tenant ${row.tenant_id}: ${sitesError.message}` });
        continue;
      }

      for (const site of sites ?? []) {
        for (const typeConfig of integration.supportedTypes) {
          entries.push({
            tenantId: row.tenant_id,
            integrationId: row.id as IntegrationId,
            ingestType: typeConfig.type,
            siteId: site.id,
            config,
            priority: typeConfig.priority,
          });
        }
      }
    }
  }

  return entries;
}
