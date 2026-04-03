import { getSupabase } from "../../supabase.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { Microsoft365Connector } from "@workspace/shared/lib/integrations/microsoft-365/connector";
import {
  LinkerContract,
  LinkerDependency,
} from "@workspace/shared/types/jobs/contracts/linker.js";
import { IngestType } from "@workspace/shared/types/jobs/ingest.js";
import { isRecord } from "@workspace/shared/lib/utils/validators.js";

export class M365IdentityRolesLinker implements LinkerContract {
  readonly linkerType = "m365-identity-roles";
  readonly dependencies: LinkerDependency[] = [
    { integrationId: "microsoft-365", ingestType: IngestType.M365Identities },
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
        module: "M365IdentityRolesLinker",
        context: "run",
        message:
          "MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET not set — skipping linking",
      });
      return;
    }

    const { data: linkRecord } = await supabase
      .from("integration_links")
      .select("id, external_id")
      .eq("id", linkId)
      .single();

    const gdapTenantId = linkRecord?.external_id ?? "";
    if (!gdapTenantId) {
      Logger.warn({
        module: "M365IdentityRolesLinker",
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

    // Load roles from global definitions (same across all tenants)
    const { data: roleRows } = await supabase
      .schema("definitions")
      .from("m365_roles")
      .select("id, template_id");

    const rows = [];
    for (const role of roleRows ?? []) {
      let members: Record<string, unknown>[];
      try {
        members = (
          await connector.directoryRoles.members(role.template_id, true)
        ).map((v) => (isRecord(v) ? v : {}));
      } catch (err) {
        Logger.warn({
          module: "M365IdentityRolesLinker",
          context: "run",
          message: `Failed to get members for role ${role.template_id} link ${linkId}: ${err instanceof Error ? err.message : String(err)}`,
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
          role_id: role.id,
          last_seen_at: syncStartTime,
        });
      }
    }

    if (rows.length > 0) {
      Logger.info({
        module: "M365IdentityRolesLinker",
        context: "run",
        message: `Upserting ${rows.length} identity > role relationships for link ${linkId}`,
      });

      const { error } = await supabase
        .schema("vendors")
        .from("m365_identity_roles")
        .upsert(rows, { onConflict: "tenant_id,identity_id,role_id" });

      if (error) {
        Logger.error({
          module: "M365IdentityRolesLinker",
          context: "run",
          message: `Failed to upsert identity > role relationships: ${error.message}`,
        });
      }
    }

    // Prune stale role memberships for this link
    await supabase
      .schema("vendors")
      .from("m365_identity_roles")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("link_id", linkId)
      .lt("last_seen_at", syncStartTime);
  }
}
