import { getAllDbRoutedTypes } from "@workspace/shared/config/integrations/integrations";
import { getCheckType } from "./checkTypeRegistry";
import { supabase } from "../lib/supabase";
import type { ComplianceCheckRow } from "./loader";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { toAppError, formatZodError, ConfigError } from "@workspace/shared/lib/errors";
import z from "zod";

const MODULE = "compliance";
const CONTEXT = "runner";

export type CheckStatus = "pass" | "fail" | "unknown";
export type CheckRunResult = {
  frameworkCheckId: string;
  status: CheckStatus;
  detail: { error?: string };
  onPassWorkflowId: string | null;
  onFailWorkflowId: string | null;
  onChangeWorkflowId: string | null;
};

const TableConfigSchema = z.object({ table: z.string() });
const ALLOWED_TABLES = new Set<string>(
  getAllDbRoutedTypes().flatMap(
    ({ db }: { db: { schema: string; table: string } }) => [
      `${db.schema}.${db.table}`,
      db.table,
    ],
  ),
);

export async function runCheck(
  check: ComplianceCheckRow,
  linkId: string,
  tenantId: string,
): Promise<CheckRunResult> {
  const workflowIds = {
    onPassWorkflowId: check.on_pass_workflow_id,
    onFailWorkflowId: check.on_fail_workflow_id,
    onChangeWorkflowId: check.on_change_workflow_id,
  };

  try {
    const tableConfig = TableConfigSchema.safeParse(check.check_config);
    if (!tableConfig.success) {
      const appErr = new ConfigError(
        `Invalid check config: ${formatZodError(tableConfig.error)}`,
        { checkId: check.id, tenantId, linkId, raw: check.check_config },
      );
      Logger.error({ module: MODULE, context: CONTEXT, message: appErr.userMessage, err: appErr });
      return {
        frameworkCheckId: check.id,
        status: "unknown",
        detail: { error: appErr.userMessage },
        ...workflowIds,
      };
    }

    if (!ALLOWED_TABLES.has(tableConfig.data.table)) {
      return {
        frameworkCheckId: check.id,
        status: "unknown",
        detail: { error: `Table "${tableConfig.data.table}" is not in the allowlist` },
        ...workflowIds,
      };
    }

    const evaluator = getCheckType(check.check_type_id).evaluator;
    const result = await evaluator.evaluate(check.check_config, {
      tenantId,
      linkId,
      supabase,
    });

    const status: CheckStatus = result.passed ? "pass" : "fail";
    return {
      frameworkCheckId: check.id,
      status,
      detail: result.detail ?? {},
      ...workflowIds,
    };
  } catch (err) {
    const appErr = toAppError(err, undefined, { checkId: check.id, tenantId, linkId });
    Logger.error({ module: MODULE, context: CONTEXT, message: appErr.userMessage, err: appErr });
    return {
      frameworkCheckId: check.id,
      status: "unknown",
      detail: { error: appErr.userMessage },
      ...workflowIds,
    };
  }
}
