import type { CheckEvaluator, EvalContext, EvalResult } from '../checkTypeRegistry';

interface PolicyCountGteConfig {
  table: string;
  match?: Record<string, unknown>;
  threshold: number;
}

function parseTable(table: string): { schema: string; name: string } {
  const parts = table.split('.');
  if (parts.length === 2) return { schema: parts[0], name: parts[1] };
  return { schema: 'public', name: parts[0] };
}

export class PolicyCountGteEvaluator implements CheckEvaluator {
  async evaluate(config: unknown, ctx: EvalContext): Promise<EvalResult> {
    const { table, match = {}, threshold } = config as PolicyCountGteConfig;
    const { schema, name } = parseTable(table);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = ctx.supabase as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any =
      schema === 'public'
        ? db.from(name)
        : db.schema(schema).from(name);

    query = query.select('*', { count: 'exact', head: true }).eq('link_id', ctx.linkId);

    for (const [key, value] of Object.entries(match)) {
      query = query.eq(key, value);
    }

    const { count, error } = await query;

    if (error) {
      return { passed: false, detail: { error: error.message } };
    }

    const passed = (count ?? 0) >= threshold;
    return { passed, detail: { count: count ?? 0, threshold } };
  }
}
