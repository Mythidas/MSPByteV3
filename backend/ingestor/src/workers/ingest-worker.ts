import type { Job } from "bullmq";
import type { JobContext, JobResult } from "@workspace/core/types/job";
import type { IntegrationId } from "@workspace/core/types/integrations";
import { getIngestTypeConfig } from "@workspace/core/types/integrations";
import { resolveCredentials } from "@workspace/core/lib/credentials";
import { Logger } from "@workspace/core/lib/utils/logger";
import { BaseWorker, SkipJobError, type JobPayload } from "./base-worker";
import { adapterRegistry, NotImplementedError } from "../adapters/registry";
import { batchUpsert } from "../lib/batch-upsert";
import { supabase } from "../lib/supabase";

export class IngestWorker extends BaseWorker {
  constructor(queueName: string, concurrency: number) {
    super(queueName, concurrency);
    Logger.info({ module: "ingestor", context: "IngestWorker", message: `listening on ${queueName}`, meta: { queueName, concurrency } });
  }

  async process(job: Job<JobPayload>, ctx: JobContext): Promise<JobResult> {
    const start = Date.now();

    // Resolve adapter — NotImplementedError → SkipJobError (marked 'skipped', not 'failed')
    let adapter;
    try {
      adapter = adapterRegistry.resolve(ctx.integrationId as IntegrationId);
    } catch (err) {
      if (err instanceof NotImplementedError) {
        throw new SkipJobError(err.message);
      }
      throw err;
    }

    // Fetch integration config (always filter by tenant_id)
    const { data: integration, error: integrationError } = await supabase
      .from("integrations")
      .select("config")
      .eq("id", ctx.integrationId)
      .eq("tenant_id", ctx.tenantId)
      .single();

    if (integrationError || !integration) {
      throw new Error(
        `Failed to fetch integration config: ${integrationError?.message ?? "not found"}`,
      );
    }

    // Decrypt credentials via @workspace/core
    const credentials = await resolveCredentials(
      ctx.integrationId as IntegrationId,
      integration.config as Record<string, string>,
    );

    const ctxWithCreds: JobContext = { ...ctx, credentials };

    // Call adapter
    const payloads = await adapter.fetch(ctxWithCreds);

    // Resolve schema for this ingest type from INTEGRATIONS config
    const typeConfig = getIngestTypeConfig(
      ctx.integrationId as IntegrationId,
      ctx.ingestType as any,
    );
    const schema = typeConfig?.db?.schema ?? "public";

    // Batch upsert all payloads via SupabaseHelper
    let totalRows = 0;
    for (const payload of payloads) {
      const count = await batchUpsert(payload, schema);
      totalRows += count;
    }

    return {
      success: true,
      recordCount: totalRows,
      metrics: { durationMs: Date.now() - start },
    };
  }
}
