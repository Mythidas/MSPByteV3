import { APIResponse, Logger } from '@workspace/shared/lib/utils/logger';
import { CoveConnectorConfig } from '@workspace/shared/types/integrations/cove/index';
import {
  CoveChildPartner,
  CoveEnumerateChildPartnersResponse,
} from '@workspace/shared/types/integrations/cove/partners';
import {
  CoveAccountStatistics,
  CoveEnumerateAccountStatisticsResponse,
} from '@workspace/shared/types/integrations/cove/statistics';

export class CoveConnector {
  private token: string | null = null;

  constructor(private config: CoveConnectorConfig) {}

  async checkHealth() {
    try {
      const visa = await this.getVisa();
      return { data: !!visa };
    } catch (err) {
      return { data: false };
    }
  }

  async getCustomers(): Promise<APIResponse<CoveChildPartner[]>> {
    try {
      const token = await this.getVisa();
      const response = await fetch(this.config.server, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'jsonrpc',
          visa: token,
          method: 'EnumerateChildPartners',
          params: {
            partnerId: this.config.partnerId,
            childrenLimit: 10000,
            range: { Offset: 0, Size: 10000 },
            fields: [0, 1, 3, 4, 5, 8, 11, 12, 18, 21],
            partnerFilter: {
              SortOrder: 'ByLevelAndName',
              states: ['InProduction', 'InTrial', 'Expired'],
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as CoveEnumerateChildPartnersResponse;
      const finalResult = [...(data.result?.result.Children || [])];

      for await (const child of data.result?.result.Children || []) {
        if (child.ActualChildCount > 0) {
          try {
            const childResponse = await fetch(this.config.server, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'jsonrpc',
                visa: token,
                method: 'EnumerateChildPartners',
                params: {
                  partnerId: child.Info.Id,
                  childrenLimit: 10000,
                  range: { Offset: 0, Size: 10000 },
                  fields: [0, 1, 3, 4, 5, 8, 11, 12, 18, 21],
                  partnerFilter: {
                    SortOrder: 'ByLevelAndName',
                    states: ['InProduction', 'InTrial', 'Expired'],
                  },
                },
              }),
            });

            if (!childResponse.ok) {
              throw new Error(`HTTP ${childResponse.status}: ${childResponse.statusText}`);
            }

            const childData = (await childResponse.json()) as CoveEnumerateChildPartnersResponse;

            if (childData.result?.result.Children) {
              finalResult.push(...childData.result.result.Children);
            }
          } catch (err) {
            Logger.error({
              module: 'CoveConnector',
              context: 'getCustomers',
              message: String(err),
            });
          }
        }
      }

      return {
        data: finalResult.sort((a, b) => a.Info.Name.localeCompare(b.Info.Name)),
      };
    } catch (err) {
      return Logger.error({
        module: 'CoveConnector',
        context: 'getCustomers',
        message: String(err),
      });
    }
  }

  async getAccountStatistics(): Promise<APIResponse<CoveAccountStatistics[]>> {
    try {
      const token = await this.getVisa();
      const statistics: CoveAccountStatistics[] = [];

      while (true) {
        const response = await fetch(this.config.server, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: 'jsonrpc',
            jsonrpc: '2.0',
            visa: token,
            method: 'EnumerateAccountStatistics',
            params: {
              query: {
                PartnerId: this.config.partnerId,
                Filter: '',
                Labels: [],
                OrderBy: 'AR',
                RecordsCount: 200,
                SelectionMode: 'Merged',
                StartRecordNumber: statistics.length,
                Totals: [],
                Columns: ['AR'],
              },
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as CoveEnumerateAccountStatisticsResponse;

        if (!data.result || !data.result.result || data.result.result.length === 0) break;
        statistics.push(...data.result.result);
      }

      return { data: statistics };
    } catch (err) {
      return Logger.error({
        module: 'CoveConnector',
        context: 'getDevices',
        message: String(err),
      });
    }
  }

  private async getVisa() {
    if (this.token) return this.token;

    try {
      const response = await fetch(`${this.config.server}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'login',
          method: 'Login',
          params: {
            username: this.config.clientId,
            password: this.config.clientSecret,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        error?: any;
        result?: any;
        visa?: string;
      };

      // Better: check for errors in JSON-RPC style
      if (data.error) {
        throw new Error(`JSON-RPC error: ${JSON.stringify(data.error)}`);
      }

      if (!data.result || !data.visa) {
        console.error('Unexpected Login response:', data);
        throw new Error('No visa found in Login response');
      }

      this.token = data.visa as string;
      return this.token;
    } catch (err) {
      Logger.error({
        module: 'CoveConnector',
        context: 'getVisa',
        message: String(err),
      });
      throw err;
    }
  }
}
