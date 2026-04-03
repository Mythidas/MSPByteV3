import { Logger } from "@workspace/shared/lib/utils/logger";
import { SophosPartnerConnector } from "@workspace/shared/lib/integrations/sophos-partner/connector";
import { batchAll } from "@workspace/shared/lib/utils/async.js";
import {
  AdapterContract,
  UpsertPayload,
} from "@workspace/shared/types/jobs/contracts/adapter.js";
import { JobContext } from "@workspace/shared/types/jobs/job.js";
import { IngestType as IT } from "@workspace/shared/types/jobs/ingest.js";
import { getSupabase } from "../../supabase.js";

const MAX_PREVIOUS_CODES = 10;

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

    const connector = new SophosPartnerConnector(
      { clientId, clientSecret },
      tenantId,
    );

    if (ingestType === IT.SophosEndpoints) {
      if (!ctx.linkId) {
        throw new Error("SophosPartnerAdapter: endpoints job requires link_id");
      }

      const sophosApiHost =
        ctx.metadata?.apiHost && typeof ctx.metadata?.apiHost === "string"
          ? ctx.metadata?.apiHost
          : undefined;
      const sophosTenantId =
        ctx.metadata?.externalId && typeof ctx.metadata?.externalId === "string"
          ? ctx.metadata?.externalId
          : undefined;
      if (!sophosTenantId || !sophosApiHost) {
        throw new Error(
          `SophosPartnerAdapter: link ${ctx.linkId} has no external_id or apiHost`,
        );
      }

      return this.fetchEndpoints(
        connector,
        sophosTenantId,
        sophosApiHost,
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

  private async fetchEndpoints(
    connector: SophosPartnerConnector,
    sophosTenantId: string,
    sophosApiHost: string,
    linkId: string,
    siteId: string | null,
    tenantId: string,
    now: string,
  ): Promise<UpsertPayload[]> {
    const existingQuery = getSupabase()
      .schema("vendors")
      .from("sophos_endpoints")
      .select("external_id, current_code, previous_codes")
      .eq("tenant_id", tenantId)
      .eq("link_id", linkId);

    const [data, existingRows] = await Promise.all([
      connector.endpoint.endpoints.list({
        apiHost: sophosApiHost,
        tenantId: sophosTenantId,
      }),
      existingQuery,
    ]);

    Logger.info({
      module: "SophosPartnerAdapter",
      context: "fetchEndpoints",
      message: `Fetched ${data.length} endpoints for Sophos tenant ${sophosTenantId}`,
    });

    const existingMap = new Map(
      (existingRows.data ?? []).map((r) => [r.external_id, r]),
    );

    const TAMPER_BATCH_SIZE = 10;
    const rows: ReturnType<typeof buildRow>[] = [];

    function buildRow(
      ep: (typeof data)[number],
      codes: Awaited<
        ReturnType<typeof connector.endpoint.endpoints.tamper_protection.get>
      >,
    ) {
      const newCurrent = codes.password;
      const existing = existingMap.get(ep.id);
      const existingCurrent = existing?.current_code ?? null;
      const existingPrevious: string[] = existing?.previous_codes ?? [];
      const fromSophos = (codes.previousPasswords ?? []).map((p) => p.password);

      const previousCodes = [
        ...new Set([
          ...(existingCurrent && existingCurrent !== newCurrent
            ? [existingCurrent]
            : []),
          ...fromSophos,
          ...existingPrevious,
        ]),
      ]
        .filter((c) => c !== newCurrent)
        .slice(0, MAX_PREVIOUS_CODES);

      return {
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
        current_code: newCurrent,
        previous_codes: previousCodes,
      };
    }

    rows.push(
      ...(await batchAll(data, TAMPER_BATCH_SIZE, async (ep) => {
        const codes = await connector.endpoint.endpoints.tamper_protection.get(
          { apiHost: sophosApiHost, tenantId: sophosTenantId },
          ep.id,
        );
        return buildRow(ep, codes);
      })),
    );

    return [
      {
        table: "sophos_endpoints",
        rows,
        onConflict: "tenant_id,link_id,external_id",
      },
    ];
  }
}
