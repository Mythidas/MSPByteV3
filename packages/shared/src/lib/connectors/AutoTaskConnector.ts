import { APIResponse, Debug } from "@workspace/shared/lib/utils/debug";
import {
  AutoTaskDataSourceConfig,
  AutoTaskCompany,
  AutoTaskSearch,
  AutoTaskResponse,
} from "@workspace/shared/types/integrations/autotask/index";
import {
  AutoTaskContract,
  AutoTaskContractService,
  AutoTaskContractServiceUnit,
  AutoTaskContractServiceBundleUnit,
} from "@workspace/shared/types/integrations/autotask/contracts";

export class AutoTaskConnector {
  constructor(private config: AutoTaskDataSourceConfig) {}

  async checkHealth() {
    return { data: true };
  }

  async getCompanies(): Promise<APIResponse<AutoTaskCompany[]>> {
    try {
      const search: AutoTaskSearch<AutoTaskCompany> = {
        filter: [
          { field: "isActive", op: "eq", value: true },
          { field: "companyType", op: "eq", value: 1 },
        ],
      };

      const response = await this.getAPIData<AutoTaskCompany>(
        `${this.config.server}/ATServicesRest/V1.0/Companies/query?search=${JSON.stringify(search)}`,
      );

      if (response.error) {
        throw response.error.message;
      }

      return {
        data: response.data,
      };
    } catch (err) {
      return Debug.error({
        module: "AutoTaskConnector",
        context: "getCompanies",
        message: String(err),
      });
    }
  }

  async getContracts(
    siteId?: string,
  ): Promise<APIResponse<AutoTaskContract[]>> {
    try {
      const today = new Date().toISOString();
      const search: AutoTaskSearch<AutoTaskContract> = {
        filter: [
          { field: "startDate", op: "lte", value: today },
          { field: "endDate", op: "gte", value: today },
          { field: "contractType", op: "eq", value: 7 },
        ],
      };
      if (siteId !== undefined)
        search.filter.push({ field: "companyID", op: "eq", value: siteId });

      const response = await this.getAPIData<AutoTaskContract>(
        `${this.config.server}/ATServicesRest/V1.0/Contracts/query?search=${JSON.stringify(search)}`,
      );

      if (response.error) {
        throw response.error.message;
      }

      return {
        data: response.data,
      };
    } catch (err) {
      return Debug.error({
        module: "AutoTaskConnector",
        context: "getContracts",
        message: String(err),
      });
    }
  }

  async getContractServices(
    contractId?: string,
  ): Promise<APIResponse<AutoTaskContractService[]>> {
    try {
      const search: AutoTaskSearch<AutoTaskContractService> = {
        filter: [],
      };
      if (contractId)
        search.filter.push({
          field: "contractID",
          op: "eq",
          value: contractId,
        });

      const services = await this.getAPIData<AutoTaskContractService>(
        `${this.config.server}/ATServicesRest/V1.0/ContractServices/query?search=${JSON.stringify(search)}`,
      );
      const serviceBundles = await this.getAPIData<AutoTaskContractService>(
        `${this.config.server}/ATServicesRest/V1.0/ContractServiceBundles/query?search=${JSON.stringify(search)}`,
      );

      if (services.error || serviceBundles.error) {
        throw services.error?.message || serviceBundles.error?.message;
      }

      const data = [
        ...services.data.map((s) => {
          return { ...s, isBundle: false };
        }),
        ...serviceBundles.data.map((s) => {
          return {
            ...s,
            isBundle: true,
            serviceID: (s as any).serviceBundleID,
          };
        }),
      ];

      return {
        data,
      };
    } catch (err) {
      return Debug.error({
        module: "AutoTaskConnector",
        context: "getContractServices",
        message: String(err),
      });
    }
  }

  async getContractServiceUnits(
    contractServiceId: string,
    contractId: string,
  ): Promise<APIResponse<AutoTaskContractServiceUnit[]>> {
    try {
      const today = new Date().toISOString();
      const search: AutoTaskSearch<AutoTaskContractServiceUnit> = {
        filter: [
          { field: "contractID", op: "eq", value: contractId },
          { field: "contractServiceID", op: "eq", value: contractServiceId },
          { field: "startDate", op: "lte", value: today },
          { field: "endDate", op: "gte", value: today },
        ],
      };

      const response = await this.getAPIData<AutoTaskContractServiceUnit>(
        `${this.config.server}/ATServicesRest/V1.0/ContractServiceUnits/query?search=${JSON.stringify(search)}`,
      );

      if (response.error) {
        throw response.error.message;
      }

      return {
        data: response.data,
      };
    } catch (err) {
      return Debug.error({
        module: "AutoTaskConnector",
        context: "getContractServiceUnits",
        message: String(err),
      });
    }
  }

  async getContractServiceBundleUnits(
    contractServiceBundleId: string,
    contractId: string,
  ): Promise<APIResponse<AutoTaskContractServiceBundleUnit[]>> {
    try {
      const today = new Date().toISOString();
      const search: AutoTaskSearch<AutoTaskContractServiceBundleUnit> = {
        filter: [
          { field: "contractID", op: "eq", value: contractId },
          {
            field: "contractServiceBundleID",
            op: "eq",
            value: contractServiceBundleId,
          },
          { field: "startDate", op: "lte", value: today },
          { field: "endDate", op: "gte", value: today },
        ],
      };

      const response = await this.getAPIData<AutoTaskContractServiceBundleUnit>(
        `${this.config.server}/ATServicesRest/V1.0/ContractServiceBundleUnits/query?search=${JSON.stringify(search)}`,
      );

      if (response.error) {
        throw response.error.message;
      }

      return {
        data: response.data,
      };
    } catch (err) {
      return Debug.error({
        module: "AutoTaskConnector",
        context: "getContractServiceBundleUnits",
        message: String(err),
      });
    }
  }

  private async getAPIData<T>(url: string): Promise<APIResponse<T[]>> {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          UserName: this.config.clientId,
          Secret: this.config.clientSecret,
          ApiIntegrationCode: this.config.trackerId,
        },
      });

      if (!response.ok) {
        return Debug.error({
          module: "AutoTaskConnector",
          context: "getAPIData",
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      const data: AutoTaskResponse<T> =
        (await response.json()) as AutoTaskResponse<T>;

      return { data: data.items };
    } catch (err) {
      return Debug.error({
        module: "AutoTaskConnector",
        context: "getAPIData",
        message: String(err),
      });
    }
  }
}
