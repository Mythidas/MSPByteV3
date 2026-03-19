import { Logger } from "@workspace/shared/lib/utils/logger";
import { SupabaseHelper } from "@workspace/shared/lib/utils/supabase-helper";
import { supabase } from "../lib/supabase";
import type { CheckRunResult } from "./runner";

export type EvalRecord = CheckRunResult & { linkId: string };

export async function writeResults(
  results: EvalRecord[],
  tenantId: string,
): Promise<void> {
  const now = new Date().toISOString();

  // Query most recent previous status per (link_id, framework_check_id) before inserting
  const checkIds = results.map((r) => r.frameworkCheckId);
  const linkIds = [...new Set(results.map((r) => r.linkId))];

  const { data: prevData } = await (supabase as any)
    .from("compliance_results")
    .select("link_id, framework_check_id, status, evaluated_at")
    .eq("tenant_id", tenantId)
    .in("link_id", linkIds)
    .in("framework_check_id", checkIds)
    .order("evaluated_at", { ascending: false });

  // Deduplicate: first occurrence per key = most recent
  const previousStatusMap = new Map<string, string>();
  for (const row of (prevData ?? []) as { link_id: string; framework_check_id: string; status: string }[]) {
    const key = `${row.link_id}::${row.framework_check_id}`;
    if (!previousStatusMap.has(key)) previousStatusMap.set(key, row.status);
  }

  const rows = results.map((r) => ({
    tenant_id: tenantId,
    link_id: r.linkId,
    framework_check_id: r.frameworkCheckId,
    status: r.status,
    detail: r.detail,
    evaluated_at: now,
  }));

  const helper = new SupabaseHelper(supabase);
  const { error } = await helper.batchInsert(
    "public",
    "compliance_results",
    rows as any,
    100,
  );
  if (error) throw new Error(`writeResults upsert failed: ${error.message}`);

  // Log workflow trigger stubs
  for (const r of results) {
    const key = `${r.linkId}::${r.frameworkCheckId}`;
    const prev = previousStatusMap.get(key) ?? null;
    const curr = r.status;

    if (r.onChangeWorkflowId && prev !== null && prev !== curr) {
      Logger.info({
        module: "compliance",
        context: "writer",
        message: "[STUB] would trigger on_change workflow",
        meta: { workflowId: r.onChangeWorkflowId, frameworkCheckId: r.frameworkCheckId, linkId: r.linkId, prev, curr },
      });
    }

    if (r.onFailWorkflowId && curr === "fail" && (prev === null || prev === "pass")) {
      Logger.info({
        module: "compliance",
        context: "writer",
        message: "[STUB] would trigger on_fail workflow",
        meta: { workflowId: r.onFailWorkflowId, frameworkCheckId: r.frameworkCheckId, linkId: r.linkId, prev, curr },
      });
    }

    if (r.onPassWorkflowId && curr === "pass" && (prev === null || prev === "fail")) {
      Logger.info({
        module: "compliance",
        context: "writer",
        message: "[STUB] would trigger on_pass workflow",
        meta: { workflowId: r.onPassWorkflowId, frameworkCheckId: r.frameworkCheckId, linkId: r.linkId, prev, curr },
      });
    }
  }
}
