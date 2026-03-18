import { getSupabase } from '../supabase.js';

export type IngestJobRecord = {
  id: string;
  tenant_id: string;
  link_id: string | null;
  integration_id: string;
  ingest_type: string;
};

type StartParams = {
  tenant_id: string;
  link_id?: string | null;
  integration_id: string;
  ingest_type: string;
  trigger?: string;
};

export async function startIngestJob(params: StartParams): Promise<IngestJobRecord> {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data, error } = await (supabase.from('ingest_jobs' as any) as any)
    .insert({
      tenant_id: params.tenant_id,
      link_id: params.link_id ?? null,
      integration_id: params.integration_id,
      ingest_type: params.ingest_type,
      status: 'running',
      started_at: now,
      trigger: params.trigger ?? 'linker',
    })
    .select()
    .single();

  if (error) throw new Error(`startIngestJob failed: ${error.message}`);
  return data as IngestJobRecord;
}

export async function completeIngestJob(
  jobId: string,
  opts: { row_count?: number; metrics?: Record<string, any>; syncMetadata?: Record<string, any> },
): Promise<void> {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data: job, error: fetchError } = await supabase
    .from('ingest_jobs')
    .select('tenant_id, link_id, integration_id, ingest_type')
    .eq('id', jobId)
    .single();

  if (fetchError || !job) throw new Error(`completeIngestJob: job ${jobId} not found`);

  await supabase
    .from('ingest_jobs')
    .update({
      status: 'completed',
      completed_at: now,
      metrics: opts.metrics ?? null,
      updated_at: now,
    })
    .eq('id', jobId);

  await supabase
    .from('ingest_sync_states')
    .upsert(
      {
        tenant_id: job.tenant_id,
        link_id: job.link_id,
        integration_id: job.integration_id,
        ingest_type: job.ingest_type,
        last_synced_at: now,
        last_job_id: jobId,
        metadata: opts.syncMetadata ?? {},
      },
      { onConflict: 'tenant_id,link_id,integration_id,ingest_type' },
    );
}

export async function failIngestJob(
  jobId: string,
  opts: { error: string; metrics?: Record<string, any> },
): Promise<void> {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  await supabase
    .from('ingest_jobs')
    .update({
      status: 'failed',
      completed_at: now,
      error: opts.error,
      metrics: opts.metrics ?? null,
      updated_at: now,
    })
    .eq('id', jobId);
}

export async function getAvailableDataTypes(params: {
  tenant_id: string;
  link_id: string | null;
  integration_id: string;
  staleThresholdMs?: Record<string, number>; // ingest_type → ms; missing = no expiry
}): Promise<Set<string>> {
  const supabase = getSupabase();

  let q = supabase
    .from('ingest_sync_states')
    .select('ingest_type, last_synced_at')
    .eq('tenant_id', params.tenant_id)
    .eq('integration_id', params.integration_id);

  if (params.link_id !== null) {
    q = q.eq('link_id', params.link_id);
  } else {
    q = q.is('link_id', null);
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
