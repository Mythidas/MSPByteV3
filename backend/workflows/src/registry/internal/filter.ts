import type { FilterNodeConfig, FilterNodeOutput, FilterRule, Row } from '../../types.js';

function getNestedValue(obj: Row, dotPath: string): unknown {
  const parts = dotPath.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateRule(row: Row, rule: FilterRule): boolean {
  const val = getNestedValue(row, rule.field);

  switch (rule.operator) {
    case 'exists':
      return val !== null && val !== undefined;
    case 'not_exists':
      return val === null || val === undefined;
    case 'eq':
      return val === rule.value;
    case 'neq':
      return val !== rule.value;
    case 'in':
      return Array.isArray(rule.value) && rule.value.includes(val);
    case 'nin':
      return Array.isArray(rule.value) && !rule.value.includes(val);
    case 'gt':
      return typeof val === 'number' && typeof rule.value === 'number'
        ? val > rule.value
        : String(val) > String(rule.value);
    case 'lt':
      return typeof val === 'number' && typeof rule.value === 'number'
        ? val < rule.value
        : String(val) < String(rule.value);
    default:
      return false;
  }
}

function rowMatchesRules(row: Row, rules: FilterRule[], matchMode: 'all' | 'any'): boolean {
  if (rules.length === 0) return true;
  if (matchMode === 'all') return rules.every((r) => evaluateRule(row, r));
  return rules.some((r) => evaluateRule(row, r));
}

export function executeFilterNode(config: FilterNodeConfig, rows: Row[]): FilterNodeOutput {
  const inRows: Row[] = [];
  const outRows: Row[] = [];
  const inIds: string[] = [];
  const outIds: string[] = [];

  for (const row of rows) {
    const matches = rowMatchesRules(row, config.rules, config.match_mode);
    const id = String(getNestedValue(row, config.source_field) ?? '');

    if (matches) {
      inRows.push(row);
      if (id) inIds.push(id);
    } else {
      outRows.push(row);
      if (id) outIds.push(id);
    }
  }

  return { in: inRows, out: outRows, in_ids: inIds, out_ids: outIds };
}
