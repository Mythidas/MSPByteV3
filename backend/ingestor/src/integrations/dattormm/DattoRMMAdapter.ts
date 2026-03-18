import { getSupabase } from "../../supabase.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { DattoRMMConnector } from "@workspace/shared/lib/connectors/DattoRMMConnector";
import type {
  AdapterContract,
  UpsertPayload,
} from "@workspace/core/types/contracts/adapter";
import type { JobContext } from "@workspace/core/types/job";
import { IngestType as IT } from "@workspace/core/types/ingest";

export class DattoRMMAdapter implements AdapterContract {
  readonly integrationId = "dattormm";

  async fetch(ctx: JobContext): Promise<UpsertPayload[]> {
    const { tenantId, ingestType } = ctx;
    const now = new Date().toISOString();

    const url = ctx.credentials?.url;
    const apiKey = ctx.credentials?.apiKey;
    const apiSecretKey = ctx.credentials?.apiSecretKey;

    if (!url || !apiKey || !apiSecretKey) {
      throw new Error(
        "DattoRMMAdapter: url, apiKey, and apiSecretKey are required",
      );
    }

    const connector = new DattoRMMConnector({ url, apiKey, apiSecretKey });

    if (ingestType === IT.DattoSites) {
      return this.fetchSites(connector, tenantId, now);
    } else if (ingestType === IT.DattoEndpoints) {
      if (!ctx.linkId) {
        throw new Error("DattoRMMAdapter: endpoints job requires link_id");
      }

      const siteUid = ctx.metadata?.externalId as string | undefined;
      if (!siteUid) {
        throw new Error(
          `DattoRMMAdapter: link ${ctx.linkId} has no external_id (Datto site UID)`,
        );
      }

      return this.fetchEndpoints(
        connector,
        siteUid,
        ctx.linkId,
        ctx.siteId ?? null,
        tenantId,
        now,
      );
    } else {
      throw new Error(`DattoRMMAdapter: unknown ingestType "${ingestType}"`);
    }
  }

  private async fetchSites(
    connector: DattoRMMConnector,
    tenantId: string,
    now: string,
  ): Promise<UpsertPayload[]> {
    const supabase = getSupabase();

    const { data: links, error: linksError } = await supabase
      .from("integration_links")
      .select("id, external_id, site_id")
      .eq("integration_id", "dattormm")
      .eq("tenant_id", tenantId)
      .not("site_id", "is", null);

    if (linksError) {
      throw new Error(
        `DattoRMMAdapter: failed to load integration_links: ${linksError.message}`,
      );
    }

    if (!links || links.length === 0) return [];

    const { data: sites, error: sitesError } = await connector.getSites();

    if (sitesError || !sites) {
      throw new Error(
        `DattoRMMAdapter: getSites failed: ${sitesError?.message}`,
      );
    }

    const sitesByUid = new Map(sites.map((s) => [s.uid, s]));
    const rows: Record<string, unknown>[] = [];

    for (const link of links) {
      const site = sitesByUid.get(link.external_id ?? "");
      if (!site) {
        Logger.warn({
          module: "DattoRMMAdapter",
          context: "fetchSites",
          message: `Datto site uid ${link.external_id} not found in API response (link ${link.id})`,
        });
        continue;
      }

      rows.push({
        tenant_id: tenantId,
        external_id: site.id,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
        site_id: link.site_id,
        uid: site.uid,
        name: site.name,
        status: "active",
        site_variables: site.siteVariables ?? {},
      });
    }

    Logger.info({
      module: "DattoRMMAdapter",
      context: "fetchSites",
      message: `Fetched ${rows.length} sites for tenant ${tenantId}`,
    });

    return [
      { table: "datto_sites", rows, onConflict: "tenant_id,external_id" },
    ];
  }

  private async fetchEndpoints(
    connector: DattoRMMConnector,
    siteUid: string,
    linkId: string,
    siteId: string | null,
    tenantId: string,
    now: string,
  ): Promise<UpsertPayload[]> {
    console.log(siteUid);
    const { data, error } = await connector.getDevices(siteUid);

    if (error || !data) {
      throw new Error(`DattoRMMAdapter: getDevices failed: ${error?.message}`);
    }

    Logger.info({
      module: "DattoRMMAdapter",
      context: "fetchEndpoints",
      message: `Fetched ${data.length} devices for site uid ${siteUid}`,
    });

    const rows: Record<string, unknown>[] = data.map((device) => ({
      tenant_id: tenantId,
      external_id: device.uid,
      link_id: linkId,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
      site_id: siteId,
      hostname: device.hostname,
      online: device.online,
      category: device.deviceType.category,
      os: device.operatingSystem || "",
      ip_address: device.intIpAddress,
      ext_address: device.extIpAddress || "",
      last_reboot_at: new Date(device.lastReboot || 0).toISOString(),
      last_heartbeat_at: device.lastSeen
        ? new Date(device.lastSeen).toISOString()
        : null,
      udfs: device.udf,
    }));

    return [
      {
        table: "datto_endpoints",
        rows,
        onConflict: "tenant_id,link_id,external_id",
      },
    ];
  }
}
