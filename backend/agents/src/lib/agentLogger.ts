import { PerformanceTracker } from "@workspace/shared/lib/utils/performance.js";
import { getSupabase } from "./supabase.js";
import { isJson } from "@workspace/shared/lib/utils/validators.js";

export interface AgentLogContext {
  endpoint: string;
  method: string;
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
  requestMetadata?: Record<string, unknown>;
  responseMetadata?: Record<string, unknown>;
}

export async function logAgentApiCall(
  context: AgentLogContext,
  result: AgentLogResult,
  performanceTracker: PerformanceTracker,
): Promise<void> {
  if (result.statusCode === 200) {
    return;
  }

  try {
    const spans = performanceTracker.getSpans();
    const totalElapsed = performanceTracker.getTotalElapsed();
    const supabase = getSupabase();
    const metadata = {
      endpoint: context.endpoint,
      tenantId: context.tenantId,
      psaSiteId: context.psaSiteId,
      rmmDeviceId: context.rmmDeviceId,
      externalId: result.externalId,
      requestMetadata: result.requestMetadata,
      responseMetadata: result.responseMetadata,
      spans,
    };

    await supabase.from("agent_logs").insert({
      agent_id: context.agentId,
      site_id: context.siteId,
      tenant_id: context.tenantId,
      method: context.method,
      message: result.errorMessage || context.endpoint,
      status: result.statusCode,
      time_elapsed_ms: totalElapsed,
      metadata: isJson(metadata) ? metadata : {},
    });
  } catch (error) {
    // Don't fail the request if logging fails
    console.error("Failed to log agent API call:", error);
  }
}
