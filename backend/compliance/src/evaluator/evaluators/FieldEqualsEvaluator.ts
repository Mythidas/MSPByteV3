import type { CheckConfig } from '@workspace/core/types/contracts/compliance';
import type { CheckEvaluator, EvalContext, EvalResult } from '../checkTypeRegistry';
import { applyFilter, getNestedValue } from '../utils/applyFilter';

function parseTable(table: string): { schema: string; name: string } {
  const parts = table.split('.');
  if (parts.length === 2) return { schema: parts[0], name: parts[1] };
  return { schema: 'public', name: parts[0] };
}

export class FieldEqualsEvaluator implements CheckEvaluator {
  async evaluate(config: unknown, ctx: EvalContext): Promise<EvalResult> {
    try {
      const { table, filter, field, value } = config as CheckConfig;
      if (!field) return { passed: false, detail: { error: 'check_config.field is required' } };

      const { schema, name } = parseTable(table);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = ctx.supabase as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = schema === 'public' ? db.from(name) : db.schema(schema).from(name);
      query = query.select('*').eq('link_id', ctx.linkId);

      const { query: filtered } = applyFilter(query, filter);
      const { data, error } = await filtered.limit(1).maybeSingle();
      if (error) return { passed: false, detail: { error: error.message } };
      if (!data) return { passed: false, detail: { reason: 'no row found' } };

      const actual = getNestedValue(data as Record<string, unknown>, field);
      // eslint-disable-next-line eqeqeq
      const passed = actual == value;
      return { passed, detail: { field, expected: value, actual } };
    } catch (err) {
      return { passed: false, detail: { error: String(err) } };
    }
  }
}
