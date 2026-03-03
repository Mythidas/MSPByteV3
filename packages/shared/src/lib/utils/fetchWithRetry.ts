import { Logger } from '@workspace/shared/lib/utils/logger';

const DEFAULT_RETRY_MS = 60_000;

/**
 * Wraps fetch with automatic retry on 429 (rate-limited) responses.
 * Respects the Retry-After header when present.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  module: string,
  context: string,
  maxRetries = 5
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

    const retryAfter = response.headers.get('Retry-After');
    const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : DEFAULT_RETRY_MS;
    Logger.warn({
      module,
      context,
      message: `429 rate limited. Waiting ${waitMs}ms (retry ${attempt + 1}/${maxRetries})`,
    });
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
  }

  throw new Error('fetchWithRetry: exceeded retry logic');
}
