import { Microsoft365Connector } from '@workspace/shared/lib/connectors/Microsoft365Connector';
import { TenantCapabilityService } from '@workspace/shared/lib/services/microsoft/TenantCapabilityService';
import { withRetry } from '@workspace/shared/lib/utils/retry';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { safeErrorMessage } from '@workspace/shared/lib/utils/errors';
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
        const r = await new TenantCapabilityService(connector).probe();
        if (r.error) throw new Error(safeErrorMessage(r.error));
        return r;
      },
      maxRetries,
      { baseDelayMs, module: DEFAULT_RETRY.module, context }
    );
    return result.data ?? null;
  } catch (err) {
    Logger.warn({ module: DEFAULT_RETRY.module, context, message: safeErrorMessage(err) });
    return null;
  }
}
