import type { CheckConfig } from '@workspace/core/types/contracts/compliance';
import type { CheckEvaluator, EvalContext, EvalResult } from '../checkTypeRegistry';
import { applyFilter } from '../utils/applyFilter';

function parseTable(table: string): { schema: string; name: string } {
  const parts = table.split('.');
  if (parts.length === 2) return { schema: parts[0], name: parts[1] };
  return { schema: 'public', name: parts[0] };
}

export class PolicyNotExistsEvaluator implements CheckEvaluator {
  async evaluate(config: unknown, ctx: EvalContext): Promise<EvalResult> {
    try {
      const { table, filter } = config as CheckConfig;
      const { schema, name } = parseTable(table);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = ctx.supabase as any;

      const { jsFilter } = applyFilter(null, filter);

      if (jsFilter) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query: any = schema === 'public' ? db.from(name) : db.schema(schema).from(name);
        query = query.select('*').eq('link_id', ctx.linkId);
        const { query: filtered } = applyFilter(query, filter);
        const { data, error } = await filtered;
        if (error) return { passed: false, detail: { error: error.message } };
        const rows = jsFilter(data ?? []);
        return { passed: rows.length === 0, detail: { count: rows.length } };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = schema === 'public' ? db.from(name) : db.schema(schema).from(name);
      query = query.select('*', { count: 'exact', head: true }).eq('link_id', ctx.linkId);
      const { query: filtered } = applyFilter(query, filter);
      const { count, error } = await filtered;
      if (error) return { passed: false, detail: { error: error.message } };
      return { passed: (count ?? 0) === 0, detail: { count: count ?? 0 } };
    } catch (err) {
      return { passed: false, detail: { error: String(err) } };
    }
  }
}
