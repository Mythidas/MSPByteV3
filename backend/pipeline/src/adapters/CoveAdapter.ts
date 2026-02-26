import { BaseAdapter } from './BaseAdapter.js';
import { getSupabase } from '../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { PipelineTracker } from '../lib/tracker.js';
import type { AdapterFetchResult, SyncJobData } from '../types.js';
import { CoveConnector } from '@workspace/shared/lib/connectors/CoveConnector.js';
import { CoveConnectorConfig } from '@workspace/shared/types/integrations/cove/index.js';

export class CoveAdapter extends BaseAdapter {
  constructor() {
    super('cove');
  }

  protected async fetchData(
    jobData: SyncJobData,
    tracker: PipelineTracker
  ): Promise<AdapterFetchResult> {
    const config = (await this.getIntegrationConfig(
      jobData.integrationDbId,
      ['clientSecret'],
      tracker
    )) as CoveConnectorConfig;
    const connector = new CoveConnector(config);
    const supabase = getSupabase();

    // Load site_to_integration mappings for this integration+tenant
    tracker.trackQuery();
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
      return this.fetchCustomers(connector, siteMap, tracker);
    }

    if (jobData.entityType === 'endpoint') {
      return this.fetchDevices(connector, jobData, siteMap, tracker);
    }

    throw new Error(`CoveAdapter: unknown entityType "${jobData.entityType}"`);
  }

  private async fetchCustomers(
    connector: CoveConnector,
    siteMap: Map<string, string>,
    tracker: PipelineTracker
  ): Promise<AdapterFetchResult> {
    tracker.trackApiCall();
    const { data: sites, error } = await tracker.trackSpan('adapter:api:getCustomers', async () => {
      return connector.getCustomers();
    });

    if (error || !sites) {
      throw new Error(`Cove ${error.message}`);
    }

    Logger.info({
      module: 'CoveAdapter',
      context: 'fetchSites',
      message: `Fetched ${sites.length} Cove sites`,
    });

    const entities = sites.map((site) => ({
      externalId: String(site.Info.Id),
      displayName: site.Info.Name,
      rawData: site,
    }));

    return { entities, pagination: { hasMore: false } };
  }

  private async fetchDevices(
    connector: CoveConnector,
    jobData: SyncJobData,
    siteMap: Map<string, string>,
    tracker: PipelineTracker
  ): Promise<AdapterFetchResult> {
    if (!jobData.siteId) {
      throw new Error('CoveAdapter: endpoint sync requires siteId');
    }

    // Find the Datto site UID from site_to_integration using the MSPByte site_id
    let externalId: string | undefined = siteMap.get(jobData.siteId);

    if (!externalId) {
      throw new Error(`CoveAdapter: no Cove site mapping found for site_id ${jobData.siteId}`);
    }

    tracker.trackApiCall();
    connector['config'].partnerId = Number(externalId);
    const { data: devices, error } = await tracker.trackSpan('adapter:api:getDevices', async () => {
      return connector.getAccountStatistics();
    });

    if (error || !devices) {
      throw new Error(`Cove getAccountStatistics failed: ${error.message}`);
    }

    Logger.info({
      module: 'CoveAdapter',
      context: 'fetchDevices',
      message: `Fetched ${devices.length} devices for site ${externalId}`,
    });

    const entities = devices.map((device) => ({
      externalId: String(device.AccountId),
      displayName: device.Settings.computerName,
      siteId: jobData.siteId!,
      rawData: device,
    }));

    return { entities, pagination: { hasMore: false } };
  }
}
