import { Logger } from "@workspace/shared/lib/utils/logger";
import { ConfigError } from "@workspace/shared/lib/errors.js";
import { DattoRMMConnector } from "@workspace/shared/lib/integrations/dattormm/connector";
import {
  AdapterContract,
  UpsertPayload,
} from "@workspace/shared/types/jobs/contracts/adapter.js";
import type { JobContext } from "@workspace/shared/types/jobs/job.js";
import { IngestType as IT } from "@workspace/shared/types/jobs/ingest.js";
import { TablesInsert } from "@workspace/shared/types/database";

export class DattoRMMAdapter implements AdapterContract {
  readonly integrationId = "dattormm";

  async fetch(ctx: JobContext): Promise<UpsertPayload[]> {
    const { tenantId, ingestType } = ctx;
    const now = new Date().toISOString();

    const url = ctx.credentials?.url;
    const apiKey = ctx.credentials?.apiKey;
    const apiSecretKey = ctx.credentials?.apiSecretKey;

    if (!url || !apiKey || !apiSecretKey) {
      throw new ConfigError(
        "DattoRMMAdapter: url, apiKey, and apiSecretKey are required",
        { integrationId: this.integrationId, tenantId: ctx.tenantId },
      );
    }

    const connector = new DattoRMMConnector(
      { url, apiKey, apiSecretKey },
      tenantId,
    );

    if (ingestType === IT.DattoEndpoints) {
      if (!ctx.linkId) {
        throw new ConfigError("DattoRMMAdapter: endpoints job requires link_id", {
          integrationId: this.integrationId, tenantId: ctx.tenantId,
        });
      }

      const siteUid = String(ctx.metadata?.externalId);
      if (!ctx.metadata?.externalId) {
        throw new ConfigError(
          `DattoRMMAdapter: link ${ctx.linkId} has no external_id (Datto site UID)`,
          { integrationId: this.integrationId, tenantId: ctx.tenantId, linkId: ctx.linkId },
        );
      }

      return this.fetchEndpoints(
        connector,
        siteUid,
        ctx.linkId,
        ctx.siteId ?? null,
        tenantId,
        now,
        ctx.trackSpan,
      );
    } else {
      throw new ConfigError(`DattoRMMAdapter: unknown ingestType "${ingestType}"`, {
        integrationId: this.integrationId, tenantId: ctx.tenantId, ingestType,
      });
    }
  }

  private async fetchEndpoints(
    connector: DattoRMMConnector,
    siteUid: string,
    linkId: string,
    siteId: string | null,
    tenantId: string,
    now: string,
    trackSpan?: JobContext["trackSpan"],
  ): Promise<UpsertPayload[]> {
    const span = trackSpan ?? (<T>(_n: string, f: () => Promise<T>) => f());
    const data = await span("datto:list_endpoints", () => connector.site.devices.list(siteUid));

    Logger.info({
      module: "DattoRMMAdapter",
      context: "fetchEndpoints",
      message: `Fetched ${data.length} devices for site uid ${siteUid}`,
    });

    const rows: Record<string, unknown>[] = data.map(
      (device) =>
        ({
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
        }) satisfies TablesInsert<"vendors", "datto_endpoints">,
    );

    return [
      {
        table: "datto_endpoints",
        rows,
        onConflict: "tenant_id,link_id,external_id",
      },
    ];
  }
}
