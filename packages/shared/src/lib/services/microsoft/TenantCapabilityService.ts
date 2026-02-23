import type { Microsoft365Connector } from '../../connectors/Microsoft365Connector.js';
import { Logger } from '../../utils/logger.js';
import type { APIResponse } from '../../utils/logger.js';
import { CAPABILITY_SERVICE_PLANS } from '../../../config/microsoft.js';
import type { MSCapabilities, MSCapabilityKey } from '../../../types/integrations/microsoft/capabilities.js';

/**
 * Detects which premium capabilities are available in a tenant by inspecting
 * its subscribed SKU service plans. Receives a connector already scoped to the target tenant.
 */
export class TenantCapabilityService {
  constructor(private connector: Microsoft365Connector) {}

  async probe(): Promise<APIResponse<MSCapabilities>> {
    const { data, error } = await this.connector.getSubscribedSkus(undefined, true);
    if (error || !data) {
      return Logger.error({
        module: 'TenantCapabilityService',
        context: 'probe',
        message: error?.message ?? 'No SKU data',
      });
    }

    // Collect all service plan names present in any subscribed SKU
    const activePlans = new Set<string>(
      data.skus.flatMap((sku) => sku.servicePlans.map((sp) => sp.servicePlanName))
    );

    const capabilities = {} as MSCapabilities;
    for (const [key, requiredPlans] of Object.entries(CAPABILITY_SERVICE_PLANS) as [
      MSCapabilityKey,
      string[],
    ][]) {
      capabilities[key] = requiredPlans.some((plan) => activePlans.has(plan));
    }

    return { data: capabilities };
  }
}
