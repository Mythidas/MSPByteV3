import { BaseAdapter } from './BaseAdapter.js';
import { Logger } from '../lib/logger.js';
import { HaloPSAConnector } from '@workspace/shared/lib/connectors/HaloPSAConnector.js';
import type { SyncJobData, AdapterFetchResult } from '../types.js';

/**
 * HaloPSAAdapter - Syncs companies and tickets
 * Uses HaloPSAConnector from shared package.
 */
export class HaloPSAAdapter extends BaseAdapter {
  constructor() {
    super('halopsa');
  }

  protected getAdapterName(): string {
    return 'HaloPSAAdapter';
  }

  protected async fetchData(jobData: SyncJobData): Promise<AdapterFetchResult> {
    const { integrationDbId, entityType } = jobData;
    const config = await this.getIntegrationConfig(integrationDbId);
    const connector = new HaloPSAConnector(config, process.env.ENCRYPTION_KEY!);

    const { data: healthy } = await connector.checkHealth();
    if (!healthy) throw new Error(`HaloPSA health check failed for ${integrationDbId}`);

    switch (entityType) {
      case 'company':
        return this.handleCompanySync(connector);
      case 'ticket':
        return this.handleTicketSync(connector);
      default:
        throw new Error(`Unsupported entity type for HaloPSA: ${entityType}`);
    }
  }

  private async handleCompanySync(connector: HaloPSAConnector): Promise<AdapterFetchResult> {
    this.metrics.trackApiCall();
    const { data: sites, error } = await connector.getSites();
    if (error) throw new Error(`Failed to fetch HaloPSA companies: ${error.message}`);

    const entities = (sites || []).map((rawData: any) => ({
      externalId: rawData.id.toString(),
      displayName: rawData.name || rawData.client_name,
      rawData,
    }));

    Logger.log({
      module: 'HaloPSAAdapter',
      context: 'handleCompanySync',
      message: `Fetched ${entities.length} companies`,
      level: 'trace',
    });

    return { entities, pagination: { hasMore: false } };
  }

  private async handleTicketSync(connector: HaloPSAConnector): Promise<AdapterFetchResult> {
    this.metrics.trackApiCall();

    // Check if connector has getTickets method
    if (typeof (connector as any).getTickets !== 'function') {
      Logger.log({
        module: 'HaloPSAAdapter',
        context: 'handleTicketSync',
        message: 'getTickets not yet implemented on HaloPSAConnector, skipping',
        level: 'warn',
      });
      return { entities: [], pagination: { hasMore: false } };
    }

    const { data: tickets, error } = await (connector as any).getTickets();
    if (error) throw new Error(`Failed to fetch HaloPSA tickets: ${error.message}`);

    const entities = (tickets || []).map((rawData: any) => ({
      externalId: rawData.id.toString(),
      displayName: rawData.summary || rawData.id.toString(),
      rawData,
    }));

    Logger.log({
      module: 'HaloPSAAdapter',
      context: 'handleTicketSync',
      message: `Fetched ${entities.length} tickets`,
      level: 'trace',
    });

    return { entities, pagination: { hasMore: false } };
  }
}
