import { DattoRMMHTTPClient } from './http-client';
import type { DattoRMMConfig } from '@workspace/shared/types/integrations/datto/index';
import type { DattoRMMDevice } from '@workspace/shared/types/integrations/datto/devices';
import type { DattoRMMSite } from '@workspace/shared/types/integrations/datto/sites';

type DattoPagedResponse<TKey extends string, TItem> = {
  [K in TKey]: TItem[];
} & {
  pageDetails: { nextPageUrl?: string };
};

export class DattoRMMConnector {
  private readonly client: DattoRMMHTTPClient;

  readonly account: {
    sites: {
      list(): Promise<DattoRMMSite[]>;
    };
  };

  readonly site: {
    devices: {
      list(siteId: string): Promise<DattoRMMDevice[]>;
    };
    variables: {
      get(siteUid: string, variableName: string): Promise<string | null>;
      set(siteUid: string, variableName: string, value: string): Promise<void>;
    };
  };

  constructor(config: DattoRMMConfig, tenantId: string) {
    this.client = new DattoRMMHTTPClient(config, tenantId);
    this.account = this.buildAccountNamespace();
    this.site = this.buildSiteNamespace();
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.client.getToken();
      return true;
    } catch {
      return false;
    }
  }

  private buildAccountNamespace(): DattoRMMConnector['account'] {
    const client = this.client;

    return {
      sites: {
        async list() {
          const sites: DattoRMMSite[] = [];
          let url = `${client.config.url}/api/v2/account/sites`;

          while (true) {
            const data = await client.get<DattoPagedResponse<'sites', DattoRMMSite>>(url);
            if (!data.sites || !Array.isArray(data.sites)) break;
            sites.push(...data.sites);
            if (data.pageDetails?.nextPageUrl) {
              url = data.pageDetails.nextPageUrl;
            } else {
              break;
            }
          }

          return sites;
        },
      },
    };
  }

  private buildSiteNamespace(): DattoRMMConnector['site'] {
    const client = this.client;

    return {
      devices: {
        async list(siteId) {
          const devices: DattoRMMDevice[] = [];
          let url = `${client.config.url}/api/v2/site/${siteId}/devices`;

          while (true) {
            const data = await client.get<DattoPagedResponse<'devices', DattoRMMDevice>>(url);
            if (!data.devices || !Array.isArray(data.devices)) break;
            devices.push(...data.devices);
            if (data.pageDetails?.nextPageUrl) {
              url = data.pageDetails.nextPageUrl;
            } else {
              break;
            }
          }

          return devices;
        },
      },
      variables: {
        async get(siteUid, variableName) {
          const data = await client.getOrNull<{
            variables: { id: string; name: string; value: string; masked: boolean }[];
          }>(`${client.config.url}/api/v2/site/${siteUid}/variables`);

          if (!data) return null;
          const match = data.variables.find((v) => v.name === variableName);
          return match?.value ?? null;
        },
        async set(siteUid, variableName, value) {
          const data = await client.getOrNull<{ variables: { id: string; name: string }[] }>(
            `${client.config.url}/api/v2/site/${siteUid}/variables`
          );

          const variableId = data?.variables.find((v) => v.name === variableName)?.id ?? null;

          if (variableId) {
            await client.post(`${client.config.url}/api/v2/site/${siteUid}/variable/${variableId}`, {
              name: variableName,
              value,
            });
          } else {
            await client.put(`${client.config.url}/api/v2/site/${siteUid}/variable`, {
              name: variableName,
              value,
            });
          }
        },
      },
    };
  }
}
