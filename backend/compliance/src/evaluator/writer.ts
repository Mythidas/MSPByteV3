import { supabase } from "../lib/supabase";
import type { CheckRunResult } from "./runner";

export type EvalRecord = CheckRunResult & { linkId: string };

export async function writeResults(
  results: EvalRecord[],
  tenantId: string,
): Promise<void> {
  const now = new Date().toISOString();

  const rows = results.map((r) => ({
    tenant_id: tenantId,
    link_id: r.linkId,
    framework_check_id: r.frameworkCheckId,
    status: r.status,
    detail: r.detail,
    evaluated_at: now,
  }));

  const BATCH_SIZE = 100;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await (supabase as any)
      .from("compliance_results")
      .upsert(batch, { onConflict: "link_id,framework_check_id" });

    if (error) throw new Error(`writeResults upsert failed: ${error.message}`);
  }
}
