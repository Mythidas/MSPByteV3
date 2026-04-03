import type { Json } from "@workspace/shared/types/schema";

export function isString(value: unknown): value is string {
  return typeof value === "string";
}
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
    return Object.values(value).every((v) => v === undefined || isJson(v));
  }

  return false;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseSafeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
