import type { ConditionOperator } from "@workspace/shared/types/jobs/contracts/compliance";
import type {
  CheckEvaluator,
  EvalContext,
  EvalResult,
} from "../checkTypeRegistry";
import {
  applyFilter,
  buildDynamicQuery,
  getNestedValue,
  evalFieldOp,
  CheckConfigSchema,
} from "../utils/apply-filter";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { ConfigError, toAppError, formatZodError } from "@workspace/shared/lib/errors";

const MODULE = "compliance";
const CONTEXT = "FieldCompareEvaluator";

function parseTable(table: string): { schema: string; name: string } {
  const parts = table.split(".");
  if (parts.length === 2) return { schema: parts[0], name: parts[1] };
  return { schema: "public", name: parts[0] };
}

export class FieldCompareEvaluator implements CheckEvaluator {
  async evaluate(config: unknown, ctx: EvalContext): Promise<EvalResult> {
    const parsed = CheckConfigSchema.safeParse(config);
    if (!parsed.success) {
      const appErr = new ConfigError(
        `Invalid check config: ${formatZodError(parsed.error)}`,
        { raw: config, tenantId: ctx.tenantId, linkId: ctx.linkId },
      );
      Logger.error({ module: MODULE, context: CONTEXT, message: appErr.userMessage, err: appErr });
      return { passed: false, detail: { error: appErr.userMessage } };
    }

    const { table, filter, field, value } = parsed.data;
    const op: ConditionOperator = parsed.data.op ?? "eq";

    if (!field) {
      return {
        passed: false,
        detail: { error: "check_config.field is required" },
      };
    }

    try {
      const { schema, name } = parseTable(table);
      const query = buildDynamicQuery(ctx.supabase, schema, name).eq(
        "link_id",
        ctx.linkId,
      );

      const { query: filtered, jsFilter } = applyFilter(query, filter);
      const { data, error } = await filtered
        .limit(jsFilter ? 1000 : 1)
        .maybeSingle();

      if (error) {
        const appErr = toAppError(error, `Query failed: ${error.message}`, { table, field, op });
        Logger.error({ module: MODULE, context: CONTEXT, message: appErr.userMessage, err: appErr });
        return { passed: false, detail: { error: appErr.userMessage } };
      }

      const row = jsFilter
        ? data !== null
          ? (jsFilter([data])[0] ?? null)
          : null
        : data;

      if (!row) {
        return { passed: false, detail: { reason: "no matching row found" } };
      }

      const actual = getNestedValue(row, field);
      const passed = evalFieldOp(actual, op, value);

      return { passed, detail: { field, op, expected: value, actual } };
    } catch (err) {
      const appErr = toAppError(err, undefined, {
        table,
        field,
        op,
        tenantId: ctx.tenantId,
        linkId: ctx.linkId,
      });
      Logger.error({ module: MODULE, context: CONTEXT, message: appErr.userMessage, err: appErr });
      return { passed: false, detail: { error: appErr.userMessage } };
    }
  }
}
