import type {
  CheckEvaluator,
  EvalContext,
  EvalResult,
} from "../checkTypeRegistry";
import {
  applyFilter,
  buildDynamicQuery,
  CheckConfigSchema,
  computeJsFilter,
} from "../utils/apply-filter";

function parseTable(table: string): { schema: string; name: string } {
  const parts = table.split(".");
  if (parts.length === 2) return { schema: parts[0], name: parts[1] };
  return { schema: "public", name: parts[0] };
}

export class PolicyCountGteEvaluator implements CheckEvaluator {
  async evaluate(config: unknown, ctx: EvalContext): Promise<EvalResult> {
    try {
      const { table, filter, threshold = 1 } = CheckConfigSchema.parse(config);
      const { schema, name } = parseTable(table);

      const jsFilter = computeJsFilter(filter);

      if (jsFilter) {
        const query = buildDynamicQuery(ctx.supabase, schema, name).eq(
          "link_id",
          ctx.linkId,
        );
        const { query: filtered } = applyFilter(query, filter);
        const { data, error } = await filtered;
        if (error) return { passed: false, detail: { error: error.message } };
        const rows = jsFilter(data ?? []);
        const passed = rows.length >= threshold;
        return { passed, detail: { count: rows.length, threshold } };
      }

      const query = buildDynamicQuery(ctx.supabase, schema, name, "*", {
        count: "exact",
        head: true,
      }).eq("link_id", ctx.linkId);
      const { query: filtered } = applyFilter(query, filter);
      const { count, error } = await filtered;
      if (error) return { passed: false, detail: { error: error.message } };
      const passed = (count ?? 0) >= threshold;
      return { passed, detail: { count: count ?? 0, threshold } };
    } catch (err) {
      return { passed: false, detail: { error: String(err) } };
    }
  }
}
