import type {
  ConditionGroup,
  CheckCondition,
  ConditionOperator,
} from "@workspace/core/types/contracts/compliance";
import { toPostgrestColumn, toPostgrestJsonColumn } from "@workspace/shared/lib/utils/supabase-helper";

const SIZE_OPS: ConditionOperator[] = ["size_eq", "size_gte", "size_lte"];

// Walks a dotted ingestPath against a row object.
export function getNestedValue(
  row: Record<string, unknown>,
  path: string,
): unknown {
  return path.split(".").reduce<unknown>((obj, key) => {
    if (obj != null && typeof obj === "object")
      return (obj as Record<string, unknown>)[key];
    return undefined;
  }, row);
}

function applySingleCondition(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  cond: CheckCondition,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const { field, op, value } = cond;
  const col = toPostgrestColumn(field);
  const jsonCol = toPostgrestJsonColumn(field);
  switch (op) {
    case "eq":
      return query.eq(col, value);
    case "neq":
      return query.neq(col, value);
    case "gt":
      return query.gt(col, value);
    case "gte":
      return query.gte(col, value);
    case "lt":
      return query.lt(col, value);
    case "lte":
      return query.lte(col, value);
    case "contains":
      return query.filter(jsonCol, "cs", JSON.stringify(Array.isArray(value) ? value : [value]));
    case "not_contains":
      return query.not(
        jsonCol,
        "cs",
        JSON.stringify(Array.isArray(value) ? value : [value]),
      );
    case "is_null":
      return query.is(col, null);
    case "is_not_null":
      return query.not(col, "is", null);
    default:
      return query;
  }
}

// Builds a single PostgREST OR-filter part, e.g. "policy_state.eq.enabled"
function toOrPart(cond: CheckCondition): string | null {
  const col = toPostgrestColumn(cond.field);
  const jsonCol = toPostgrestJsonColumn(cond.field);
  switch (cond.op) {
    case "is_null":
      return `${col}.is.null`;
    case "is_not_null":
      return `${col}.not.is.null`;
    case "contains": {
      const arr = Array.isArray(cond.value) ? cond.value : [cond.value];
      return `${jsonCol}.cs.${JSON.stringify(arr)}`;
    }
    case "not_contains": {
      const arr = Array.isArray(cond.value) ? cond.value : [cond.value];
      return `${jsonCol}.not.cs.${JSON.stringify(arr)}`;
    }
    case "eq":
    case "neq":
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      return `${col}.${cond.op}.${cond.value}`;
    default:
      return null;
  }
}

function matchSizeCondition(
  row: Record<string, unknown>,
  cond: CheckCondition,
): boolean {
  const val = getNestedValue(row, cond.field);
  const len = Array.isArray(val) ? val.length : 0;
  const target = Number(cond.value);
  switch (cond.op) {
    case "size_eq":
      return len === target;
    case "size_gte":
      return len >= target;
    case "size_lte":
      return len <= target;
    default:
      return true;
  }
}

/**
 * Applies a ConditionGroup to a Supabase query builder.
 *
 * Size operators (size_eq / size_gte / size_lte) cannot be expressed in PostgREST and are
 * returned as a `jsFilter` predicate to be applied after the rows are fetched.
 *
 * If `jsFilter` is present, the caller must:
 *   1. Use `select('*')` instead of `head: true`
 *   2. Apply `jsFilter(rows)` to the fetched rows before counting / inspecting them
 */
export function applyFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filter: ConditionGroup | undefined,
): {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jsFilter?: (rows: any[]) => any[];
} {
  if (!filter || filter.conditions.length === 0) return { query };

  const sizeConditions = filter.conditions.filter((c) =>
    SIZE_OPS.includes(c.op),
  );
  const dbConditions = filter.conditions.filter(
    (c) => !SIZE_OPS.includes(c.op),
  );

  if (dbConditions.length > 0 && query !== null) {
    if (filter.logic === "AND") {
      for (const cond of dbConditions) {
        query = applySingleCondition(query, cond);
      }
    } else {
      // OR — build PostgREST filter string
      const parts = dbConditions.map(toOrPart).filter(Boolean) as string[];
      if (parts.length > 0) query = query.or(parts.join(","));
    }
  }

  const jsFilter =
    sizeConditions.length > 0
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (rows: any[]) =>
          rows.filter((row) =>
            sizeConditions.every((c) => matchSizeCondition(row, c)),
          )
      : undefined;

  return { query, jsFilter };
}

/** Evaluate a single operator against two already-resolved values (used by FieldCompareEvaluator). */
export function evalFieldOp(
  actual: unknown,
  op: ConditionOperator,
  expected: unknown,
): boolean {
  switch (op) {
    case "eq":
      // eslint-disable-next-line eqeqeq
      return actual == expected;
    case "neq":
      // eslint-disable-next-line eqeqeq
      return actual != expected;
    case "gt":
      return (actual as number) > (expected as number);
    case "gte":
      return (actual as number) >= (expected as number);
    case "lt":
      return (actual as number) < (expected as number);
    case "lte":
      return (actual as number) <= (expected as number);
    case "contains":
      return Array.isArray(actual) && actual.includes(expected);
    case "not_contains":
      return !Array.isArray(actual) || !actual.includes(expected);
    case "size_eq":
      return Array.isArray(actual) && actual.length === Number(expected);
    case "size_gte":
      return Array.isArray(actual) && actual.length >= Number(expected);
    case "size_lte":
      return Array.isArray(actual) && actual.length <= Number(expected);
    case "is_null":
      return actual === null || actual === undefined;
    case "is_not_null":
      return actual !== null && actual !== undefined;
    default:
      return false;
  }
}
