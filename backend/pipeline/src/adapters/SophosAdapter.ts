import { BaseAdapter } from './BaseAdapter.js';
import { getSupabase } from '../supabase.js';
import { Logger } from '../lib/logger.js';
import { MetricsCollector } from '../lib/metrics.js';
import { SophosPartnerConnector } from '@workspace/shared/lib/connectors/SophosConnector';
import type { SophosPartnerConfig } from '@workspace/shared/types/integrations/sophos/index';
import type { AdapterFetchResult, SyncJobData } from '../types.js';

export class SophosAdapter extends BaseAdapter {
  constructor() {
    super('sophos-partner');
  }

  protected async fetchData(
    jobData: SyncJobData,
    metrics: MetricsCollector
  ): Promise<AdapterFetchResult> {
    const config = (await this.getIntegrationConfig(
      jobData.integrationDbId,
      ['clientSecret'],
      metrics
    )) as SophosPartnerConfig;
    const connector = new SophosPartnerConnector(config);
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
      return this.fetchTenants(connector, siteMap, metrics);
    }

    if (jobData.entityType === 'endpoint') {
      return this.fetchDevices(connector, jobData, siteMap, metrics);
    }

    throw new Error(`SophosAdapter: unknown entityType "${jobData.entityType}"`);
  }

  private async fetchTenants(
    connector: SophosPartnerConnector,
    siteMap: Map<string, string>,
    metrics: MetricsCollector
  ): Promise<AdapterFetchResult> {
    metrics.trackApiCall();
    const { data: sites, error } = await connector.getTenants();

    if (error || !sites) {
      throw new Error(`Sophos getTenants failed: ${error.message}`);
    }

    Logger.log({
      module: 'SophosAdapter',
      context: 'fetchTenants',
      message: `Fetched ${sites.length} Sophos tenants`,
      level: 'info',
    });

    const entities = sites.map((site) => ({
      externalId: site.id,
      displayName: site.name,
      rawData: site,
    }));

    return { entities, pagination: { hasMore: false } };
  }

  private async fetchDevices(
    connector: SophosPartnerConnector,
    jobData: SyncJobData,
    siteMap: Map<string, string>,
    metrics: MetricsCollector
  ): Promise<AdapterFetchResult> {
    if (!jobData.siteId) {
      throw new Error('SophosAdapter: endpoint sync requires siteId');
    }

    let sophosSiteId: string | undefined = siteMap.get(jobData.siteId);
    if (!sophosSiteId) {
      throw new Error(`SophosAdapter: no Sophos site mapping found for site_id ${jobData.siteId}`);
    }

    const supabase = getSupabase();
    metrics.trackQuery();
    const { data: site } = await supabase
      .from('entities')
      .select('raw_data')
      .eq('integration_id', jobData.integrationDbId)
      .eq('tenant_id', jobData.tenantId)
      .eq('external_id', sophosSiteId)
      .single();

    if (!site) {
      throw new Error(`SophosAdapter: no Sophos site entity for site_id ${jobData.siteId}`);
    }

    metrics.trackApiCall();
    const { data: devices, error } = await connector.getEndpoints({
      tenantId: sophosSiteId,
      tenantName: '',
      apiHost: (site.raw_data as any)?.apiHost || '',
    });

    if (error || !devices) {
      throw new Error(`Sophos getEndpoints failed: ${error.message}`);
    }

    Logger.log({
      module: 'SophosAdapter',
      context: 'fetchDevices',
      message: `Fetched ${devices.length} devices for site ${sophosSiteId}`,
      level: 'info',
    });

    const entities = devices.map((device) => ({
      externalId: device.id,
      displayName: device.hostname,
      siteId: jobData.siteId!,
      rawData: device,
    }));

    return { entities, pagination: { hasMore: false } };
  }
}
