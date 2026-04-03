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
import { Logger } from "@workspace/shared/lib/utils/logger";
import {
  ConfigError,
  toAppError,
  formatZodError,
} from "@workspace/shared/lib/errors";

const MODULE = "compliance";
const CONTEXT = "PolicyExistsEvaluator";

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
    // TODO: Spread error logging structure to rest of the codebase
    const parsed = CheckConfigSchema.safeParse(config);
    if (!parsed.success) {
      const appErr = new ConfigError(
        `Invalid check config: ${formatZodError(parsed.error)}`,
        { raw: config, tenantId: ctx.tenantId, linkId: ctx.linkId },
      );
      Logger.error({
        module: MODULE,
        context: CONTEXT,
        message: appErr.userMessage,
        err: appErr,
      });
      return { passed: false, detail: { error: appErr.userMessage } };
    }

    const { table, filter, threshold = 1 } = parsed.data;
    const { schema, name } = parseTable(table);

    try {
      const jsFilter = computeJsFilter(filter);

      if (jsFilter) {
        const query = buildDynamicQuery(ctx.supabase, schema, name).eq(
          "link_id",
          ctx.linkId,
        );
        const { query: filtered } = applyFilter(query, filter);
        const { data, error } = await filtered;
        if (error) {
          const appErr = toAppError(
            error,
            `Query failed (jsFilter): ${error.message}`,
            { table, schema, name },
          );
          Logger.error({
            module: MODULE,
            context: CONTEXT,
            message: appErr.userMessage,
            err: appErr,
          });
          return { passed: false, detail: { error: appErr.userMessage } };
        }

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

      const query = buildDynamicQuery(ctx.supabase, schema, name, "*", {
        count: "exact",
        head: true,
      }).eq("link_id", ctx.linkId);
      const { query: filtered } = applyFilter(query, filter);
      const { count, error } = await filtered;
      if (error) {
        const appErr = toAppError(
          error,
          `Query failed (dynamicFilter): ${error.message}`,
          { table, schema, name },
        );
        Logger.error({
          module: MODULE,
          context: CONTEXT,
          message: appErr.userMessage,
          err: appErr,
        });
        return { passed: false, detail: { error: appErr.userMessage } };
      }

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
      const appErr = toAppError(err, undefined, {
        table,
        tenantId: ctx.tenantId,
        linkId: ctx.linkId,
      });
      Logger.error({
        module: MODULE,
        context: CONTEXT,
        message: appErr.userMessage,
        err: appErr,
      });
      return { passed: false, detail: { error: appErr.userMessage } };
    }
  }
}
