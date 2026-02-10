import { BaseAdapter } from './BaseAdapter.js';
import { Logger } from '../lib/logger.js';
import { getSupabase } from '../supabase.js';
import { DattoRMMConnector } from '@workspace/shared/lib/connectors/DattoRMMConnector.js';
import type { SyncJobData, AdapterFetchResult } from '../types.js';

/**
 * DattoRMMAdapter - Syncs device_sites (sites) and endpoints (devices)
 * Uses existing DattoRMMConnector from shared package.
 */
export class DattoRMMAdapter extends BaseAdapter {
  constructor() {
    super('dattormm');
  }

  protected getAdapterName(): string {
    return 'DattoRMMAdapter';
  }

  protected async fetchData(jobData: SyncJobData): Promise<AdapterFetchResult> {
    const { integrationDbId, entityType, tenantId } = jobData;
    const config = await this.getIntegrationConfig(integrationDbId);
    const connector = new DattoRMMConnector(config);

    const { data: healthy } = await connector.checkHealth();
    if (!healthy) throw new Error(`DattoRMM health check failed for ${integrationDbId}`);

    switch (entityType) {
      case 'device_site':
        return this.handleSiteSync(connector);
      case 'endpoint':
        return this.handleEndpointSync(connector, tenantId, integrationDbId);
      default:
        throw new Error(`Unsupported entity type for DattoRMM: ${entityType}`);
    }
  }

  private async handleSiteSync(connector: DattoRMMConnector): Promise<AdapterFetchResult> {
    this.metrics.trackApiCall();
    const { data: sites, error } = await connector.getSites();
    if (error) throw new Error(`Failed to fetch DattoRMM sites: ${error.message}`);

    const entities = (sites || []).map((rawData: any) => ({
      externalId: rawData.uid || rawData.id.toString(),
      displayName: rawData.name,
      rawData,
    }));

    Logger.log({
      module: 'DattoRMMAdapter',
      context: 'handleSiteSync',
      message: `Fetched ${entities.length} device sites`,
      level: 'trace',
    });

    return { entities, pagination: { hasMore: false } };
  }

  private async handleEndpointSync(
    connector: DattoRMMConnector,
    tenantId: number,
    integrationDbId: string,
  ): Promise<AdapterFetchResult> {
    const supabase = getSupabase();
    const allEntities: any[] = [];

    // Get site mappings to know which Datto sites to fetch devices from
    const { data: mappings } = await supabase
      .from('site_to_integration')
      .select('site_id, external_id')
      .eq('integration_id', integrationDbId)
      .eq('tenant_id', tenantId);

    if (mappings && mappings.length > 0) {
      // Fetch devices per mapped site
      for (const mapping of mappings) {
        this.metrics.trackApiCall();
        const { data: devices, error } = await connector.getDevices(mapping.external_id);
        if (error) {
          Logger.log({
            module: 'DattoRMMAdapter',
            context: 'handleEndpointSync',
            message: `Failed to fetch devices for site ${mapping.external_id}: ${error.message}`,
            level: 'warn',
          });
          continue;
        }

        for (const rawData of devices || []) {
          allEntities.push({
            externalId: rawData.uid || rawData.id?.toString(),
            displayName: rawData.hostname,
            siteId: mapping.site_id,
            rawData,
          });
        }
      }
    } else {
      // No mappings — fetch all sites and their devices
      const { data: sites } = await connector.getSites();
      for (const site of sites || []) {
        this.metrics.trackApiCall();
        const siteUid = site.uid || site.id?.toString();
        const { data: devices } = await connector.getDevices(siteUid);
        for (const rawData of devices || []) {
          allEntities.push({
            externalId: rawData.uid || rawData.id?.toString(),
            displayName: rawData.hostname,
            rawData,
          });
        }
      }
    }

    Logger.log({
      module: 'DattoRMMAdapter',
      context: 'handleEndpointSync',
      message: `Fetched ${allEntities.length} endpoints`,
      level: 'trace',
    });

    return { entities: allEntities, pagination: { hasMore: false } };
  }
}
