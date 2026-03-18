import { getSupabase } from "../../supabase.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { CoveConnector } from "@workspace/shared/lib/connectors/CoveConnector";
import type { AdapterContract, UpsertPayload } from "@workspace/core/types/contracts/adapter";
import type { JobContext } from "@workspace/core/types/job";
import { IngestType as IT } from "@workspace/core/types/ingest";

export class CoveAdapter implements AdapterContract {
  readonly integrationId = "cove";

  async fetch(ctx: JobContext): Promise<UpsertPayload[]> {
    const { tenantId, ingestType } = ctx;
    const now = new Date().toISOString();

    const server = ctx.credentials?.server;
    const clientId = ctx.credentials?.clientId;
    const partnerIdRaw = ctx.credentials?.partnerId;
    const partnerId = partnerIdRaw ? parseInt(partnerIdRaw, 10) : undefined;
    const clientSecret = ctx.credentials?.clientSecret;

    if (!server || !clientId || !clientSecret || !partnerId) {
      throw new Error("CoveAdapter: server, clientId, clientSecret, and partnerId are required");
    }

    const connector = new CoveConnector({ server, clientId, clientSecret, partnerId });

    if (ingestType === IT.CoveSites) {
      return this.fetchSites(connector, tenantId, now);
    } else if (ingestType === IT.CoveEndpoints) {
      if (!ctx.linkId) {
        throw new Error("CoveAdapter: endpoints job requires link_id");
      }

      const externalId = ctx.metadata?.externalId as string | undefined;
      if (!externalId) {
        throw new Error(`CoveAdapter: link ${ctx.linkId} has no external_id (Cove partner ID)`);
      }

      return this.fetchEndpoints(connector, externalId, ctx.linkId, ctx.siteId ?? null, tenantId, now);
    } else {
      throw new Error(`CoveAdapter: unknown ingestType "${ingestType}"`);
    }
  }

  private async fetchSites(
    connector: CoveConnector,
    tenantId: string,
    now: string,
  ): Promise<UpsertPayload[]> {
    const supabase = getSupabase();

    const { data: links, error: linksError } = await supabase
      .from("integration_links")
      .select("id, external_id, site_id")
      .eq("integration_id", "cove")
      .eq("tenant_id", tenantId)
      .not("site_id", "is", null);

    if (linksError) {
      throw new Error(`CoveAdapter: failed to load integration_links: ${linksError.message}`);
    }

    if (!links || links.length === 0) return [];

    const { data: customers, error: customersError } = await connector.getCustomers();

    if (customersError || !customers) {
      throw new Error(`CoveAdapter: getCustomers failed: ${customersError?.message}`);
    }

    const endCustomers = customers.filter((c) => c.Info.Level === "EndCustomer");
    const partnersById = new Map(endCustomers.map((c) => [c.Info.Id.toString(), c]));
    const rows: Record<string, unknown>[] = [];

    for (const link of links) {
      const partner = partnersById.get(link.external_id ?? "");
      if (!partner) {
        Logger.warn({
          module: "CoveAdapter",
          context: "fetchSites",
          message: `Cove partner ${link.external_id} not found in customer list (link ${link.id})`,
        });
        continue;
      }

      rows.push({
        tenant_id: tenantId,
        external_id: partner.Info.Id.toString(),
        last_seen_at: now,
        created_at: now,
        updated_at: now,
        site_id: link.site_id,
        uid: partner.Info.Uid,
        name: partner.Info.Name,
      });
    }

    Logger.info({
      module: "CoveAdapter",
      context: "fetchSites",
      message: `Fetched ${rows.length} sites for tenant ${tenantId}`,
    });

    return [{ table: "cove_sites", rows, onConflict: "tenant_id,external_id" }];
  }

  private async fetchEndpoints(
    connector: CoveConnector,
    externalId: string,
    linkId: string,
    siteId: string | null,
    tenantId: string,
    now: string,
  ): Promise<UpsertPayload[]> {
    const { data: stats, error } = await connector.getAccountStatistics();

    if (error || !stats) {
      throw new Error(`CoveAdapter: getAccountStatistics failed: ${error?.message}`);
    }

    const partnerId = parseInt(externalId, 10);
    const filtered = stats.filter((s) => s.PartnerId === partnerId);

    Logger.info({
      module: "CoveAdapter",
      context: "fetchEndpoints",
      message: `Fetched ${filtered.length} endpoints for Cove partner ${externalId}`,
    });

    const rows: Record<string, unknown>[] = filtered.map((stat) => {
      const s = stat.Settings;
      return {
        tenant_id: tenantId,
        external_id: stat.AccountId.toString(),
        link_id: linkId,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
        site_id: siteId,
        endpoint_name: s.deviceName ?? "",
        hostname: s.computerName ?? "",
        status: convertStatus(s.backupStatus ?? ""),
        profile: s.profile ?? "",
        retention_policy: s.retentionPolicy ?? "",
        selected_size: parseInt(s.selectedSize) || 0,
        used_storage: parseInt(s.usedStorage) || 0,
        last_28_days: s.last28Days ?? "",
        lsv_status: s.lsvStatus ?? null,
        errors: parseInt(s.errors, 10) || 0,
        type: convertDeviceType(s.deviceType ?? ""),
        last_success_at: s.lastSuccessfulSession
          ? new Date(parseInt(s.lastSuccessfulSession) * 1000).toISOString()
          : null,
      };
    });

    return [{ table: "cove_endpoints", rows, onConflict: "tenant_id,link_id,external_id" }];
  }
}

function convertDeviceType(type: string): string {
  switch (type) {
    case "2":
      return "Server";
    case "1":
      return "Workstation";
    default:
      return "Unknown";
  }
}

function convertStatus(status: string): string {
  switch (status) {
    case "5":
      return "Completed";
    case "1":
      return "In Process";
    case "6":
      return "Interrupted";
    case "8":
      return "Completed with Errors";
    case "7":
      return "Not Started";
    case "2":
      return "Failed";
    default:
      return "Unknown";
  }
}
