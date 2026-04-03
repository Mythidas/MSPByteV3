import type { ConditionGroup } from "@workspace/shared/types/jobs/contracts/compliance";
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
  evalFieldOp,
  getNestedValue,
} from "../utils/apply-filter";

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
      evalFieldOp(getNestedValue(row, cond.field), cond.op, cond.value),
    ).length,
  }));
}

export class PolicyExistsEvaluator implements CheckEvaluator {
  async evaluate(config: unknown, ctx: EvalContext): Promise<EvalResult> {
    try {
      const { table, filter, threshold = 1 } = CheckConfigSchema.parse(config);
      const { schema, name } = parseTable(table);

      const jsFilter = computeJsFilter(filter);

      if (jsFilter) {
        // Size conditions require fetching rows then filtering in JS
        const query = buildDynamicQuery(ctx.supabase, schema, name).eq(
          "link_id",
          ctx.linkId,
        );
        const { query: filtered } = applyFilter(query, filter);
        const { data, error } = await filtered;
        if (error) return { passed: false, detail: { error: error.message } };
        const rows = jsFilter(data ?? []);
        const passed = rows.length >= threshold;
        if (!passed && filter?.conditions?.length) {
          const failed_conditions = computeFailedConditions(data ?? [], filter);
          return {
            passed,
            detail: { count: rows.length, threshold, failed_conditions },
          };
        }
        return { passed, detail: { count: rows.length, threshold } };
      }

      // No size conditions — use efficient head query
      const query = buildDynamicQuery(ctx.supabase, schema, name, "*", {
        count: "exact",
        head: true,
      }).eq("link_id", ctx.linkId);
      const { query: filtered } = applyFilter(query, filter);
      const { count, error } = await filtered;
      if (error) return { passed: false, detail: { error: error.message } };
      const passed = (count ?? 0) >= threshold;
      if (!passed && filter?.conditions?.length) {
        const rowQuery = buildDynamicQuery(ctx.supabase, schema, name).eq(
          "link_id",
          ctx.linkId,
        );
        const { data: rowData } = await rowQuery;
        const failed_conditions = computeFailedConditions(
          rowData ?? [],
          filter,
        );
        return {
          passed,
          detail: { count: count ?? 0, threshold, failed_conditions },
        };
      }
      return { passed, detail: { count: count ?? 0, threshold } };
    } catch (err) {
      return { passed: false, detail: { error: String(err) } };
    }
  }
}
