import { Logger } from "@workspace/shared/lib/utils/logger";
import { ConfigError } from "@workspace/shared/lib/errors.js";
import { CoveConnector } from "@workspace/shared/lib/integrations/cove/connector";
import {
  AdapterContract,
  UpsertPayload,
} from "@workspace/shared/types/jobs/contracts/adapter.js";
import type { JobContext } from "@workspace/shared/types/jobs/job.js";
import { IngestType as IT } from "@workspace/shared/types/jobs/ingest.js";
import { isString } from "@workspace/shared/lib/utils/validators.js";
import { TablesInsert } from "@workspace/shared/types/database";

export class CoveAdapter implements AdapterContract {
  readonly integrationId = "cove";

  async fetch(ctx: JobContext): Promise<UpsertPayload[]> {
    const { tenantId, ingestType } = ctx;
    const now = new Date().toISOString();

    const server = ctx.credentials?.server;
    const clientId = ctx.credentials?.clientId;
    const partnerIdRaw = isString(ctx.credentials?.partnerId)
      ? ctx.credentials?.partnerId
      : undefined;
    const partnerId = partnerIdRaw ? parseInt(partnerIdRaw, 10) : undefined;
    const clientSecret = ctx.credentials?.clientSecret;

    if (!server || !clientId || !clientSecret || !partnerId) {
      throw new ConfigError(
        "CoveAdapter: server, clientId, clientSecret, and partnerId are required",
        { integrationId: this.integrationId, tenantId: ctx.tenantId },
      );
    }

    const connector = new CoveConnector(
      {
        server,
        clientId,
        clientSecret,
        partnerId: partnerId,
      },
      tenantId,
    );

    if (ingestType === IT.CoveEndpoints) {
      if (!ctx.linkId) {
        throw new ConfigError("CoveAdapter: endpoints job requires link_id", {
          integrationId: this.integrationId, tenantId: ctx.tenantId,
        });
      }

      const externalId = String(ctx.metadata?.externalId);
      if (!ctx.metadata?.externalId) {
        throw new ConfigError(
          `CoveAdapter: link ${ctx.linkId} has no external_id (Cove partner ID)`,
          { integrationId: this.integrationId, tenantId: ctx.tenantId, linkId: ctx.linkId },
        );
      }

      return this.fetchEndpoints(
        connector,
        externalId,
        ctx.linkId,
        ctx.siteId ?? null,
        tenantId,
        now,
        ctx.trackSpan,
      );
    } else {
      throw new ConfigError(`CoveAdapter: unknown ingestType "${ingestType}"`, {
        integrationId: this.integrationId, tenantId: ctx.tenantId, ingestType,
      });
    }
  }

  private async fetchEndpoints(
    connector: CoveConnector,
    externalId: string,
    linkId: string,
    siteId: string | null,
    tenantId: string,
    now: string,
    trackSpan?: JobContext["trackSpan"],
  ): Promise<UpsertPayload[]> {
    const span = trackSpan ?? (<T>(_n: string, f: () => Promise<T>) => f());
    const stats = await span("cove:list_endpoints", () => connector.account.statistics.list());
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
      } satisfies TablesInsert<"vendors", "cove_endpoints">;
    });

    return [
      {
        table: "cove_endpoints",
        rows,
        onConflict: "tenant_id,link_id,external_id",
      },
    ];
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
