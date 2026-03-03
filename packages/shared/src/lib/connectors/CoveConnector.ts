import { APIResponse, Logger } from '@workspace/shared/lib/utils/logger';
import type { CoveConnectorConfig } from '@workspace/shared/types/integrations/cove/index';
import type {
  CoveChildPartner,
  CoveEnumerateChildPartnersResponse,
} from '@workspace/shared/types/integrations/cove/partners';
import { CODE_TO_NAME } from '@workspace/shared/types/integrations/cove/short_codes';
import type {
  CoveAccountStatistics,
  CoveEnumerateAccountStatisticsResponse,
} from '@workspace/shared/types/integrations/cove/statistics';
import { type LocalFilters, applyFilters } from '@workspace/shared/types/connector';

const MODULE = 'CoveConnector';

export class CoveConnector {
  private token: string | null = null;

  constructor(private config: CoveConnectorConfig) {}

  async checkHealth() {
    try {
      const { data: visa, error } = await this.getVisa();
      if (error) return { data: false };
      return { data: !!visa };
    } catch {
      return { data: false };
    }
  }

  async getCustomers(
    filters?: LocalFilters<CoveChildPartner>
  ): Promise<APIResponse<CoveChildPartner[]>> {
    try {
      const { data: token, error: tokenError } = await this.getVisa();
      if (tokenError) return { error: tokenError };

      const response = await fetch(this.config.server, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
              headers: { 'Content-Type': 'application/json' },
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
            Logger.error({ module: MODULE, context: 'getCustomers', message: String(err) });
          }
        }
      }

      const sorted = finalResult.sort((a, b) => a.Info.Name.localeCompare(b.Info.Name));
      return { data: this.postFilter(sorted, filters) };
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'getCustomers', message: String(err) });
    }
  }

  async getAccountStatistics(
    filters?: LocalFilters<{ AccountId: number; Flags: string[]; PartnerId: number; Settings: Record<string, string> }>
  ): Promise<
    APIResponse<
      { AccountId: number; Flags: string[]; PartnerId: number; Settings: Record<string, string> }[]
    >
  > {
    try {
      const { data: token, error: tokenError } = await this.getVisa();
      if (tokenError) return { error: tokenError };

      const statistics: {
        AccountId: number;
        Flags: string[];
        PartnerId: number;
        Settings: Record<string, string>;
      }[] = [];

      while (true) {
        const response = await fetch(this.config.server, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
                Columns: ['AN', 'AR', 'MN', 'OP', 'PN', 'T3', 'US', 'TB', 'YV', 'YS', 'T7'],
              },
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as CoveEnumerateAccountStatisticsResponse;
        if (!data.result || !data.result.result || data.result.result.length === 0) break;

        const results: {
          AccountId: number;
          Flags: string[];
          PartnerId: number;
          Settings: Record<string, string>;
        }[] = [];

        for (const r of data.result.result) {
          const parsedSettings: Record<string, string> = {};
          for (const s of r.Settings) {
            const [key, string] = Object.entries(s)[0];
            parsedSettings[CODE_TO_NAME[key]] = string;
          }
          results.push({ ...r, Settings: parsedSettings });
        }

        statistics.push(...results);
      }

      return { data: this.postFilter(statistics, filters) };
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'getAccountStatistics', message: String(err) });
    }
  }

  private postFilter<T>(items: T[], filters?: LocalFilters<T>): T[] {
    return applyFilters(
      items as unknown as Record<string, unknown>[],
      filters as unknown as LocalFilters<Record<string, unknown>>
    ) as T[];
  }

  private async getVisa(): Promise<APIResponse<string>> {
    if (this.token) return { data: this.token };

    try {
      const response = await fetch(this.config.server, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        return Logger.error({
          module: MODULE,
          context: 'getVisa',
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      const data = (await response.json()) as {
        error?: unknown;
        result?: unknown;
        visa?: string;
      };

      if (data.error) {
        return Logger.error({
          module: MODULE,
          context: 'getVisa',
          message: `JSON-RPC error: ${JSON.stringify(data.error)}`,
        });
      }

      if (!data.result || !data.visa) {
        return Logger.error({
          module: MODULE,
          context: 'getVisa',
          message: 'Unexpected Login response: no visa found',
        });
      }

      this.token = data.visa;
      return { data: data.visa };
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'getVisa', message: String(err) });
    }
  }
}
