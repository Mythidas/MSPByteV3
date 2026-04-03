import type { Microsoft365Connector } from './connector';
import { MS_CAPABILITIES } from '../../../config/integrations/microsoft-365';
import type { MSCapabilities, MSCapabilityKey } from '../../../types/integrations/microsoft/capabilities';

/**
 * Detects which premium capabilities are available in a tenant by inspecting
 * its subscribed SKU service plans. Receives a connector already scoped to the target tenant.
 */
export class TenantCapabilityService {
  constructor(private connector: Microsoft365Connector) {}

  async probe(): Promise<MSCapabilities> {
    const skus = await this.connector.subscribedSkus.listAll();

    const activePlans = new Set<string>(
      skus.flatMap((sku) => sku.servicePlans.map((sp) => sp.servicePlanName))
    );

    // Object.keys/Object.fromEntries on Record<MSCapabilityKey, ...> — narrowing casts are safe here
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const keys = Object.keys(MS_CAPABILITIES) as MSCapabilityKey[];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return Object.fromEntries(
      keys.map((key) => [
        key,
        MS_CAPABILITIES[key].servicePlans.some((plan) => activePlans.has(plan)),
      ])
    ) as MSCapabilities;
  }
}
