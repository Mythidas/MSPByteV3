import { getSupabase } from "../../supabase.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { SophosPartnerConnector } from "@workspace/shared/lib/connectors/SophosConnector";
import type {
  AdapterContract,
  UpsertPayload,
} from "@workspace/core/types/contracts/adapter";
import type { JobContext } from "@workspace/core/types/job";
import { IngestType as IT } from "@workspace/core/types/ingest";

export class SophosPartnerAdapter implements AdapterContract {
  readonly integrationId = "sophos-partner";

  async fetch(ctx: JobContext): Promise<UpsertPayload[]> {
    const { tenantId, ingestType } = ctx;
    const now = new Date().toISOString();

    const clientId = ctx.credentials?.clientId;
    const clientSecret = ctx.credentials?.clientSecret;

    if (!clientId || !clientSecret) {
      throw new Error(
        "SophosPartnerAdapter: clientId and clientSecret are required",
      );
    }

    const connector = new SophosPartnerConnector({ clientId, clientSecret });

    if (ingestType === IT.SophosSites) {
      return this.fetchSites(connector, tenantId, now);
    } else if (ingestType === IT.SophosEndpoints) {
      if (!ctx.linkId) {
        throw new Error("SophosPartnerAdapter: endpoints job requires link_id");
      }

      const sophosTenantId = ctx.metadata?.externalId as string | undefined;
      if (!sophosTenantId) {
        throw new Error(
          `SophosPartnerAdapter: link ${ctx.linkId} has no external_id`,
        );
      }

      return this.fetchEndpoints(
        connector,
        sophosTenantId,
        ctx.linkId,
        ctx.siteId ?? null,
        tenantId,
        now,
      );
    } else {
      throw new Error(
        `SophosPartnerAdapter: unknown ingestType "${ingestType}"`,
      );
    }
  }

  private async fetchSites(
    connector: SophosPartnerConnector,
    tenantId: string,
    now: string,
  ): Promise<UpsertPayload[]> {
    const { data: sophosTenantsData, error: tenantsError } =
      await connector.getTenants();
    if (tenantsError || !sophosTenantsData) {
      throw new Error(
        `SophosPartnerAdapter: getTenants failed: ${tenantsError?.message}`,
      );
    }

    Logger.info({
      module: "SophosPartnerAdapter",
      context: "fetchSites",
      message: `Fetched ${sophosTenantsData.length} sites`,
    });

    return [
      {
        table: "sophos_sites",
        rows: sophosTenantsData.map((t) => ({
          tenant_id: tenantId,
          external_id: t.id,
          last_seen_at: now,
          created_at: now,
          updated_at: now,
          name: t.name ?? null,
          status: t.status ?? null,
          api_host: t.apiHost ?? null,
          products: (t.products ?? []).map((p) => p.code),
          show_as_name: t.showAs ?? null,
        })),
        onConflict: "tenant_id,external_id",
      },
    ];
  }

  private async fetchEndpoints(
    connector: SophosPartnerConnector,
    sophosTenantId: string,
    linkId: string,
    siteId: string | null,
    tenantId: string,
    now: string,
  ): Promise<UpsertPayload[]> {
    const supabase = getSupabase();

    const { data: sophossite, error: siteError } = await (
      supabase.schema("vendors").from("sophos_sites" as any) as any
    )
      .select("api_host")
      .eq("external_id", sophosTenantId)
      .eq("tenant_id", tenantId)
      .single();

    if (siteError || !sophossite) {
      throw new Error(
        `SophosPartnerAdapter: failed to load sophos_sites for link ${linkId}: ${siteError?.message}`,
      );
    }

    const apiHost = (sophossite as any).api_host as string;

    const { data, error } = await connector.getEndpoints({
      apiHost,
      tenantId: sophosTenantId,
    });

    if (error || !data) {
      throw new Error(
        `SophosPartnerAdapter: getEndpoints failed: ${error?.message}`,
      );
    }

    Logger.info({
      module: "SophosPartnerAdapter",
      context: "fetchEndpoints",
      message: `Fetched ${data.length} endpoints for Sophos tenant ${sophosTenantId}`,
    });

    const rows: Record<string, unknown>[] = data.map((ep) => ({
      tenant_id: tenantId,
      external_id: ep.id,
      link_id: linkId,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
      site_id: siteId,
      hostname: ep.hostname ?? null,
      online: ep.online ?? false,
      health: ep.health?.overall ?? null,
      lockdown: ep.lockdown?.status ?? null,
      platform: ep.os?.platform ?? null,
      os_name: ep.os?.name ?? null,
      type: ep.type ?? null,
      has_mdr: ep.mdrManaged ?? false,
      needs_upgrade: ep.packages?.protection?.status === "upgradable",
      tamper_protection_enabled: ep.tamperProtectionEnabled ?? false,
      last_heartbeat_at: ep.lastSeenAt ?? null,
    }));

    return [
      {
        table: "sophos_endpoints",
        rows,
        onConflict: "tenant_id,link_id,external_id",
      },
    ];
  }
}
