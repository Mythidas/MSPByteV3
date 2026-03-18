import { getSupabase } from "../../supabase.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { Microsoft365Connector } from "@workspace/shared/lib/connectors/Microsoft365Connector";
import type {
  LinkerContract,
  LinkerDependency,
} from "@workspace/core/types/contracts/linker";
import { IngestType } from "@workspace/core/types/ingest";
import Encryption from "@workspace/shared/lib/utils/encryption.js";
import { SophosPartnerConnector } from "@workspace/shared/lib/connectors/SophosConnector.js";

export class SophosSiteEndpointsLinker implements LinkerContract {
  readonly linkerType = "sophos-site-endpoints";
  readonly dependencies: LinkerDependency[] = [
    { integrationId: "sophos-partner", ingestType: IngestType.SophosSites },
    { integrationId: "sophos-partner", ingestType: IngestType.SophosEndpoints },
  ];

  async run(scope: {
    tenantId: string;
    siteId?: string;
    linkId: string;
  }): Promise<void> {
    const { tenantId, linkId } = scope;
    const supabase = getSupabase();

    const syncStartTime = new Date().toISOString();

    const { data: linkRow } = await supabase
      .from("integration_links")
      .select("id, external_id")
      .eq("id", linkId)
      .single();

    if (!linkRow) {
      throw new Error("Failed to fetch integration_links row");
    }

    // Load identities scoped to this link
    const { data: siteRow } = await supabase
      .schema("vendors")
      .from("sophos_sites")
      .select("id, external_id")
      .eq("tenant_id", tenantId)
      .eq("external_id", linkRow.external_id)
      .single();

    if (!siteRow) {
      throw new Error(
        `Failed to fetch sophos_site for external_id: ${linkRow.external_id}`,
      );
    }

    // Load roles scoped to this link
    const { data: endpointRows } = await supabase
      .schema("vendors")
      .from("sophos_endpoints")
      .select("id, external_id")
      .eq("tenant_id", tenantId)
      .eq("link_id", linkId);

    const rows: any[] = [];
    for (const role of endpointRows ?? []) {
      rows.push({
        tenant_id: tenantId,
        link_id: linkId,
        site_id: siteRow?.id,
        endpoint_id: role.id,
        last_seen_at: syncStartTime,
      });
    }

    if (rows.length > 0) {
      Logger.info({
        module: "SophosSiteEndpointsLinker",
        context: "run",
        message: `Upserting ${rows.length} site > endpoint relationships for link ${linkId}`,
      });

      const { error } = await supabase
        .schema("vendors")
        .from("sophos_site_endpoints")
        .upsert(rows, { onConflict: "tenant_id,site_id,endpoint_id" });

      if (error) {
        Logger.error({
          module: "SophosSiteEndpointsLinker",
          context: "run",
          message: `Failed to upsert site > endpoint relationships: ${error.message}`,
        });
      }
    }

    // Prune stale role memberships for this link
    await supabase
      .schema("vendors")
      .from("sophos_site_endpoints")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("link_id", linkId)
      .lt("last_seen_at", syncStartTime);
  }
}
