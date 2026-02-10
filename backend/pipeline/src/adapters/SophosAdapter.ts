import { BaseAdapter } from './BaseAdapter.js';
import { Logger } from '../lib/logger.js';
import { getSupabase } from '../supabase.js';
import { SophosPartnerConnector } from '@workspace/shared/lib/connectors/SophosConnector.js';
import type { SyncJobData, AdapterFetchResult } from '../types.js';

/**
 * SophosAdapter - Syncs endpoints, firewalls, licenses
 * Uses existing SophosPartnerConnector from shared package.
 * Sophos is multi-tenant: partner credentials → per-tenant API calls.
 */
export class SophosAdapter extends BaseAdapter {
  constructor() {
    super('sophos-partner');
  }

  protected getAdapterName(): string {
    return 'SophosAdapter';
  }

  protected async fetchData(jobData: SyncJobData): Promise<AdapterFetchResult> {
    const { tenantId, integrationDbId, entityType } = jobData;
    const config = await this.getIntegrationConfig(integrationDbId);
    const connector = new SophosPartnerConnector(config);

    const { data: healthy } = await connector.checkHealth();
    if (!healthy) throw new Error(`Sophos health check failed for ${integrationDbId}`);

    switch (entityType) {
      case 'endpoint':
        return this.handleEndpointSync(connector, tenantId, integrationDbId);
      case 'firewall':
        return this.handleFirewallSync(connector, tenantId, integrationDbId);
      case 'license':
        return this.handleLicenseSync(connector, tenantId, integrationDbId);
      default:
        throw new Error(`Unsupported entity type for Sophos: ${entityType}`);
    }
  }

  /**
   * Get Sophos tenant configs from site_to_integration mappings.
   * Each site maps to a Sophos tenant via external_id.
   */
  private async getSophosTenantConfigs(
    connector: SophosPartnerConnector,
    tenantId: number,
    integrationDbId: string,
  ): Promise<{ tenantConfig: any; siteId: number }[]> {
    const supabase = getSupabase();

    // Get site mappings for this integration
    const { data: mappings } = await supabase
      .from('site_to_integration')
      .select('site_id, external_id')
      .eq('integration_id', integrationDbId)
      .eq('tenant_id', tenantId);

    if (!mappings || mappings.length === 0) {
      // No site mappings — fetch tenants directly and return all
      const { data: tenants } = await connector.getTenants();
      return (tenants || []).map((t: any) => ({
        tenantConfig: { tenantId: t.id, apiHost: t.apiHost },
        siteId: 0,
      }));
    }

    // Map external_id to Sophos tenant configs
    const { data: tenants } = await connector.getTenants();
    const tenantMap = new Map<string, any>((tenants || []).map((t: any) => [t.id, t]));

    return mappings
      .map((m) => {
        const t = tenantMap.get(m.external_id!);
        if (!t) return null;
        return {
          tenantConfig: { tenantId: t.id, apiHost: t.apiHost },
          siteId: m.site_id,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  private async handleEndpointSync(
    connector: SophosPartnerConnector,
    tenantId: number,
    integrationDbId: string,
  ): Promise<AdapterFetchResult> {
    const tenantConfigs = await this.getSophosTenantConfigs(connector, tenantId, integrationDbId);
    const allEntities: any[] = [];

    for (const { tenantConfig, siteId } of tenantConfigs) {
      this.metrics.trackApiCall();
      const { data: endpoints, error } = await connector.getEndpoints(tenantConfig);
      if (error) {
        Logger.log({
          module: 'SophosAdapter',
          context: 'handleEndpointSync',
          message: `Failed to fetch endpoints for tenant ${tenantConfig.tenantId}: ${error.message}`,
          level: 'warn',
        });
        continue;
      }

      for (const rawData of endpoints || []) {
        allEntities.push({
          externalId: rawData.id,
          displayName: rawData.hostname,
          siteId: siteId || undefined,
          rawData,
        });
      }
    }

    Logger.log({
      module: 'SophosAdapter',
      context: 'handleEndpointSync',
      message: `Fetched ${allEntities.length} endpoints from ${tenantConfigs.length} tenants`,
      level: 'trace',
    });

    return { entities: allEntities, pagination: { hasMore: false } };
  }

  private async handleFirewallSync(
    connector: SophosPartnerConnector,
    tenantId: number,
    integrationDbId: string,
  ): Promise<AdapterFetchResult> {
    const tenantConfigs = await this.getSophosTenantConfigs(connector, tenantId, integrationDbId);
    const allEntities: any[] = [];

    for (const { tenantConfig, siteId } of tenantConfigs) {
      this.metrics.trackApiCall();
      const { data: firewalls, error } = await connector.getFirewalls(tenantConfig);
      if (error) {
        Logger.log({
          module: 'SophosAdapter',
          context: 'handleFirewallSync',
          message: `Failed to fetch firewalls for tenant ${tenantConfig.tenantId}: ${error.message}`,
          level: 'warn',
        });
        continue;
      }

      for (const rawData of firewalls || []) {
        allEntities.push({
          externalId: rawData.id,
          displayName: rawData.hostname || rawData.serialNumber,
          siteId: siteId || undefined,
          rawData,
        });
      }
    }

    Logger.log({
      module: 'SophosAdapter',
      context: 'handleFirewallSync',
      message: `Fetched ${allEntities.length} firewalls`,
      level: 'trace',
    });

    return { entities: allEntities, pagination: { hasMore: false } };
  }

  private async handleLicenseSync(
    connector: SophosPartnerConnector,
    tenantId: number,
    integrationDbId: string,
  ): Promise<AdapterFetchResult> {
    const tenantConfigs = await this.getSophosTenantConfigs(connector, tenantId, integrationDbId);
    const allEntities: any[] = [];

    for (const { tenantConfig, siteId } of tenantConfigs) {
      this.metrics.trackApiCall();
      const { data: licenseData, error } = await connector.getLicenses(tenantConfig);
      if (error) {
        Logger.log({
          module: 'SophosAdapter',
          context: 'handleLicenseSync',
          message: `Failed to fetch licenses for tenant ${tenantConfig.tenantId}: ${error.message}`,
          level: 'warn',
        });
        continue;
      }

      if (licenseData?.licenses) {
        for (const license of licenseData.licenses) {
          allEntities.push({
            externalId: `${tenantConfig.tenantId}:${license.id || license.product}`,
            displayName: license.product,
            siteId: siteId || undefined,
            rawData: license,
          });
        }
      }
    }

    Logger.log({
      module: 'SophosAdapter',
      context: 'handleLicenseSync',
      message: `Fetched ${allEntities.length} licenses`,
      level: 'trace',
    });

    return { entities: allEntities, pagination: { hasMore: false } };
  }
}
