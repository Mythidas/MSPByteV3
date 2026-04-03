import { Microsoft365Connector } from '@workspace/shared/lib/integrations/microsoft-365/connector';
import { TenantCapabilityService } from '@workspace/shared/lib/integrations/microsoft-365/tenant-capability-service';
import { withRetry } from '@workspace/shared/lib/utils/fetch-with-retry';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { parseSafeErrorMessage } from '@workspace/shared/lib/utils/validators';
import type { MSCapabilities } from '@workspace/shared/types/integrations/microsoft/capabilities';

const DEFAULT_RETRY = { maxRetries: 5, baseDelayMs: 2_000, module: 'capabilities' } as const;

export async function probeCapabilities(
  connector: Microsoft365Connector,
  opts?: { maxRetries?: number; baseDelayMs?: number; context?: string }
): Promise<MSCapabilities | null> {
  const maxRetries = opts?.maxRetries ?? DEFAULT_RETRY.maxRetries;
  const baseDelayMs = opts?.baseDelayMs ?? DEFAULT_RETRY.baseDelayMs;
  const context = opts?.context ?? 'probe';
  try {
    const result = await withRetry(
      async () => {
        connector.clearTokenCache();
        return new TenantCapabilityService(connector).probe();
      },
      maxRetries,
      { baseDelayMs, module: DEFAULT_RETRY.module, context }
    );
    return result ?? null;
  } catch (err) {
    Logger.warn({ module: DEFAULT_RETRY.module, context, message: parseSafeErrorMessage(err) });
    return null;
  }
}
