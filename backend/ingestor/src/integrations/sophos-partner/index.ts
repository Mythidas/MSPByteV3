import { registry } from "../../registry.js";
import { getSupabase } from "../../supabase.js";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { SophosPartnerAdapter } from "./SophosPartnerAdapter.js";
import type { UpsertPayload } from "@workspace/core/types/contracts/adapter";
import type { IngestJobData } from "../../types.js";
import { IngestType as IT } from "@workspace/core/types/ingest";
import { SophosSiteEndpointsLinker } from "./SophosSiteEndpointLinker.js";

registry.register({
  integrationId: "sophos-partner",
  adapter: new SophosPartnerAdapter(),
  linkers: [new SophosSiteEndpointsLinker()],
  enrichments: [],

  // Fan-out: after tenant-wide sites job, create one endpoints job per link that was processed
  fanOut: async (
    _payloads: UpsertPayload[],
    job: IngestJobData,
  ): Promise<void> => {
    if (job.ingestType !== IT.SophosSites) return;

    const supabase = getSupabase();

    const { data: links, error: linksError } = await supabase
      .from("integration_links")
      .select("id, site_id")
      .eq("integration_id", "sophos-partner")
      .eq("tenant_id", job.tenantId)
      .not("site_id", "is", null);

    if (linksError) {
      Logger.error({
        module: "SophosPartnerFanOut",
        context: "fanOut",
        message: `Error fetching integration_links for fan-out: ${linksError.message}`,
      });
      return;
    }

    if (!links || links.length === 0) return;

    for (const link of links) {
      const linkId = link.id;
      const siteId = link.site_id ?? null;

      const { count, error: countError } = await (
        supabase.from("ingest_jobs" as any) as any
      )
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", job.tenantId)
        .eq("link_id", linkId)
        .eq("ingest_type", IT.SophosEndpoints)
        .in("status", ["pending", "queued", "running"]);

      if (countError) {
        Logger.error({
          module: "SophosPartnerFanOut",
          context: "fanOut",
          message: `Error checking endpoints job for link ${linkId}: ${countError.message}`,
        });
        continue;
      }

      if (count && count > 0) continue;

      const { error: insertError } = await (
        supabase.from("ingest_jobs" as any) as any
      ).insert({
        tenant_id: job.tenantId,
        site_id: siteId,
        link_id: linkId,
        integration_id: "sophos-partner",
        ingest_type: IT.SophosEndpoints,
        status: "pending",
        priority: 3,
        trigger: "scheduled",
        scheduled_for: null,
      });

      if (insertError) {
        Logger.error({
          module: "SophosPartnerFanOut",
          context: "fanOut",
          message: `Error creating endpoints job for link ${linkId}: ${insertError.message}`,
        });
        continue;
      }

      Logger.info({
        module: "SophosPartnerFanOut",
        context: "fanOut",
        message: `Created endpoints ingest_job for link ${linkId}`,
      });
    }
  },
});
