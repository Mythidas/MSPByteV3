import { Json } from "@workspace/shared/types/schema";

export function isJson(value: unknown): value is Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJson);
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every(
      (v) => v === undefined || isJson(v),
    );
  }

  return false;
}
