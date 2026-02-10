import { BaseAdapter } from './BaseAdapter.js';
import { Logger } from '../lib/logger.js';
import { AutoTaskConnector } from '@workspace/shared/lib/connectors/AutoTaskConnector.js';
import type { SyncJobData, AdapterFetchResult } from '../types.js';

/**
 * AutoTaskAdapter - Syncs companies, contracts, contract_services
 * Uses existing AutoTaskConnector from shared package.
 */
export class AutoTaskAdapter extends BaseAdapter {
  constructor() {
    super('autotask');
  }

  protected getAdapterName(): string {
    return 'AutoTaskAdapter';
  }

  protected async fetchData(jobData: SyncJobData): Promise<AdapterFetchResult> {
    const { integrationDbId, entityType } = jobData;
    const config = await this.getIntegrationConfig(integrationDbId);
    const connector = new AutoTaskConnector(config);

    const { data: healthy } = await connector.checkHealth();
    if (!healthy) throw new Error(`AutoTask health check failed for ${integrationDbId}`);

    switch (entityType) {
      case 'company':
        return this.handleCompanySync(connector);
      case 'contract':
        return this.handleContractSync(connector);
      case 'contract_service':
        return this.handleContractServiceSync(connector);
      default:
        throw new Error(`Unsupported entity type for AutoTask: ${entityType}`);
    }
  }

  private async handleCompanySync(connector: AutoTaskConnector): Promise<AdapterFetchResult> {
    const { data: companies, error } = await connector.getCompanies();
    if (error) throw new Error(`Failed to fetch companies: ${error.message}`);

    const entities = (companies || []).map((rawData: any) => ({
      externalId: rawData.id.toString(),
      displayName: rawData.companyName,
      rawData,
    }));

    Logger.log({
      module: 'AutoTaskAdapter',
      context: 'handleCompanySync',
      message: `Fetched ${entities.length} companies`,
      level: 'trace',
    });

    return { entities, pagination: { hasMore: false } };
  }

  private async handleContractSync(connector: AutoTaskConnector): Promise<AdapterFetchResult> {
    const { data: contracts, error } = await connector.getContracts();
    if (error) throw new Error(`Failed to fetch contracts: ${error.message}`);

    const entities = (contracts || []).map((rawData: any) => ({
      externalId: rawData.id.toString(),
      displayName: rawData.contractName,
      rawData,
    }));

    Logger.log({
      module: 'AutoTaskAdapter',
      context: 'handleContractSync',
      message: `Fetched ${entities.length} contracts`,
      level: 'trace',
    });

    return { entities, pagination: { hasMore: false } };
  }

  private async handleContractServiceSync(
    connector: AutoTaskConnector,
  ): Promise<AdapterFetchResult> {
    const { data: services, error } = await connector.getContractServices();
    if (error) throw new Error(`Failed to fetch contract services: ${error.message}`);

    const entities = (services || []).map((rawData: any) => ({
      externalId: rawData.id.toString(),
      displayName: rawData.serviceName || rawData.id.toString(),
      rawData,
    }));

    Logger.log({
      module: 'AutoTaskAdapter',
      context: 'handleContractServiceSync',
      message: `Fetched ${entities.length} contract services`,
      level: 'trace',
    });

    return { entities, pagination: { hasMore: false } };
  }
}
