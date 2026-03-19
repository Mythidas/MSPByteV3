import { getAllDbRoutedTypes } from "@workspace/core/types/integrations";
import { getCheckType } from "./checkTypeRegistry";
import { supabase } from "../lib/supabase";
import type { ComplianceCheckRow } from "./loader";

export type CheckStatus = "pass" | "fail" | "unknown";

export type CheckRunResult = {
  frameworkCheckId: string;
  status: CheckStatus;
  detail: Record<string, unknown>;
  onPassWorkflowId: string | null;
  onFailWorkflowId: string | null;
  onChangeWorkflowId: string | null;
};

const ALLOWED_TABLES = new Set<string>(
  getAllDbRoutedTypes().flatMap(({ db }) => [
    `${db.schema}.${db.table}`,
    db.table,
  ]),
);

export async function runCheck(
  check: ComplianceCheckRow,
  linkId: string,
  tenantId: string,
): Promise<CheckRunResult> {
  try {
    const tableValue = (check.check_config as Record<string, unknown>).table;
    const workflowIds = {
      onPassWorkflowId: check.on_pass_workflow_id,
      onFailWorkflowId: check.on_fail_workflow_id,
      onChangeWorkflowId: check.on_change_workflow_id,
    };

    if (typeof tableValue !== "string") {
      return {
        frameworkCheckId: check.id,
        status: "unknown",
        detail: { error: "check_config.table is missing or not a string" },
        ...workflowIds,
      };
    }

    if (!ALLOWED_TABLES.has(tableValue)) {
      return {
        frameworkCheckId: check.id,
        status: "unknown",
        detail: { error: "table not in allowlist" },
        ...workflowIds,
      };
    }

    const evaluator = getCheckType(check.check_type_id).evaluator;
    const result = await evaluator.evaluate(check.check_config, { tenantId, linkId, supabase });

    const status: CheckStatus = result.passed ? "pass" : "fail";
    return { frameworkCheckId: check.id, status, detail: result.detail ?? {}, ...workflowIds };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      frameworkCheckId: check.id,
      status: "unknown",
      detail: { error: message },
      onPassWorkflowId: check.on_pass_workflow_id,
      onFailWorkflowId: check.on_fail_workflow_id,
      onChangeWorkflowId: check.on_change_workflow_id,
    };
  }
}
