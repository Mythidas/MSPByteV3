import { Logger } from "@workspace/shared/lib/utils/logger";

const DEFAULT_RETRY_MS = 5_000;

/**
 * Wraps fetch with automatic retry on 429 (rate-limited) responses.
 * Respects the Retry-After header when present.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  module: string,
  context: string,
  maxRetries = 5,
): Promise<Response> {
  Logger.trace({
    module,
    context,
    message: `Starting fetch on url: ${url}`,
  });

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, init);
    if (response.status !== 429) return response;

    if (attempt === maxRetries) {
      Logger.warn({
        module,
        context,
        message: `429 persisted after ${maxRetries} retries`,
      });
      return response;
    }

    const waitMs = DEFAULT_RETRY_MS * (attempt + 1);
    Logger.warn({
      module,
      context,
      message: `429 rate limited. Waiting ${waitMs}ms (retry ${attempt + 1}/${maxRetries})`,
    });
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
  }

  throw new Error("fetchWithRetry: exceeded retry logic");
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  options?: { baseDelayMs?: number; module?: string; context?: string },
): Promise<T> {
  const {
    baseDelayMs = 1_000,
    module = "retry",
    context = "withRetry",
  } = options ?? {};

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
