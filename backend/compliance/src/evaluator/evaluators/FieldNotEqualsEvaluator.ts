import type { CheckEvaluator, EvalContext, EvalResult } from '../checkTypeRegistry';

interface FieldNotEqualsConfig {
  table: string;
  match?: Record<string, unknown>;
  field: string;
  value: unknown;
}

function parseTable(table: string): { schema: string; name: string } {
  const parts = table.split('.');
  if (parts.length === 2) return { schema: parts[0], name: parts[1] };
  return { schema: 'public', name: parts[0] };
}

export class FieldNotEqualsEvaluator implements CheckEvaluator {
  async evaluate(config: unknown, ctx: EvalContext): Promise<EvalResult> {
    const { table, match = {}, field, value } = config as FieldNotEqualsConfig;
    const { schema, name } = parseTable(table);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = ctx.supabase as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any =
      schema === 'public'
        ? db.from(name)
        : db.schema(schema).from(name);

    query = query.select('*').eq('link_id', ctx.linkId);

    for (const [key, val] of Object.entries(match)) {
      query = query.eq(key, val);
    }

    const { data, error } = await query.limit(1).maybeSingle();

    if (error) {
      return { passed: false, detail: { error: error.message } };
    }

    if (!data) {
      return { passed: false, detail: { reason: 'no row found' } };
    }

    const passed = data[field] !== value;
    return { passed, detail: { field, unexpected: value, actual: data[field] } };
  }
}
