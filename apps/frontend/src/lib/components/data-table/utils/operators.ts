import type { FilterOperator } from "../types";

/**
 * Get available operators for each filter component type
 */
export const OPERATOR_MAP: Record<string, FilterOperator[]> = {
  text: ["eq", "neq", "like", "ilike"],
  select: ["eq", "neq", "in", "not.in"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte"],
  boolean: ["eq", "is"],
  date: ["eq", "neq", "gt", "gte", "lt", "lte"],
};

/**
 * Get default operator for a component type
 */
export function getDefaultOperator(
  component: keyof typeof OPERATOR_MAP,
): FilterOperator {
  const defaults: Record<string, FilterOperator> = {
    text: "ilike",
    select: "eq",
    number: "eq",
    boolean: "eq",
    date: "eq",
  };
  return defaults[component];
}

/**
 * Human readable labels for operators
 */
export const OPERATOR_LABELS: Partial<Record<FilterOperator, string>> = {
  eq: "equals",
  neq: "not equals",
  gt: "greater than",
  gte: "greater than or equal",
  lt: "less than",
  lte: "less than or equal",
  like: "contains",
  ilike: "contains (case insensitive)",
  is: "is",
  in: "in",
  cs: "contains",
  cd: "contained in",
  ov: "overlaps",
  "not.ov": "does not overlap",
  "not.eq": "not equals",
  "not.neq": "equals",
  "not.gt": "not greater than",
  "not.gte": "not greater than or equal",
  "not.lt": "not less than",
  "not.lte": "not less than or equal",
  "not.like": "does not contain",
  "not.ilike": "does not contain (case insensitive)",
  "not.is": "is not",
  "not.in": "not in",
  "not.cs": "does not contain",
  "not.cd": "not contained in",
};
