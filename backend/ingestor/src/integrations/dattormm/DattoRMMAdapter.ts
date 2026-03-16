import { getSupabase } from "../../supabase.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { PipelineTracker } from "../../lib/tracker.js";
import { DattoRMMConnector } from "@workspace/shared/lib/connectors/DattoRMMConnector";
import type { IngestJobData } from "../../types.js";
import type { RawDattoEntity } from "./types.js";
import type { IAdapter } from "../../interfaces.js";
import Encryption from "@workspace/shared/lib/utils/encryption.js";

export class DattoRMMAdapter implements IAdapter<RawDattoEntity> {
  async fetch(
    job: IngestJobData,
    tracker: PipelineTracker,
  ): Promise<RawDattoEntity[]> {
    const supabase = getSupabase();

    tracker.trackQuery();
    const { data: integration } = await supabase
      .from("integrations")
      .select("config")
      .eq("id", "dattormm")
      .eq("tenant_id", job.tenantId)
      .single();

    const config = (integration?.config as any) ?? {};
    const url = config?.url as string | undefined;
    const apiKey = config?.apiKey as string | undefined;
    const apiSecretKey = (await Encryption.decrypt(
      config?.apiSecretKey || "",
      process.env.ENCRYPTION_KEY!,
    )) as string;

    if (!url || !apiKey || !apiSecretKey) {
      throw new Error(
        "DattoRMMAdapter: url, apiKey, and apiSecretKey are required in integration config",
      );
    }

    const connector = new DattoRMMConnector({ url, apiKey, apiSecretKey });

    if (job.ingestType === "sites") {
      return this.fetchSites(connector, job.tenantId, tracker);
    } else if (job.ingestType === "endpoints") {
      if (!job.linkId) {
        throw new Error("DattoRMMAdapter: endpoints job requires link_id");
      }

      tracker.trackQuery();
      const { data: link, error: linkError } = await supabase
        .from("integration_links")
        .select("id, external_id, site_id")
        .eq("id", job.linkId)
        .eq("tenant_id", job.tenantId)
        .single();

      if (linkError || !link) {
        throw new Error(
          `DattoRMMAdapter: failed to load integration_links: ${linkError?.message}`,
        );
      }

      if (!link.external_id) {
        throw new Error(
          `DattoRMMAdapter: link ${job.linkId} has no external_id (Datto site UID)`,
        );
      }

      return this.fetchEndpoints(
        connector,
        link.external_id,
        job.linkId,
        link.site_id,
        tracker,
      );
    } else {
      throw new Error(
        `DattoRMMAdapter: unknown ingestType "${job.ingestType}"`,
      );
    }
  }

  private async fetchSites(
    connector: DattoRMMConnector,
    tenantId: string,
    tracker: PipelineTracker,
  ): Promise<RawDattoEntity[]> {
    const supabase = getSupabase();

    tracker.trackQuery();
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

    const { data: sites, error: sitesError } = await tracker.trackSpan(
      "adapter:api:getSites",
      () => connector.getSites(),
    );

    if (sitesError || !sites) {
      throw new Error(
        `DattoRMMAdapter: getSites failed: ${sitesError?.message}`,
      );
    }

    const sitesByUid = new Map(sites.map((s) => [s.uid, s]));
    const results: RawDattoEntity[] = [];

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

      results.push({
        type: "sites",
        externalId: site.id,
        linkId: link.id,
        siteId: link.site_id,
        data: site,
      });
    }

    Logger.info({
      module: "DattoRMMAdapter",
      context: "fetchSites",
      message: `Fetched ${results.length} sites for tenant ${tenantId} (${links.length} links)`,
    });

    return results;
  }

  private async fetchEndpoints(
    connector: DattoRMMConnector,
    siteUid: string,
    linkId: string,
    siteId: string | null,
    tracker: PipelineTracker,
  ): Promise<RawDattoEntity[]> {
    const { data, error } = await tracker.trackSpan(
      "adapter:api:getDevices",
      () => connector.getDevices(siteUid),
    );

    if (error || !data) {
      throw new Error(`DattoRMMAdapter: getDevices failed: ${error?.message}`);
    }

    Logger.info({
      module: "DattoRMMAdapter",
      context: "fetchEndpoints",
      message: `Fetched ${data.length} devices for site uid ${siteUid}`,
    });

    return data.map((device) => ({
      type: "endpoints" as const,
      externalId: device.uid,
      linkId,
      siteId,
      data: device,
    }));
  }
}
