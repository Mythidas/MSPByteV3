import { ZodError } from "zod";

/**
 * Base error class for all backend packages.
 *
 * - `userMessage` is safe to display in a UI.
 * - `context`     is structured debug data (tenantId, checkId, field, etc.).
 * - `cause`       is the original error, preserving its stack trace.
 *
 * Usage at throw site:
 *   throw new AppError("human msg", { tenantId, checkId }, { cause: originalErr });
 *
 * Usage at catch boundary:
 *   const e = toAppError(err, "human msg", { field, op, value });
 *   Logger.error({ module, context, message: e.userMessage, err: e });
 *   return { passed: false, detail: { error: e.userMessage, context: e.context } };
 */
export class AppError extends Error {
  constructor(
    public readonly userMessage: string,
    public readonly context: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(userMessage, options);
    this.name = "AppError";
  }

  /** Returns context + cause info suitable for Logger meta. */
  toLogMeta(): Record<string, unknown> {
    const cause = this.cause;
    const causeInfo =
      cause instanceof Error
        ? { causeMessage: cause.message, causeStack: cause.stack }
        : cause !== undefined
          ? { cause }
          : {};
    return { ...this.context, ...causeInfo };
  }
}

/** Thrown when a configuration object fails schema validation. */
export class ConfigError extends AppError {
  constructor(
    userMessage: string,
    context: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(userMessage, context, options);
    this.name = "ConfigError";
  }
}

/** Thrown when input data fails validation (Zod, manual checks, etc.). */
export class ValidationError extends AppError {
  constructor(
    userMessage: string,
    context: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(userMessage, context, options);
    this.name = "ValidationError";
  }
}

/**
 * Converts a ZodError into a readable string like:
 *   "field: Required; op: Invalid enum value; value: Required"
 */
export function formatZodError(err: ZodError): string {
  return err.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}

/**
 * Converts any caught value into an AppError.
 *
 * - AppError   → returned as-is (context/message optionally augmented)
 * - ZodError   → readable field-level message via formatZodError
 * - Error      → wrapped with cause chain
 * - other      → String(value)
 */
export function toAppError(
  err: unknown,
  userMessage?: string,
  context?: Record<string, unknown>,
): AppError {
  if (err instanceof AppError) {
    return err;
  }

  if (err instanceof ZodError) {
    const detail = formatZodError(err);
    return new ValidationError(
      userMessage ?? `Validation failed: ${detail}`,
      { zodErrors: err.issues, ...context },
      { cause: err },
    );
  }

  if (err instanceof Error) {
    return new AppError(userMessage ?? err.message, context ?? {}, {
      cause: err,
    });
  }

  return new AppError(userMessage ?? String(err), context ?? {});
}
