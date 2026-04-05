import { isJson } from "@workspace/shared/lib/utils/validators.js";
import { getSupabase } from "../supabase.js";
import { classifyError } from "./error-classifier.js";
import { AppError } from "@workspace/shared/lib/errors.js";

export type IngestJobRecord = {
  id: string;
  tenant_id: string;
  link_id: string | null;
  site_id: string | null;
  integration_id: string;
  ingest_type: string;
};

type StartParams = {
  tenant_id: string;
  link_id?: string | null;
  site_id?: string | null;
  integration_id: string;
  ingest_type: string;
  bullmq_job_id?: string | null;
};

export async function startIngestJob(
  params: StartParams,
): Promise<IngestJobRecord> {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("ingest_jobs")
    .insert({
      tenant_id: params.tenant_id,
      link_id: params.link_id ?? null,
      site_id: params.site_id ?? null,
      integration_id: params.integration_id,
      ingest_type: params.ingest_type,
      bullmq_job_id: params.bullmq_job_id ?? null,
      status: "running",
      started_at: now,
    })
    .select()
    .single();

  if (error) throw new Error(`startIngestJob failed: ${error.message}`);
  return data as IngestJobRecord;
}

export async function completeIngestJob(
  jobId: string,
  opts: {
    row_count?: number;
    metrics?: Record<string, unknown>;
    syncMetadata?: Record<string, unknown>;
  },
): Promise<void> {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data: job, error: fetchError } = await supabase
    .from("ingest_jobs")
    .select("tenant_id, link_id, site_id, integration_id, ingest_type")
    .eq("id", jobId)
    .single();

  if (fetchError || !job)
    throw new Error(`completeIngestJob: job ${jobId} not found`);

  await supabase
    .from("ingest_jobs")
    .update({
      status: "completed",
      completed_at: now,
      metrics: isJson(opts.metrics) ? opts.metrics : undefined,
      updated_at: now,
    })
    .eq("id", jobId);

  await supabase.from("ingest_sync_states").upsert(
    {
      tenant_id: job.tenant_id,
      link_id: job.link_id,
      site_id: job.site_id,
      integration_id: job.integration_id,
      ingest_type: job.ingest_type,
      last_synced_at: now,
      last_job_id: jobId,
      last_status: "completed",
      consecutive_failures: 0,
      last_error_class: null,
      last_error_message: null,
      metadata: isJson(opts.syncMetadata) ? opts.syncMetadata : undefined,
    },
    { onConflict: "tenant_id,link_id,integration_id,ingest_type" },
  );
}

export async function failIngestJob(
  jobId: string,
  opts: { error: unknown; metrics?: Record<string, unknown>; failedSpan?: string },
): Promise<void> {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const classified = classifyError(opts.error);
  const errorContext = opts.error instanceof AppError ? opts.error.context : undefined;

  const { data: job, error: fetchError } = await supabase
    .from("ingest_jobs")
    .select("tenant_id, link_id, site_id, integration_id, ingest_type")
    .eq("id", jobId)
    .single();

  await supabase
    .from("ingest_jobs")
    .update({
      status: "failed",
      completed_at: now,
      error: classified.rawMessage,
      error_class: classified.errorClass,
      user_facing: classified.userFacing,
      user_message: classified.userMessage,
      metrics: isJson(opts.metrics) ? opts.metrics : undefined,
      updated_at: now,
    })
    .eq("id", jobId);

  if (fetchError || !job) return;

  // Read current sync state — we need consecutive_failures and last_synced_at.
  // last_synced_at is NOT NULL in the DB, so on failure we preserve the existing
  // value (or use epoch if no row exists yet) to avoid misleading the reconciler
  // into thinking data was just synced.
  let currentFailures = 0;
  let existingLastSyncedAt: string = new Date(0).toISOString(); // epoch → immediately stale
  let syncQuery = supabase
    .from("ingest_sync_states")
    .select("consecutive_failures, last_synced_at")
    .eq("tenant_id", job.tenant_id)
    .eq("integration_id", job.integration_id)
    .eq("ingest_type", job.ingest_type);
  syncQuery =
    job.link_id !== null
      ? syncQuery.eq("link_id", job.link_id)
      : syncQuery.is("link_id", null);
  const { data: syncState } = await syncQuery.maybeSingle();

  if (syncState) {
    currentFailures = syncState.consecutive_failures ?? 0;
    existingLastSyncedAt = syncState.last_synced_at;
  }

  await supabase.from("ingest_sync_states").upsert(
    {
      tenant_id: job.tenant_id,
      link_id: job.link_id,
      site_id: job.site_id,
      integration_id: job.integration_id,
      ingest_type: job.ingest_type,
      // Preserve the last successful sync timestamp so the reconciler uses
      // actual staleness rather than the failure time to decide when to retry.
      last_synced_at: existingLastSyncedAt,
      last_job_id: jobId,
      last_status: "failed",
      last_failed_at: now,
      last_error_class: classified.errorClass,
      last_error_message: classified.userMessage,
      last_error_context: isJson(errorContext) ? errorContext : null,
      last_failed_span: opts.failedSpan ?? null,
      consecutive_failures: currentFailures + 1,
    },
    { onConflict: "tenant_id,link_id,integration_id,ingest_type" },
  );
}

export async function getAvailableDataTypes(params: {
  tenant_id: string;
  link_id: string | null;
  integration_id: string;
  staleThresholdMs?: Record<string, number>; // ingest_type → ms; missing = no expiry
}): Promise<Set<string>> {
  const supabase = getSupabase();

  let q = supabase
    .from("ingest_sync_states")
    .select("ingest_type, last_synced_at")
    .eq("tenant_id", params.tenant_id)
    .eq("integration_id", params.integration_id);

  if (params.link_id !== null) {
    q = q.eq("link_id", params.link_id);
  } else {
    q = q.is("link_id", null);
  }

  const { data, error } = await q;
  if (error) throw new Error(`getAvailableDataTypes failed: ${error.message}`);

  const now = Date.now();
  const result = new Set<string>();
  for (const row of data ?? []) {
    const threshold = params.staleThresholdMs?.[row.ingest_type];
    if (threshold !== undefined) {
      const age = now - new Date(row.last_synced_at).getTime();
      if (age > threshold) continue; // too stale
    }
    result.add(row.ingest_type);
  }
  return result;
}

export async function isDataTypeAvailable(params: {
  tenant_id: string;
  link_id: string | null;
  integration_id: string;
  ingest_type: string;
  staleThresholdMs?: Record<string, number>;
}): Promise<boolean> {
  const available = await getAvailableDataTypes(params);
  return available.has(params.ingest_type);
}
