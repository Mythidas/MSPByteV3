import type { FilterOperator, TableFilter } from '../types';
import { OPERATOR_LABELS, OPERATOR_MAP } from './operators';

const ALL_OPERATORS = new Set<string>(Object.values(OPERATOR_MAP).flat());

function isFilterOperator(s: string): s is FilterOperator {
  return ALL_OPERATORS.has(s);
}

function parseJsonSafe(s: string): unknown {
  return JSON.parse(s) as unknown;
}

/**
 * Generate a unique ID for a filter
 */
export function generateFilterId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Serialize filters to URL-safe string
 * Format: id|field|operator|value;id|field|operator|value
 */
export function serializeFilters(filters: TableFilter[]): string {
  return filters
    .map((f) => {
      const id = encodeURIComponent(f.id);
      const field = encodeURIComponent(f.field);
      const operator = encodeURIComponent(f.operator);
      const value = encodeURIComponent(JSON.stringify(f.value));
      return `${id}|${field}|${operator}|${value}`;
    })
    .join(';');
}

/**
 * Deserialize filters from URL string
 */
export function deserializeFilters(str: string): TableFilter[] {
  if (!str) return [];

  try {
    return str.split(';').map((part) => {
      const [id, field, operator, value] = part.split('|');
      const op = decodeURIComponent(operator);
      return {
        id: decodeURIComponent(id),
        field: decodeURIComponent(field),
        operator: isFilterOperator(op) ? op : 'eq',
        value: parseJsonSafe(decodeURIComponent(value)),
      };
    });
  } catch (error) {
    console.error('Failed to deserialize filters:', error);
    return [];
  }
}

/**
 * Get human-readable operator label
 */
export function getOperatorLabel(operator: FilterOperator): string {
  return OPERATOR_LABELS[operator] ?? operator;
}

/**
 * Format filter value for display
 */
export function formatFilterValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(String).join(', ');
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (value instanceof Date) {
    return value.toLocaleDateString();
  }
  return String(value);
}
