import type {
  CheckEvaluator,
  EvalContext,
  EvalResult,
} from "../checkTypeRegistry";
import {
  applyFilter,
  buildDynamicQuery,
  CheckConfigSchema,
  getNestedValue,
} from "../utils/apply-filter";

function parseTable(table: string): { schema: string; name: string } {
  const parts = table.split(".");
  if (parts.length === 2) return { schema: parts[0], name: parts[1] };
  return { schema: "public", name: parts[0] };
}

export class FieldEqualsEvaluator implements CheckEvaluator {
  async evaluate(config: unknown, ctx: EvalContext): Promise<EvalResult> {
    try {
      const { table, filter, field, value } = CheckConfigSchema.parse(config);
      if (!field)
        return {
          passed: false,
          detail: { error: "check_config.field is required" },
        };

      const { schema, name } = parseTable(table);
      const query = buildDynamicQuery(ctx.supabase, schema, name).eq(
        "link_id",
        ctx.linkId,
      );

      const { query: filtered } = applyFilter(query, filter);
      const { data, error } = await filtered.limit(1).maybeSingle();
      if (error) return { passed: false, detail: { error: error.message } };
      if (!data) return { passed: false, detail: { reason: "no row found" } };

      const actual = getNestedValue(data, field);
      const passed = actual == value;
      return { passed, detail: { field, expected: value, actual } };
    } catch (err) {
      return { passed: false, detail: { error: String(err) } };
    }
  }
}
