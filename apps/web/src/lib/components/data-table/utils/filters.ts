import type { FilterOperator, TableFilter } from "../types";
import { getNestedValue } from "./nested";
import { OPERATOR_LABELS } from "./operators";

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
    .join(";");
}

/**
 * Deserialize filters from URL string
 */
export function deserializeFilters(str: string): TableFilter[] {
  if (!str) return [];

  try {
    return str.split(";").map((part) => {
      const [id, field, operator, value] = part.split("|");
      return {
        id: decodeURIComponent(id),
        field: decodeURIComponent(field),
        operator: decodeURIComponent(operator) as FilterOperator,
        value: JSON.parse(decodeURIComponent(value)),
      };
    });
  } catch (error) {
    console.error("Failed to deserialize filters:", error);
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
export function formatFilterValue(value: any): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (value instanceof Date) {
    return value.toLocaleDateString();
  }
  return String(value);
}
