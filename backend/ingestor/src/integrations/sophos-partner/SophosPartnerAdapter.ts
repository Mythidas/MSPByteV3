import { getSupabase } from "../../supabase.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { PipelineTracker } from "../../lib/tracker.js";
import { SophosPartnerConnector } from "@workspace/shared/lib/connectors/SophosConnector";
import type { IngestJobData } from "../../types.js";
import type { RawSophosEntity } from "./types.js";
import type { IAdapter } from "../../interfaces.js";
import Encryption from "@workspace/shared/lib/utils/encryption.js";

export class SophosPartnerAdapter implements IAdapter<RawSophosEntity> {
  async fetch(
    job: IngestJobData,
    tracker: PipelineTracker,
  ): Promise<RawSophosEntity[]> {
    const supabase = getSupabase();

    // Load integration config (clientId, clientSecret)
    tracker.trackQuery();
    const { data: integration } = await supabase
      .from("integrations")
      .select("config")
      .eq("id", "sophos-partner")
      .eq("tenant_id", job.tenantId)
      .single();

    const config = (integration?.config as any) ?? {};
    const clientId = config?.clientId as string | undefined;
    const clientSecret = (await Encryption.decrypt(
      config?.clientSecret || "",
      process.env.ENCRYPTION_KEY!,
    )) as string | undefined;

    if (!clientId || !clientSecret) {
      throw new Error(
        "SophosPartnerAdapter: clientId and clientSecret are required in integration config",
      );
    }

    const connector = new SophosPartnerConnector({ clientId, clientSecret });

    if (job.ingestType === "sites") {
      // Tenant-wide: load all site-scoped links and call getTenants() once
      return this.fetchSites(connector, job.tenantId, tracker);
    } else if (job.ingestType === "endpoints") {
      if (!job.linkId) {
        throw new Error("SophosPartnerAdapter: endpoints job requires link_id");
      }

      // Load integration_links row to get external_id (Sophos tenant ID) + site_id
      tracker.trackQuery();
      const { data: link, error: linkError } = await supabase
        .from("integration_links")
        .select("id, external_id, site_id")
        .eq("id", job.linkId)
        .eq("tenant_id", job.tenantId)
        .single();

      if (linkError || !link) {
        throw new Error(
          `SophosPartnerAdapter: failed to load integration_links: ${linkError?.message}`,
        );
      }

      if (!link.external_id) {
        throw new Error(
          `SophosPartnerAdapter: link ${job.linkId} has no external_id (Sophos tenant ID)`,
        );
      }

      return this.fetchEndpoints(
        connector,
        link.external_id,
        job.linkId,
        link.site_id,
        job.tenantId,
        tracker,
      );
    } else {
      throw new Error(
        `SophosPartnerAdapter: unknown ingestType "${job.ingestType}"`,
      );
    }
  }

  private async fetchSites(
    connector: SophosPartnerConnector,
    tenantId: string,
    tracker: PipelineTracker,
  ): Promise<RawSophosEntity[]> {
    const supabase = getSupabase();

    // Load all site-scoped links for this tenant
    tracker.trackQuery();
    const { data: links, error: linksError } = await supabase
      .from("integration_links")
      .select("id, external_id, site_id")
      .eq("integration_id", "sophos-partner")
      .eq("tenant_id", tenantId)
      .not("site_id", "is", null);

    if (linksError) {
      throw new Error(
        `SophosPartnerAdapter: failed to load integration_links: ${linksError.message}`,
      );
    }

    if (!links || links.length === 0) return [];

    // Call getTenants() once for all links
    const { data: sophosTenantsData, error: tenantsError } = await tracker.trackSpan(
      "adapter:api:getTenants",
      () => connector.getTenants(),
    );

    if (tenantsError || !sophosTenantsData) {
      throw new Error(
        `SophosPartnerAdapter: getTenants failed: ${tenantsError?.message}`,
      );
    }

    const sophosById = new Map(sophosTenantsData.map((t) => [t.id, t]));
    const results: RawSophosEntity[] = [];

    for (const link of links) {
      const sophosTenant = sophosById.get(link.external_id ?? "");
      if (!sophosTenant) {
        Logger.warn({
          module: "SophosPartnerAdapter",
          context: "fetchSites",
          message: `Sophos tenant ${link.external_id} not found in partner tenant list (link ${link.id})`,
        });
        continue;
      }

      results.push({
        type: "sites",
        externalId: sophosTenant.id,
        linkId: link.id,
        siteId: link.site_id,
        data: sophosTenant,
      });
    }

    Logger.info({
      module: "SophosPartnerAdapter",
      context: "fetchSites",
      message: `Fetched ${results.length} sites for tenant ${tenantId} (${links.length} links)`,
    });

    return results;
  }

  private async fetchEndpoints(
    connector: SophosPartnerConnector,
    sophosTenantId: string,
    linkId: string,
    siteId: string | null,
    tenantId: string,
    tracker: PipelineTracker,
  ): Promise<RawSophosEntity[]> {
    const supabase = getSupabase();

    // Load the sophos_sites row to get api_host
    tracker.trackQuery();
    const { data: sophossite, error: siteError } = await (
      supabase.schema("vendors").from("sophos_sites" as any) as any
    )
      .select("api_host")
      .eq("link_id", linkId)
      .eq("tenant_id", tenantId)
      .single();

    if (siteError || !sophossite) {
      throw new Error(
        `SophosPartnerAdapter: failed to load sophos_sites for link ${linkId}: ${siteError?.message}`,
      );
    }

    const apiHost = (sophossite as any).api_host as string;

    const { data, error } = await tracker.trackSpan(
      "adapter:api:getEndpoints",
      () =>
        connector.getEndpoints({
          apiHost,
          tenantId: sophosTenantId,
          tenantName: "",
        }),
    );

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

    return data.map((ep) => ({
      type: "endpoints" as const,
      externalId: ep.id,
      linkId,
      siteId,
      data: ep,
    }));
  }
}
