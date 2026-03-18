import type { Job } from "bullmq";
import type { JobContext, JobResult } from "@workspace/core/types/job";
import { QueueNames } from "@workspace/core/config/queue-names";
import { Logger } from "@workspace/core/lib/utils/logger";
import { BaseWorker, type JobPayload } from "./base-worker";
import { supabase } from "../lib/supabase";

export class EnrichmentWorker extends BaseWorker {
  constructor() {
    super(QueueNames.IngestEnrichment, 5);
    Logger.info({ module: "ingestor", context: "EnrichmentWorker", message: `listening on ${QueueNames.IngestEnrichment}` });
  }

  async process(job: Job<JobPayload>, ctx: JobContext): Promise<JobResult> {
    const { enrichmentType, dependencies } = job.data;

    if (enrichmentType && dependencies && dependencies.length > 0) {
      // Fetch enrichment's own last_synced_at (keyed as integration_id='enrichment')
      const { data: ownState } = await supabase
        .from("ingest_sync_states")
        .select("last_synced_at")
        .eq("tenant_id", ctx.tenantId)
        .eq("integration_id", "enrichment")
        .eq("ingest_type", enrichmentType)
        .maybeSingle();

      // Fetch all dependency sync states in one query
      const depKeys = dependencies.map(
        (d) => `${d.integrationId}:${d.ingestType}`,
      );

      const { data: depStates } = await supabase
        .from("ingest_sync_states")
        .select("integration_id, ingest_type, last_synced_at")
        .eq("tenant_id", ctx.tenantId)
        .in("integration_id", dependencies.map((d) => d.integrationId));

      const stateMap = new Map(
        (depStates ?? []).map((s) => [`${s.integration_id}:${s.ingest_type}`, s.last_synced_at]),
      );

      const enrichmentLastSynced = ownState?.last_synced_at
        ? new Date(ownState.last_synced_at).getTime()
        : 0;

      for (const depKey of depKeys) {
        const depSyncedAt = stateMap.get(depKey);
        if (!depSyncedAt || new Date(depSyncedAt).getTime() < enrichmentLastSynced) {
          Logger.trace({ module: "ingestor", context: "EnrichmentWorker", message: `deps not yet fresh for ${enrichmentType}, skipping` });
          return { success: true, recordCount: 0 };
        }
      }
    }

    // TODO Phase 3 — implement per-enrichment computation logic
    Logger.trace({ module: "ingestor", context: "EnrichmentWorker", message: "stub run", meta: { enrichmentType: enrichmentType ?? ctx.ingestType, tenantId: ctx.tenantId } });
    return { success: true, recordCount: 0 };
  }
}
