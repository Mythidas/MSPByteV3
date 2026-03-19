import type { CheckConfig, ConditionGroup } from "@workspace/core/types/contracts/compliance";
import type {
  CheckEvaluator,
  EvalContext,
  EvalResult,
} from "../checkTypeRegistry";
import { applyFilter, evalFieldOp, getNestedValue } from "../utils/applyFilter";

function parseTable(table: string): { schema: string; name: string } {
  const parts = table.split(".");
  if (parts.length === 2) return { schema: parts[0], name: parts[1] };
  return { schema: "public", name: parts[0] };
}

function computeFailedConditions(
  rows: Record<string, unknown>[],
  filter: ConditionGroup,
) {
  return filter.conditions.map((cond) => ({
    field: cond.field,
    op: cond.op,
    value: cond.value,
    matched_count: rows.filter((row) =>
      evalFieldOp(getNestedValue(row, cond.field), cond.op, cond.value)
    ).length,
  }));
}

export class PolicyExistsEvaluator implements CheckEvaluator {
  async evaluate(config: unknown, ctx: EvalContext): Promise<EvalResult> {
    try {
      const { table, filter, threshold = 1 } = config as CheckConfig;
      const { schema, name } = parseTable(table);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = ctx.supabase as any;

      const { jsFilter } = applyFilter(null, filter);

      if (jsFilter) {
        // Size conditions require fetching rows then filtering in JS
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query: any =
          schema === "public" ? db.from(name) : db.schema(schema).from(name);
        query = query.select("*").eq("link_id", ctx.linkId);
        const { query: filtered } = applyFilter(query, filter);
        const { data, error } = await filtered;
        if (error) return { passed: false, detail: { error: error.message } };
        const rows = jsFilter(data ?? []);
        const passed = rows.length >= threshold;
        if (!passed && filter?.conditions?.length) {
          const failed_conditions = computeFailedConditions(data ?? [], filter);
          return { passed, detail: { count: rows.length, threshold, failed_conditions } };
        }
        return { passed, detail: { count: rows.length, threshold } };
      }

      // No size conditions — use efficient head query
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = db.schema(schema).from(name);
      query = query
        .select("*", { count: "exact", head: true })
        .eq("link_id", ctx.linkId);
      const { query: filtered } = applyFilter(query, filter);
      const { count, error } = await filtered;
      if (error) return { passed: false, detail: { error: error.message } };
      const passed = (count ?? 0) >= threshold;
      if (!passed && filter?.conditions?.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let rowQuery: any = db.schema(schema).from(name);
        rowQuery = rowQuery.select("*").eq("link_id", ctx.linkId);
        const { query: rowFiltered } = applyFilter(rowQuery, filter);
        const { data: rowData } = await rowFiltered;
        const failed_conditions = computeFailedConditions(rowData ?? [], filter);
        return { passed, detail: { count: count ?? 0, threshold, failed_conditions } };
      }
      return { passed, detail: { count: count ?? 0, threshold } };
    } catch (err) {
      return { passed: false, detail: { error: String(err) } };
    }
  }
}
