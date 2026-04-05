import { Logger } from "@workspace/shared/lib/utils/logger";

const DEFAULT_RETRY_MS = 5_000;
class RetryError extends Error {
  constructor(
    public message: string,
    public response: Response,
    public status: number,
  ) {
    super(message);
  }
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  module: string,
  context: string,
  maxRetries = 5,
  options?: {
    respectRetryAfter?: boolean;
  },
): Promise<Response> {
  Logger.trace({
    module,
    context,
    message: `Starting fetch on url: ${url}`,
  });

  const { respectRetryAfter = true } = options ?? {};

  try {
    return await withRetry(
      async () => {
        const response = await fetch(url, init);

        if (response.status === 429) {
          const error: RetryError = new RetryError(
            `Rate limited (429)`,
            response,
            429,
          );
          throw error;
        }

        return response;
      },
      maxRetries,
      {
        baseDelayMs: DEFAULT_RETRY_MS,
        module,
        context,
        respectRetryAfter,
      },
    );
  } catch (err: unknown) {
    if (err instanceof RetryError) {
      // Final failure after all retries
      if (err?.status === 429 && err.response) {
        Logger.warn({
          module,
          context,
          message: `429 persisted after ${maxRetries} retries`,
        });
        return err.response;
      }
    }

    throw err;
  }
}

/**
 * Generic retry wrapper with exponential backoff + jitter.
 * Supports respecting Retry-After header via thrown errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  options?: {
    baseDelayMs?: number;
    module?: string;
    context?: string;
    respectRetryAfter?: boolean;
  },
): Promise<T> {
  const {
    baseDelayMs = DEFAULT_RETRY_MS,
    module = "retry",
    context = "withRetry",
    respectRetryAfter = true,
  } = options ?? {};

  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      if (attempt === maxRetries) break;

      let waitMs = baseDelayMs * 2 ** attempt;

      if (err instanceof RetryError) {
        // Respect Retry-After if enabled and present
        if (respectRetryAfter && err?.response?.headers) {
          const retryAfter = err.response.headers.get("Retry-After");
          if (retryAfter) {
            const parsed = parseInt(retryAfter, 10);
            if (!isNaN(parsed)) {
              waitMs = parsed * 1000;
              Logger.info({
                module,
                context,
                message: `Using Retry-After header: ${waitMs}ms`,
              });
            }
          }
        }
      }

      const jitter = waitMs * 0.2 * Math.random();
      waitMs = Math.floor(waitMs + jitter);

      Logger.warn({
        module,
        context,
        message: `Attempt ${attempt + 1}/${maxRetries} failed. Retrying in ${waitMs}ms`,
      });

      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  throw lastErr;
}
