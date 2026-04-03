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

function parseTable(table: string): { schema: string; name: string } {
  const parts = table.split(".");
  if (parts.length === 2) return { schema: parts[0], name: parts[1] };
  return { schema: "public", name: parts[0] };
}

export class FieldCompareEvaluator implements CheckEvaluator {
  async evaluate(config: unknown, ctx: EvalContext): Promise<EvalResult> {
    try {
      const parsed = CheckConfigSchema.parse(config);
      const { table, filter, field, value } = parsed;
      const op: ConditionOperator = parsed.op ?? "eq";

      if (!field) {
        return {
          passed: false,
          detail: { error: "check_config.field is required" },
        };
      }

      const { schema, name } = parseTable(table);
      const query = buildDynamicQuery(ctx.supabase, schema, name).eq(
        "link_id",
        ctx.linkId,
      );

      const { query: filtered, jsFilter } = applyFilter(query, filter);
      const { data, error } = await filtered
        .limit(jsFilter ? 1000 : 1)
        .maybeSingle();

      if (error) return { passed: false, detail: { error: error.message } };

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
      return { passed: false, detail: { error: String(err) } };
    }
  }
}
