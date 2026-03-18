import type { AdapterContract } from "@workspace/core/types/contracts/adapter";
import type { IntegrationId } from "@workspace/core/types/integrations";

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

export class AdapterRegistry {
  private adapters = new Map<IntegrationId, AdapterContract>();

  register(integrationId: IntegrationId, adapter: AdapterContract): void {
    this.adapters.set(integrationId, adapter);
  }

  resolve(integrationId: IntegrationId): AdapterContract {
    const adapter = this.adapters.get(integrationId);
    if (!adapter) {
      throw new NotImplementedError(
        `Adapter not implemented: ${integrationId} — register in Phase 3`,
      );
    }
    return adapter;
  }
}

export const adapterRegistry = new AdapterRegistry();
