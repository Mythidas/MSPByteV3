/**
 * Masks a secret value for display in forms
 */
export function maskSecret(
  secret?: string,
  maskChar = "•",
  length = 10,
): string {
  return secret ? maskChar.repeat(length) : "";
}

/**
 * Checks if a value is a masked secret
 */
export function isMaskedSecret(value: string, maskChar = "•"): boolean {
  return value.split("").every((char) => char === maskChar);
}

/**
 * Prepares form data for submission, handling masked secrets
 * If a field is still masked, it uses the original value from existing config
 */
export function prepareSensitiveFormData<T extends Record<string, any>>(
  formData: T,
  existingConfig: Partial<T> | null,
  sensitiveFields: (keyof T)[],
): T {
  const prepared = { ...formData };

  for (const field of sensitiveFields) {
    const value = prepared[field];
    if (typeof value === "string" && isMaskedSecret(value)) {
      // Use existing value if field hasn't been modified
      prepared[field] = existingConfig?.[field] || value;
    }
  }

  return prepared;
}

/**
 * Type-safe form action result handler
 */
export type ActionResult<T = any> =
  | { type: "success"; data: T }
  | { type: "failure"; status: number; data?: { message?: string } }
  | { type: "redirect"; location: string; status: number }
  | { type: "error"; error: Error };

export function isActionSuccess<T>(
  result: ActionResult<T>,
): result is { type: "success"; data: T } {
  return result.type === "success";
}

export function isActionFailure(
  result: ActionResult,
): result is { type: "failure"; status: number; data?: { message?: string } } {
  return result.type === "failure";
}
