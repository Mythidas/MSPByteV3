import { PerformanceTracker } from '@workspace/shared/lib/utils/performance.js';
import { getSupabase } from './supabase.js';

export interface AgentLogContext {
  endpoint: string;
  method: string; // "GET", "POST", etc.
  agentId: string;
  siteId: string;
  tenantId: string;
  psaSiteId?: string;
  rmmDeviceId?: string;
}

export interface AgentLogResult {
  statusCode: number;
  externalId?: string;
  errorMessage?: string;
  requestMetadata?: Record<string, any>;
  responseMetadata?: Record<string, any>;
}

export async function logAgentApiCall(
  context: AgentLogContext,
  result: AgentLogResult,
  performanceTracker: PerformanceTracker
): Promise<void> {
  if (result.statusCode === 200) {
    return;
  }

  try {
    const spans = performanceTracker.getSpans();
    const totalElapsed = performanceTracker.getTotalElapsed();
    const supabase = getSupabase();

    await supabase.from('agent_logs').insert({
      agent_id: context.agentId,
      site_id: context.siteId,
      method: context.method,
      message: result.errorMessage || context.endpoint,
      status: result.statusCode,
      time_elapsed_ms: totalElapsed,
      metadata: {
        endpoint: context.endpoint,
        tenantId: context.tenantId,
        psaSiteId: context.psaSiteId,
        rmmDeviceId: context.rmmDeviceId,
        externalId: result.externalId,
        requestMetadata: result.requestMetadata,
        responseMetadata: result.responseMetadata,
        spans,
      } as any,
    });
  } catch (error) {
    // Don't fail the request if logging fails
    console.error('Failed to log agent API call:', error);
  }
}
