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
import { Logger } from "@workspace/shared/lib/utils/logger";
import { ConfigError, toAppError, formatZodError } from "@workspace/shared/lib/errors";

const MODULE = "compliance";
const CONTEXT = "PolicyNotExistsEvaluator";

function parseTable(table: string): { schema: string; name: string } {
  const parts = table.split(".");
  if (parts.length === 2) return { schema: parts[0], name: parts[1] };
  return { schema: "public", name: parts[0] };
}

export class PolicyNotExistsEvaluator implements CheckEvaluator {
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

    const { table, filter } = parsed.data;
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
          const appErr = toAppError(error, `Query failed (jsFilter): ${error.message}`, { table, schema, name });
          Logger.error({ module: MODULE, context: CONTEXT, message: appErr.userMessage, err: appErr });
          return { passed: false, detail: { error: appErr.userMessage } };
        }
        const rows = jsFilter(data ?? []);
        return { passed: rows.length === 0, detail: { count: rows.length } };
      }

      const query = buildDynamicQuery(ctx.supabase, schema, name, "*", {
        count: "exact",
        head: true,
      }).eq("link_id", ctx.linkId);
      const { query: filtered } = applyFilter(query, filter);
      const { count, error } = await filtered;
      if (error) {
        const appErr = toAppError(error, `Query failed (dynamicFilter): ${error.message}`, { table, schema, name });
        Logger.error({ module: MODULE, context: CONTEXT, message: appErr.userMessage, err: appErr });
        return { passed: false, detail: { error: appErr.userMessage } };
      }
      return { passed: (count ?? 0) === 0, detail: { count: count ?? 0 } };
    } catch (err) {
      const appErr = toAppError(err, undefined, {
        table,
        tenantId: ctx.tenantId,
        linkId: ctx.linkId,
      });
      Logger.error({ module: MODULE, context: CONTEXT, message: appErr.userMessage, err: appErr });
      return { passed: false, detail: { error: appErr.userMessage } };
    }
  }
}
