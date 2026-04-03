import type { SupabaseClient } from "@supabase/supabase-js";
import { isJson } from "@workspace/shared/lib/utils/validators";
import { Database } from "@workspace/shared/types/schema";

export type LogLevel = "trace" | "info" | "warn" | "error" | "fatal";

export interface DiagnosticEntry {
  tenant_id: string;
  level: LogLevel;
  module: string;
  context: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface AuditEntry {
  tenant_id: string;
  actor: string; // 'system' | userId | 'pipeline'
  action: string; // 'role_assigned' | 'consent_granted' | 'connection_deleted' | etc.
  target_type: string; // 'integration_connection' | 'site' | etc.
  target_id: string;
  result: "success" | "failure";
  detail?: Record<string, unknown>;
}

export async function writeDiagnosticLog(
  supabase: SupabaseClient<Database>,
  entry: DiagnosticEntry,
): Promise<void> {
  await supabase.from("diagnostic_logs").insert({
    tenant_id: entry.tenant_id,
    level: entry.level,
    module: entry.module,
    context: entry.context,
    message: entry.message,
    meta: isJson(entry.meta) ? entry.meta : null,
  });
}

export async function writeAuditLog(
  supabase: SupabaseClient<Database>,
  entry: AuditEntry,
): Promise<void> {
  await supabase.from("audit_logs").insert({
    tenant_id: entry.tenant_id,
    actor: entry.actor,
    action: entry.action,
    target_type: entry.target_type,
    target_id: entry.target_id,
    result: entry.result,
    detail: isJson(entry.detail) ? entry.detail : null,
  });
}
