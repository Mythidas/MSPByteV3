import type { CheckConfig, ConditionOperator } from '@workspace/core/types/contracts/compliance';
import type { CheckEvaluator, EvalContext, EvalResult } from '../checkTypeRegistry';
import { applyFilter, getNestedValue, evalFieldOp } from '../utils/applyFilter';

function parseTable(table: string): { schema: string; name: string } {
  const parts = table.split('.');
  if (parts.length === 2) return { schema: parts[0], name: parts[1] };
  return { schema: 'public', name: parts[0] };
}

export class FieldCompareEvaluator implements CheckEvaluator {
  async evaluate(config: unknown, ctx: EvalContext): Promise<EvalResult> {
    try {
      const { table, filter, field, op = 'eq', value } = config as CheckConfig & {
        op?: ConditionOperator;
      };

      if (!field) {
        return { passed: false, detail: { error: 'check_config.field is required' } };
      }

      const { schema, name } = parseTable(table);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = ctx.supabase as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = schema === 'public' ? db.from(name) : db.schema(schema).from(name);
      query = query.select('*').eq('link_id', ctx.linkId);

      const { query: filtered, jsFilter } = applyFilter(query, filter);
      const { data, error } = await filtered.limit(jsFilter ? 1000 : 1).maybeSingle();

      if (error) return { passed: false, detail: { error: error.message } };

      const row = jsFilter ? (jsFilter([data].filter(Boolean))[0] ?? null) : data;

      if (!row) {
        return { passed: false, detail: { reason: 'no matching row found' } };
      }

      const actual = getNestedValue(row as Record<string, unknown>, field);
      const passed = evalFieldOp(actual, op, value);

      return { passed, detail: { field, op, expected: value, actual } };
    } catch (err) {
      return { passed: false, detail: { error: String(err) } };
    }
  }
}
