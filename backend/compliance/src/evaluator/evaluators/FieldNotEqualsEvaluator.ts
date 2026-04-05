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
import { Logger } from "@workspace/shared/lib/utils/logger";
import { ConfigError, toAppError, formatZodError } from "@workspace/shared/lib/errors";

const MODULE = "compliance";
const CONTEXT = "FieldNotEqualsEvaluator";

function parseTable(table: string): { schema: string; name: string } {
  const parts = table.split(".");
  if (parts.length === 2) return { schema: parts[0], name: parts[1] };
  return { schema: "public", name: parts[0] };
}

export class FieldNotEqualsEvaluator implements CheckEvaluator {
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
    if (!field)
      return { passed: false, detail: { error: "check_config.field is required" } };

    const { schema, name } = parseTable(table);

    try {
      const query = buildDynamicQuery(ctx.supabase, schema, name).eq(
        "link_id",
        ctx.linkId,
      );
      const { query: filtered } = applyFilter(query, filter);
      const { data, error } = await filtered.limit(1).maybeSingle();
      if (error) {
        const appErr = toAppError(error, `Query failed: ${error.message}`, { table, schema, name });
        Logger.error({ module: MODULE, context: CONTEXT, message: appErr.userMessage, err: appErr });
        return { passed: false, detail: { error: appErr.userMessage } };
      }
      if (!data) return { passed: false, detail: { reason: "no row found" } };

      const actual = getNestedValue(data, field);
      const passed = actual != value;
      return { passed, detail: { field, unexpected: value, actual } };
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
