import { Logger } from '@workspace/shared/lib/utils/logger';
import { CoveHTTPClient } from './http-client';
import { CODE_TO_NAME } from '@workspace/shared/types/integrations/cove/short_codes';
import type { CoveConnectorConfig } from '@workspace/shared/types/integrations/cove/index';
import type {
  CoveChildPartner,
  CoveEnumerateChildPartnersResponse,
} from '@workspace/shared/types/integrations/cove/partners';
import type { CoveEnumerateAccountStatisticsResponse } from '@workspace/shared/types/integrations/cove/statistics';

export type CoveAccountStatisticsRow = {
  AccountId: number;
  Flags: string[];
  PartnerId: number;
  Settings: Record<string, string>;
};

export class CoveConnector {
  private readonly client: CoveHTTPClient;

  readonly partner: {
    children: {
      list(): Promise<CoveChildPartner[]>;
    };
  };

  readonly account: {
    statistics: {
      list(): Promise<CoveAccountStatisticsRow[]>;
    };
  };

  constructor(config: CoveConnectorConfig) {
    this.client = new CoveHTTPClient(config);
    this.partner = this.buildPartnerNamespace(config.partnerId);
    this.account = this.buildAccountNamespace(config.partnerId);
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.client.getVisa();
      return true;
    } catch {
      return false;
    }
  }

  private buildPartnerNamespace(partnerId: number): CoveConnector['partner'] {
    const client = this.client;

    const fetchChildren = async (forPartnerId: number): Promise<CoveChildPartner[]> => {
      const data = await client.rpc<CoveEnumerateChildPartnersResponse>('EnumerateChildPartners', {
        partnerId: forPartnerId,
        childrenLimit: 10000,
        range: { Offset: 0, Size: 10000 },
        fields: [0, 1, 3, 4, 5, 8, 11, 12, 18, 21],
        partnerFilter: {
          SortOrder: 'ByLevelAndName',
          states: ['InProduction', 'InTrial', 'Expired'],
        },
      });
      return data.result?.result.Children ?? [];
    };

    return {
      children: {
        async list() {
          const topLevel = await fetchChildren(partnerId);
          const finalResult = [...topLevel];

          for (const child of topLevel) {
            if (child.ActualChildCount > 0) {
              try {
                const subChildren = await fetchChildren(child.Info.Id);
                finalResult.push(...subChildren);
              } catch (err) {
                Logger.warn({
                  module: 'CoveConnector',
                  context: 'partner.children.list',
                  message: String(err),
                });
              }
            }
          }

          return finalResult.sort((a, b) => a.Info.Name.localeCompare(b.Info.Name));
        },
      },
    };
  }

  private buildAccountNamespace(partnerId: number): CoveConnector['account'] {
    const client = this.client;

    return {
      statistics: {
        async list() {
          const rows: CoveAccountStatisticsRow[] = [];

          while (true) {
            const data = await client.rpc<CoveEnumerateAccountStatisticsResponse>(
              'EnumerateAccountStatistics',
              {
                query: {
                  PartnerId: partnerId,
                  Filter: '',
                  Labels: [],
                  OrderBy: 'AR',
                  RecordsCount: 200,
                  SelectionMode: 'Merged',
                  StartRecordNumber: rows.length,
                  Totals: [],
                  Columns: Object.keys(CODE_TO_NAME),
                },
              }
            );

            if (!data.result?.result || data.result.result.length === 0) break;

            for (const r of data.result.result) {
              const parsedSettings: Record<string, string> = {};
              for (const s of r.Settings) {
                const [key, value] = Object.entries(s)[0];
                parsedSettings[CODE_TO_NAME[key]] = value;
              }
              rows.push({ AccountId: r.AccountId, Flags: r.Flags, PartnerId: r.PartnerId, Settings: parsedSettings });
            }
          }

          return rows;
        },
      },
    };
  }
}
