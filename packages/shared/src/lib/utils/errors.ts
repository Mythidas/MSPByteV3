/**
 * Returns a safe, user-facing error message that never exposes stack traces
 * or raw pg error strings. Use this in fail() and message() calls instead of
 * String(err).
 */
export function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'An unexpected error occurred';
}
