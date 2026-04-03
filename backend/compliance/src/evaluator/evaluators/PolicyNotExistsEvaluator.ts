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

export class PolicyNotExistsEvaluator implements CheckEvaluator {
  async evaluate(config: unknown, ctx: EvalContext): Promise<EvalResult> {
    try {
      const { table, filter } = CheckConfigSchema.parse(config);
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
        return { passed: rows.length === 0, detail: { count: rows.length } };
      }

      const query = buildDynamicQuery(ctx.supabase, schema, name, "*", {
        count: "exact",
        head: true,
      }).eq("link_id", ctx.linkId);
      const { query: filtered } = applyFilter(query, filter);
      const { count, error } = await filtered;
      if (error) return { passed: false, detail: { error: error.message } };
      return { passed: (count ?? 0) === 0, detail: { count: count ?? 0 } };
    } catch (err) {
      return { passed: false, detail: { error: String(err) } };
    }
  }
}
