/**
 * Composable, type-safe connector filtering interface.
 *
 * Modeled after the Supabase ORM pattern — filters are expressed as typed
 * field/op/value tuples over the entity's own fields, not as connector-specific
 * parameters. Connectors translate these into their API's native format where
 * supported (e.g. OData $filter for Graph, query params for HaloPSA), and
 * post-filter in-memory for ops the API doesn't support server-side.
 *
 * Use `LocalFilters<T>` for connectors that always fetch all data and apply
 * filtering/sorting/limiting in-memory. This omits `select` (would change the
 * return type to Partial<T>[]) and `cursor` (internal pagination is not exposed).
 */

export type FilterOp =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'in'
  | 'lt'
  | 'gt'
  | 'lte'
  | 'gte';

export type FieldFilter<T> = {
  field: keyof T;
  op: FilterOp;
  value: unknown;
};

export type FilterClause<T> =
  | FieldFilter<T>
  | { and: FilterClause<T>[] }
  | { or: FilterClause<T>[] };

export interface ConnectorFilters<T> {
  select?: (keyof T)[];
  where?: FilterClause<T>[];
  sort?: { field: keyof T; direction: 'asc' | 'desc' };
  limit?: number;
  /** Opaque pagination token (nextLink URL, page number, cursor string, etc.) */
  cursor?: string;
}

/**
 * Filters for connectors that always fetch all data in-memory.
 * Omits `select` (keeps return type as T[]) and `cursor` (internal pagination).
 */
export type LocalFilters<T> = Omit<ConnectorFilters<T>, 'select' | 'cursor'>;

/**
 * Applies a single FilterClause to a record in-memory.
 * Use this when the API doesn't support the op server-side.
 */
export function matchesFilter<T extends Record<string, unknown>>(
  item: T,
  clause: FilterClause<T>
): boolean {
  if ('and' in clause) {
    return clause.and.every((c) => matchesFilter(item, c));
  }
  if ('or' in clause) {
    return clause.or.some((c) => matchesFilter(item, c));
  }

  const { field, op, value } = clause as FieldFilter<T>;
  const fieldValue = item[field as string];

  switch (op) {
    case 'eq':
      return fieldValue === value;
    case 'neq':
      return fieldValue !== value;
    case 'contains':
      return (
        typeof fieldValue === 'string' &&
        fieldValue.toLowerCase().includes(String(value).toLowerCase())
      );
    case 'startsWith':
      return (
        typeof fieldValue === 'string' &&
        fieldValue.toLowerCase().startsWith(String(value).toLowerCase())
      );
    case 'endsWith':
      return (
        typeof fieldValue === 'string' &&
        fieldValue.toLowerCase().endsWith(String(value).toLowerCase())
      );
    case 'in':
      return Array.isArray(value) && value.includes(fieldValue);
    case 'lt':
      return typeof fieldValue === 'number' && fieldValue < (value as number);
    case 'gt':
      return typeof fieldValue === 'number' && fieldValue > (value as number);
    case 'lte':
      return typeof fieldValue === 'number' && fieldValue <= (value as number);
    case 'gte':
      return typeof fieldValue === 'number' && fieldValue >= (value as number);
    default:
      return true;
  }
}

/**
 * Post-processes an array of items: filters by where clauses, sorts, and limits.
 * Used by connectors that fetch all data then apply filtering in-memory.
 */
export function applyFilters<T extends Record<string, unknown>>(
  items: T[],
  filters?: LocalFilters<T>
): T[] {
  let result = filters?.where?.length
    ? items.filter((item) => filters.where!.every((clause) => matchesFilter(item, clause)))
    : items;

  if (filters?.sort) {
    const { field, direction } = filters.sort;
    result = [...result].sort((a, b) => {
      const cmp = String(a[field as string]).localeCompare(String(b[field as string]));
      return direction === 'desc' ? -cmp : cmp;
    });
  }

  if (filters?.limit) {
    result = result.slice(0, filters.limit);
  }

  return result;
}
