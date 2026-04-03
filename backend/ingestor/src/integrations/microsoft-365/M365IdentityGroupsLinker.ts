import { getSupabase } from "../../supabase.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { Microsoft365Connector } from "@workspace/shared/lib/integrations/microsoft-365/connector";
import {
  LinkerContract,
  LinkerDependency,
} from "@workspace/shared/types/jobs/contracts/linker.js";
import { IngestType } from "@workspace/shared/types/jobs/ingest.js";
import { isRecord } from "@workspace/shared/lib/utils/validators.js";

export class M365IdentityGroupsLinker implements LinkerContract {
  readonly linkerType = "m365-identity-groups";
  readonly dependencies: LinkerDependency[] = [
    { integrationId: "microsoft-365", ingestType: IngestType.M365Identities },
    { integrationId: "microsoft-365", ingestType: IngestType.M365Groups },
  ];

  async run(scope: {
    tenantId: string;
    siteId?: string;
    linkId: string;
  }): Promise<void> {
    const { tenantId, linkId } = scope;
    const supabase = getSupabase();

    // Load integration config for MSP tenant ID
    const { data: integration } = await supabase
      .from("integrations")
      .select("config")
      .eq("id", "microsoft-365")
      .eq("tenant_id", tenantId)
      .single();

    const config = isRecord(integration?.config) ? integration.config : {};
    const mspTenantId =
      typeof config?.tenantId === "string" ? config.tenantId : "";

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      Logger.warn({
        module: "M365IdentityGroupsLinker",
        context: "run",
        message:
          "MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET not set — skipping linking",
      });
      return;
    }

    // Load the link record to get the GDAP tenant ID
    const { data: linkRecord } = await supabase
      .from("integration_links")
      .select("id, external_id")
      .eq("id", linkId)
      .single();

    const gdapTenantId = linkRecord?.external_id ?? "";
    if (!gdapTenantId) {
      Logger.warn({
        module: "M365IdentityGroupsLinker",
        context: "run",
        message: `Missing external_id on link ${linkId}`,
      });
      return;
    }

    const connector = new Microsoft365Connector(
      {
        tenantId: mspTenantId,
        clientId,
        clientSecret,
      },
      tenantId,
      gdapTenantId,
    );

    const syncStartTime = new Date().toISOString();

    // Load identities scoped to this link
    const { data: identityRows } = await supabase
      .schema("vendors")
      .from("m365_identities")
      .select("id, external_id")
      .eq("tenant_id", tenantId)
      .eq("link_id", linkId);

    const identityMap = new Map<string, string>(
      (identityRows ?? []).map((r) => [r.external_id, r.id]),
    );

    // Load groups scoped to this link
    const { data: groupRows } = await supabase
      .schema("vendors")
      .from("m365_groups")
      .select("id, external_id")
      .eq("tenant_id", tenantId)
      .eq("link_id", linkId);

    const rows = [];
    for (const group of groupRows ?? []) {
      let members: Record<string, unknown>[];
      try {
        members = (await connector.groups.members(group.external_id, true)).map(
          (v) => (isRecord(v) ? v : {}),
        );
      } catch (err) {
        Logger.warn({
          module: "M365IdentityGroupsLinker",
          context: "run",
          message: `Failed to get members for group ${group.external_id} link ${linkId}: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }

      for (const member of members) {
        const id = typeof member.id === "string" ? member.id : "";
        const identityId = identityMap.get(id);
        if (!identityId) continue;

        rows.push({
          tenant_id: tenantId,
          link_id: linkId,
          identity_id: identityId,
          group_id: group.id,
          last_seen_at: syncStartTime,
        });
      }
    }

    if (rows.length > 0) {
      Logger.info({
        module: "M365IdentityGroupsLinker",
        context: "run",
        message: `Upserting ${rows.length} identity > group relationships for link ${linkId}`,
      });

      const { error } = await supabase
        .schema("vendors")
        .from("m365_identity_groups")
        .upsert(rows, { onConflict: "tenant_id,identity_id,group_id" });

      if (error) {
        Logger.error({
          module: "M365IdentityGroupsLinker",
          context: "run",
          message: `Failed to upsert identity > group relationships: ${error.message}`,
        });
      }
    }

    // Prune stale memberships for this link
    await supabase
      .schema("vendors")
      .from("m365_identity_groups")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("link_id", linkId)
      .lt("last_seen_at", syncStartTime);
  }
}
