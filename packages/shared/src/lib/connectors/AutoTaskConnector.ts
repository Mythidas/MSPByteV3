import { APIResponse, Logger } from '@workspace/shared/lib/utils/logger';
import type {
  AutoTaskDataSourceConfig,
  AutoTaskCompany,
  AutoTaskSearch,
  AutoTaskResponse,
} from '@workspace/shared/types/integrations/autotask/index';
import type {
  AutoTaskContract,
  AutoTaskContractService,
  AutoTaskContractServiceUnit,
  AutoTaskContractServiceBundleUnit,
  AutoTaskQuoteItem,
} from '@workspace/shared/types/integrations/autotask/contracts';
import { type LocalFilters, applyFilters } from '@workspace/shared/types/connector';

const MODULE = 'AutoTaskConnector';

export class AutoTaskConnector {
  constructor(private config: AutoTaskDataSourceConfig) {}

  async checkHealth(): Promise<APIResponse<boolean>> {
    try {
      const search: AutoTaskSearch<AutoTaskCompany> = {
        filter: [{ field: 'isActive', op: 'eq', value: true }],
      };

      const response = await this.getAPIData<AutoTaskCompany>(
        `${this.config.server}/ATServicesRest/V1.0/Companies/query?MaxRecords=1&search=${JSON.stringify(search)}`
      );

      if (response.error) return { error: response.error };
      return { data: true };
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'checkHealth', message: String(err) });
    }
  }

  async getCompanies(
    filters?: LocalFilters<AutoTaskCompany>
  ): Promise<APIResponse<AutoTaskCompany[]>> {
    try {
      const search: AutoTaskSearch<AutoTaskCompany> = {
        filter: [
          { field: 'isActive', op: 'eq', value: true },
          { field: 'companyType', op: 'eq', value: 1 },
        ],
      };

      const response = await this.getAPIData<AutoTaskCompany>(
        `${this.config.server}/ATServicesRest/V1.0/Companies/query?search=${JSON.stringify(search)}`
      );

      if (response.error) throw response.error.message;
      return { data: this.postFilter(response.data, filters) };
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'getCompanies', message: String(err) });
    }
  }

  async getContracts(
    siteId?: string,
    filters?: LocalFilters<AutoTaskContract>
  ): Promise<APIResponse<AutoTaskContract[]>> {
    try {
      const today = new Date().toISOString();
      const search: AutoTaskSearch<AutoTaskContract> = {
        filter: [
          { field: 'startDate', op: 'lte', value: today },
          { field: 'endDate', op: 'gte', value: today },
          { field: 'contractType', op: 'eq', value: 7 },
        ],
      };
      if (siteId !== undefined) search.filter.push({ field: 'companyID', op: 'eq', value: siteId });

      const response = await this.getAPIData<AutoTaskContract>(
        `${this.config.server}/ATServicesRest/V1.0/Contracts/query?search=${JSON.stringify(search)}`
      );

      if (response.error) throw response.error.message;
      return { data: this.postFilter(response.data, filters) };
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'getContracts', message: String(err) });
    }
  }

  async getContractServices(
    contractId?: string,
    filters?: LocalFilters<AutoTaskContractService>
  ): Promise<APIResponse<AutoTaskContractService[]>> {
    try {
      const search: AutoTaskSearch<AutoTaskContractService> = { filter: [] };
      if (contractId) {
        search.filter.push({ field: 'contractID', op: 'eq', value: contractId });
      }

      const [services, serviceBundles] = await Promise.all([
        this.getAPIData<AutoTaskContractService>(
          `${this.config.server}/ATServicesRest/V1.0/ContractServices/query?search=${JSON.stringify(search)}`
        ),
        this.getAPIData<AutoTaskContractService>(
          `${this.config.server}/ATServicesRest/V1.0/ContractServiceBundles/query?search=${JSON.stringify(search)}`
        ),
      ]);

      if (services.error || serviceBundles.error) {
        throw services.error?.message || serviceBundles.error?.message;
      }

      const data = [
        ...services.data.map((s) => ({ ...s, isBundle: false })),
        ...serviceBundles.data.map((s) => ({
          ...s,
          isBundle: true,
          serviceID: (s as any).serviceBundleID,
        })),
      ];

      return { data: this.postFilter(data, filters) };
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'getContractServices', message: String(err) });
    }
  }

  async getContractServiceUnits(
    contractServiceId: string,
    contractId: string,
    filters?: LocalFilters<AutoTaskContractServiceUnit>
  ): Promise<APIResponse<AutoTaskContractServiceUnit[]>> {
    try {
      const today = new Date().toISOString();
      const search: AutoTaskSearch<AutoTaskContractServiceUnit> = {
        filter: [
          { field: 'contractID', op: 'eq', value: contractId },
          { field: 'contractServiceID', op: 'eq', value: contractServiceId },
          { field: 'startDate', op: 'lte', value: today },
          { field: 'endDate', op: 'gte', value: today },
        ],
      };

      const response = await this.getAPIData<AutoTaskContractServiceUnit>(
        `${this.config.server}/ATServicesRest/V1.0/ContractServiceUnits/query?search=${JSON.stringify(search)}`
      );

      if (response.error) throw response.error.message;
      return { data: this.postFilter(response.data, filters) };
    } catch (err) {
      return Logger.error({
        module: MODULE,
        context: 'getContractServiceUnits',
        message: String(err),
      });
    }
  }

  async getContractServiceBundleUnits(
    contractServiceBundleId: string,
    contractId: string,
    filters?: LocalFilters<AutoTaskContractServiceBundleUnit>
  ): Promise<APIResponse<AutoTaskContractServiceBundleUnit[]>> {
    try {
      const today = new Date().toISOString();
      const search: AutoTaskSearch<AutoTaskContractServiceBundleUnit> = {
        filter: [
          { field: 'contractID', op: 'eq', value: contractId },
          { field: 'contractServiceBundleID', op: 'eq', value: contractServiceBundleId },
          { field: 'startDate', op: 'lte', value: today },
          { field: 'endDate', op: 'gte', value: today },
        ],
      };

      const response = await this.getAPIData<AutoTaskContractServiceBundleUnit>(
        `${this.config.server}/ATServicesRest/V1.0/ContractServiceBundleUnits/query?search=${JSON.stringify(search)}`
      );

      if (response.error) throw response.error.message;
      return { data: this.postFilter(response.data, filters) };
    } catch (err) {
      return Logger.error({
        module: MODULE,
        context: 'getContractServiceBundleUnits',
        message: String(err),
      });
    }
  }

  async getQuoteItem(
    quoteItemID: number,
    filters?: LocalFilters<AutoTaskQuoteItem>
  ): Promise<APIResponse<AutoTaskQuoteItem[]>> {
    try {
      const search: AutoTaskSearch<AutoTaskQuoteItem> = {
        filter: [{ field: 'id', op: 'eq', value: quoteItemID }],
      };

      const response = await this.getAPIData<AutoTaskQuoteItem>(
        `${this.config.server}/ATServicesRest/V1.0/QuoteItems/query?search=${JSON.stringify(search)}`
      );

      if (response.error) throw response.error.message;
      return { data: this.postFilter(response.data, filters) };
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'getQuoteItem', message: String(err) });
    }
  }

  private postFilter<T>(items: T[], filters?: LocalFilters<T>): T[] {
    return applyFilters(
      items as unknown as Record<string, unknown>[],
      filters as unknown as LocalFilters<Record<string, unknown>>
    ) as T[];
  }

  private async getAPIData<T>(url: string): Promise<APIResponse<T[]>> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          UserName: this.config.clientId,
          Secret: this.config.clientSecret,
          ApiIntegrationCode: this.config.trackerId,
        },
      });

      if (!response.ok) {
        return Logger.error({
          module: MODULE,
          context: 'getAPIData',
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      const data: AutoTaskResponse<T> = (await response.json()) as AutoTaskResponse<T>;
      return { data: data.items };
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'getAPIData', message: String(err) });
    }
  }
}
