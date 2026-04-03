import {
  toPostgrestColumn,
  toPostgrestJsonColumn,
} from "@workspace/shared/lib/utils/supabase-helper";
import type {
  ConditionOperator,
  CheckCondition,
  ConditionGroup,
} from "@workspace/shared/types/jobs/contracts/compliance";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostgrestFilterBuilder } from "@supabase/postgrest-js";
import z from "zod";
import { isRecord } from "@workspace/shared/lib/utils/validators";

export type AnyQueryBuilder = PostgrestFilterBuilder<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  Record<string, unknown>[],
  string,
  unknown,
  "GET"
>;

type SelectOptions = {
  count?: "exact" | "estimated" | "planned";
  head?: boolean;
};

const OpSchema = z.enum([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "not_contains",
  "size_eq",
  "size_gte",
  "size_lte",
  "is_null",
  "is_not_null",
]);

export const CheckConfigSchema = z
  .object({
    table: z.string(),
    filter: z
      .object({
        logic: z.enum(["AND", "OR"]),
        conditions: z.array(
          z.object({
            field: z.string(),
            op: OpSchema,
            value: z.unknown(),
          }),
        ),
      })
      .optional(),
    threshold: z.number(),
    field: z.string(),
    op: OpSchema,
    value: z.unknown(),
  })
  .catch({ table: "", threshold: 1, field: "", op: "eq", value: "" });

export function buildDynamicQuery(
  supabase: SupabaseClient,
  schema: string,
  name: string,
  columns = "*",
  options?: SelectOptions,
): AnyQueryBuilder {
  const client = supabase;
  const builder =
    schema === "public" ? client.from(name) : client.schema(schema).from(name);
  return builder.select(columns, options);
}

const SIZE_OPS: ConditionOperator[] = ["size_eq", "size_gte", "size_lte"];

export function getNestedValue(
  row: Record<string, unknown>,
  path: string,
): unknown {
  return path.split(".").reduce<unknown>((obj, key) => {
    if (isRecord(obj)) {
      return obj[key];
    }
    return undefined;
  }, row);
}

function applySingleCondition(
  query: AnyQueryBuilder,
  cond: CheckCondition,
): AnyQueryBuilder {
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
      return query.filter(
        jsonCol,
        "cs",
        JSON.stringify(Array.isArray(value) ? value : [value]),
      );
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
      return `${col}.${cond.op}.${String(cond.value)}`;
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

export function computeJsFilter(
  filter?: ConditionGroup,
):
  | ((rows: Record<string, unknown>[]) => Record<string, unknown>[])
  | undefined {
  if (!filter || filter.conditions.length === 0) return undefined;
  const sizeConditions = filter.conditions.filter((c) =>
    SIZE_OPS.includes(c.op),
  );
  if (sizeConditions.length === 0) return undefined;
  return (rows) =>
    rows.filter((row) =>
      sizeConditions.every((c) => matchSizeCondition(row, c)),
    );
}

export function applyFilter(
  query: AnyQueryBuilder,
  filter: ConditionGroup | undefined,
): {
  query: AnyQueryBuilder;
  jsFilter?: (rows: Record<string, unknown>[]) => Record<string, unknown>[];
} {
  if (!filter || filter.conditions.length === 0) return { query };

  const sizeConditions = filter.conditions.filter((c) =>
    SIZE_OPS.includes(c.op),
  );
  const dbConditions = filter.conditions.filter(
    (c) => !SIZE_OPS.includes(c.op),
  );

  let q = query;
  if (dbConditions.length > 0) {
    if (filter.logic === "AND") {
      for (const cond of dbConditions) {
        q = applySingleCondition(q, cond);
      }
    } else {
      const parts = dbConditions.map(toOrPart).filter(Boolean);
      if (parts.length > 0) q = q.or(parts.join(","));
    }
  }

  const jsFilter =
    sizeConditions.length > 0
      ? (rows: Record<string, unknown>[]) =>
          rows.filter((row) =>
            sizeConditions.every((c) => matchSizeCondition(row, c)),
          )
      : undefined;

  return { query: q, jsFilter };
}

export function evalFieldOp(
  actual: unknown,
  op: ConditionOperator,
  expected: unknown,
): boolean {
  switch (op) {
    case "eq":
      return actual == expected;
    case "neq":
      return actual != expected;
    case "gt":
      return Number(actual) > Number(expected);
    case "gte":
      return Number(actual) >= Number(actual);
    case "lt":
      return Number(actual) < Number(actual);
    case "lte":
      return Number(actual) <= Number(actual);
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
