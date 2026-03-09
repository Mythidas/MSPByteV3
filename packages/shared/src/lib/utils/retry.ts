import { Logger } from '@workspace/shared/lib/utils/logger';

/**
 * Retries an async function with exponential backoff on failure.
 * Delay doubles each attempt: baseDelayMs, 2×, 4×, ...
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  options?: { baseDelayMs?: number; module?: string; context?: string }
): Promise<T> {
  const { baseDelayMs = 1_000, module = 'retry', context = 'withRetry' } = options ?? {};

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries) break;

      const waitMs = baseDelayMs * 2 ** attempt;
      Logger.warn({
        module,
        context,
        message: `Attempt ${attempt + 1}/${maxRetries} failed. Retrying in ${waitMs}ms`,
      });
      await new Promise<void>((r) => setTimeout(r, waitMs));
    }
  }

  throw lastErr;
}
