import { getSupabase } from '../supabase.js';
import type { NodeRunResult } from '../types.js';

export async function finalizeRun(
  runId: string,
  results: NodeRunResult[],
  startedAt: Date,
): Promise<void> {
  const supabase = getSupabase();
  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();

  const sourceTransformResults = results.filter(
    (r) => r.category === 'source' || r.category === 'transform',
  );
  const sinkResults = results.filter((r) => r.category === 'sink');

  let status: 'completed' | 'failed' | 'partial';
  let error: string | undefined;

  const sourceTransformFailed = sourceTransformResults.some((r) => r.status === 'failed');
  const sinkFailed = sinkResults.some((r) => r.status === 'failed');

  if (sourceTransformFailed) {
    status = 'failed';
    const failedNode = sourceTransformResults.find((r) => r.status === 'failed');
    error = failedNode?.error;
  } else if (sinkFailed) {
    status = 'partial';
  } else {
    status = 'completed';
  }

  await supabase.from('task_runs').update({
    status,
    completed_at: completedAt.toISOString(),
    duration_ms: durationMs,
    ...(error ? { error } : {}),
  }).eq('id', runId);
}
