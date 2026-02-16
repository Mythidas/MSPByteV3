import { BaseAdapter } from './BaseAdapter.js';
import { getSupabase } from '../supabase.js';
import { Logger } from '../lib/logger.js';
import { MetricsCollector } from '../lib/metrics.js';
import { DattoRMMConnector } from '@workspace/shared/lib/connectors/DattoRMMConnector';
import type { DattoRMMConfig } from '@workspace/shared/types/integrations/datto/index';
import type { AdapterFetchResult, SyncJobData } from '../types.js';

export class DattoRMMAdapter extends BaseAdapter {
  constructor() {
    super('dattormm');
  }

  protected async fetchData(
    jobData: SyncJobData,
    metrics: MetricsCollector
  ): Promise<AdapterFetchResult> {
    const config = (await this.getIntegrationConfig(
      jobData.integrationDbId,
      ['apiSecretKey'],
      metrics
    )) as DattoRMMConfig;
    const connector = new DattoRMMConnector(config);
    const supabase = getSupabase();

    // Load site_to_integration mappings for this integration+tenant
    metrics.trackQuery();
    const { data: mappings } = await supabase
      .from('site_to_integration')
      .select('site_id, external_id')
      .eq('integration_id', jobData.integrationDbId)
      .eq('tenant_id', jobData.tenantId);

    const siteMap = new Map<string, string>();
    for (const m of mappings || []) {
      siteMap.set(m.site_id, m.external_id);
    }

    if (jobData.entityType === 'company') {
      return this.fetchSites(connector, siteMap, metrics);
    }

    if (jobData.entityType === 'endpoint') {
      return this.fetchDevices(connector, jobData, siteMap, metrics);
    }

    throw new Error(`DattoRMMAdapter: unknown entityType "${jobData.entityType}"`);
  }

  private async fetchSites(
    connector: DattoRMMConnector,
    siteMap: Map<string, string>,
    metrics: MetricsCollector
  ): Promise<AdapterFetchResult> {
    metrics.trackApiCall();
    const { data: sites, error } = await connector.getSites();

    if (error || !sites) {
      throw new Error(`DattoRMM getSites failed: ${error.message}`);
    }

    Logger.log({
      module: 'DattoRMMAdapter',
      context: 'fetchSites',
      message: `Fetched ${sites.length} Datto sites`,
      level: 'info',
    });

    const entities = sites.map((site) => ({
      externalId: site.uid,
      displayName: site.name,
      rawData: site,
    }));

    return { entities, pagination: { hasMore: false } };
  }

  private async fetchDevices(
    connector: DattoRMMConnector,
    jobData: SyncJobData,
    siteMap: Map<string, string>,
    metrics: MetricsCollector
  ): Promise<AdapterFetchResult> {
    if (!jobData.siteId) {
      throw new Error('DattoRMMAdapter: endpoint sync requires siteId');
    }

    // Find the Datto site UID from site_to_integration using the MSPByte site_id
    let dattoSiteUid: string | undefined = siteMap.get(jobData.siteId);

    if (!dattoSiteUid) {
      throw new Error(`DattoRMMAdapter: no Datto site mapping found for site_id ${jobData.siteId}`);
    }

    metrics.trackApiCall();
    const { data: devices, error } = await connector.getDevices(dattoSiteUid);

    if (error || !devices) {
      throw new Error(`DattoRMM getDevices failed: ${error.message}`);
    }

    Logger.log({
      module: 'DattoRMMAdapter',
      context: 'fetchDevices',
      message: `Fetched ${devices.length} devices for site ${dattoSiteUid}`,
      level: 'info',
    });

    const entities = devices.map((device) => ({
      externalId: device.uid,
      displayName: device.hostname,
      siteId: jobData.siteId!,
      rawData: device,
    }));

    return { entities, pagination: { hasMore: false } };
  }
}
