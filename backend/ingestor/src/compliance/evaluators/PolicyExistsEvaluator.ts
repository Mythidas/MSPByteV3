import type {
  CheckEvaluator,
  EvalContext,
  EvalResult,
} from "../checkTypeRegistry.js";

interface PolicyExistsConfig {
  table: string;
  match?: Record<string, unknown>;
  threshold?: number;
}

function parseTable(table: string): { schema: string; name: string } {
  const parts = table.split(".");
  if (parts.length === 2) return { schema: parts[0], name: parts[1] };
  return { schema: "public", name: parts[0] };
}

export class PolicyExistsEvaluator implements CheckEvaluator {
  async evaluate(config: unknown, ctx: EvalContext): Promise<EvalResult> {
    try {
      const { table, match = {}, threshold = 1 } = config as PolicyExistsConfig;
      const { schema, name } = parseTable(table);

      let query =
        schema === "public"
          ? (ctx.supabase.from(name as any) as any)
          : (ctx.supabase.schema(schema).from(name) as any);

      query = query
        .select("*", { count: "exact", head: true })
        .eq("link_id", ctx.linkId);

      for (const [key, value] of Object.entries(match)) {
        query = query.eq(key, value);
      }

      const { count, error } = await query;

      console.log(error, count);
      if (error) {
        return { passed: false, detail: { error: error.message } };
      }

      const passed = (count ?? 0) >= threshold;
      return { passed, detail: { count: count ?? 0, threshold } };
    } catch (err) {
      return { passed: false, detail: { error: String(err) } };
    }
  }
}
