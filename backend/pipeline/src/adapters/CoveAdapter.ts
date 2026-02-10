import { BaseAdapter } from './BaseAdapter.js';
import { Logger } from '../lib/logger.js';
import { CoveConnector } from '@workspace/shared/lib/connectors/CoveConnector.js';
import type { SyncJobData, AdapterFetchResult } from '../types.js';

/**
 * CoveAdapter - Syncs backup_customers and backup_devices
 * Uses existing CoveConnector from shared package.
 */
export class CoveAdapter extends BaseAdapter {
  constructor() {
    super('cove');
  }

  protected getAdapterName(): string {
    return 'CoveAdapter';
  }

  protected async fetchData(jobData: SyncJobData): Promise<AdapterFetchResult> {
    const { integrationDbId, entityType } = jobData;
    const config = await this.getIntegrationConfig(integrationDbId);
    const connector = new CoveConnector(config);

    const { data: healthy } = await connector.checkHealth();
    if (!healthy) throw new Error(`Cove health check failed for ${integrationDbId}`);

    switch (entityType) {
      case 'backup_customer':
        return this.handleCustomerSync(connector);
      case 'backup_device':
        return this.handleDeviceSync(connector);
      default:
        throw new Error(`Unsupported entity type for Cove: ${entityType}`);
    }
  }

  private async handleCustomerSync(connector: CoveConnector): Promise<AdapterFetchResult> {
    this.metrics.trackApiCall();
    const { data: customers, error } = await connector.getCustomers();
    if (error) throw new Error(`Failed to fetch Cove customers: ${error.message}`);

    const entities = this.flattenCustomers(customers || []);

    Logger.log({
      module: 'CoveAdapter',
      context: 'handleCustomerSync',
      message: `Fetched ${entities.length} backup customers`,
      level: 'trace',
    });

    return { entities, pagination: { hasMore: false } };
  }

  private async handleDeviceSync(connector: CoveConnector): Promise<AdapterFetchResult> {
    this.metrics.trackApiCall();
    const { data: statistics, error } = await connector.getAccountStatistics();
    if (error) throw new Error(`Failed to fetch Cove account statistics: ${error.message}`);

    const entities = (statistics || []).map((rawData: any) => ({
      externalId: rawData.AccountId?.toString() || rawData.Id?.toString(),
      displayName: rawData.Settings?.DS_SYSTEM_NAME || rawData.AccountId?.toString(),
      rawData,
    }));

    Logger.log({
      module: 'CoveAdapter',
      context: 'handleDeviceSync',
      message: `Fetched ${entities.length} backup devices`,
      level: 'trace',
    });

    return { entities, pagination: { hasMore: false } };
  }

  /**
   * Flatten the hierarchical Cove customer tree into a flat list.
   */
  private flattenCustomers(customers: any[]): any[] {
    const flat: any[] = [];

    const walk = (nodes: any[]) => {
      for (const node of nodes) {
        flat.push({
          externalId: node.Id?.toString() || node.Uid,
          displayName: node.Name,
          rawData: node,
        });
        if (node.Children?.length) {
          walk(node.Children);
        }
      }
    };

    walk(customers);
    return flat;
  }
}
