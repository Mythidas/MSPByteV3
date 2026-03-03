import { APIResponse, Logger } from '@workspace/shared/lib/utils/logger';
import { fetchWithRetry } from '@workspace/shared/lib/utils/fetchWithRetry';
import type {
  DattoRMMConfig,
  DattoRMMPagination,
} from '@workspace/shared/types/integrations/datto/index';
import type { DattoRMMDevice } from '@workspace/shared/types/integrations/datto/devices';
import type { DattoRMMSite } from '@workspace/shared/types/integrations/datto/sites';
import { type LocalFilters, applyFilters } from '@workspace/shared/types/connector';

const MODULE = 'DattoRMMConnector';

export class DattoRMMConnector {
  private readonly apiUrl: string;
  private token: string | null = null;
  private tokenExpiry: Date = new Date();

  constructor(private config: DattoRMMConfig) {
    this.apiUrl = this.config.url;
  }

  async checkHealth(): Promise<APIResponse<boolean>> {
    const { data: token, error } = await this.getToken();
    if (error) return { error };
    return { data: !!token };
  }

  async getSites(filters?: LocalFilters<DattoRMMSite>): Promise<APIResponse<DattoRMMSite[]>> {
    const { data: token, error: tokenError } = await this.getToken();
    if (tokenError) return { error: tokenError };

    const sites: DattoRMMSite[] = [];
    let url = `${this.apiUrl}/api/v2/account/sites`;

    try {
      while (true) {
        const response = await fetchWithRetry(
          url,
          {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          },
          MODULE,
          'getSites'
        );

        if (!response.ok) {
          return Logger.error({
            module: MODULE,
            context: 'getSites',
            message: `HTTP ${response.status}: ${response.statusText}`,
          });
        }

        const data = (await response.json()) as {
          sites: DattoRMMSite[];
          pageDetails: DattoRMMPagination;
        };

        if (data.sites && Array.isArray(data.sites)) {
          sites.push(...data.sites);
          if (data.pageDetails?.nextPageUrl) {
            url = data.pageDetails.nextPageUrl;
          } else break;
        } else break;
      }

      return { data: this.postFilter(sites, filters) };
    } catch (error) {
      return Logger.error({
        module: MODULE,
        context: 'getSites',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getDevices(
    siteId: string,
    filters?: LocalFilters<DattoRMMDevice>
  ): Promise<APIResponse<DattoRMMDevice[]>> {
    const { data: token, error: tokenError } = await this.getToken();
    if (tokenError) return { error: tokenError };

    const devices: DattoRMMDevice[] = [];
    let url = `${this.apiUrl}/api/v2/site/${siteId}/devices`;

    try {
      while (true) {
        const response = await fetchWithRetry(
          url,
          {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          },
          MODULE,
          'getDevices'
        );

        if (!response.ok) {
          return Logger.error({
            module: MODULE,
            context: 'getDevices',
            message: `HTTP ${response.status}: ${response.statusText}`,
          });
        }

        const data = (await response.json()) as {
          devices: DattoRMMDevice[];
          pageDetails: DattoRMMPagination;
        };

        if (data.devices && Array.isArray(data.devices)) {
          devices.push(...data.devices);
          if (data.pageDetails?.nextPageUrl) {
            url = data.pageDetails.nextPageUrl;
          } else break;
        } else break;
      }

      return { data: this.postFilter(devices, filters) };
    } catch (error) {
      return Logger.error({
        module: MODULE,
        context: 'getDevices',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async setSiteVariable(
    siteUid: string,
    variableName: string,
    value: string
  ): Promise<APIResponse<boolean>> {
    const { data: token, error: tokenError } = await this.getToken();
    if (tokenError) return { error: tokenError };

    try {
      const variablesResponse = await fetchWithRetry(
        `${this.apiUrl}/api/v2/site/${siteUid}/variables`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        },
        MODULE,
        'setSiteVariable'
      );

      if (!variablesResponse.ok && variablesResponse.status !== 404) {
        return Logger.error({
          module: MODULE,
          context: 'setSiteVariable',
          message: `Failed to fetch variables: HTTP ${variablesResponse.status}: ${variablesResponse.statusText}`,
        });
      }

      let variableId: string | null = null;

      if (variablesResponse.ok) {
        const variables = (await variablesResponse.json()) as {
          variables: { id: string; name: string }[];
        };
        const match = variables.variables.find((v) => v.name === variableName);
        if (match) variableId = match.id;
      }

      let response;
      if (variableId) {
        response = await fetchWithRetry(
          `${this.apiUrl}/api/v2/site/${siteUid}/variable/${variableId}`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: variableName, value }),
          },
          MODULE,
          'setSiteVariable'
        );
      } else {
        response = await fetchWithRetry(
          `${this.apiUrl}/api/v2/site/${siteUid}/variable`,
          {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: variableName, value }),
          },
          MODULE,
          'setSiteVariable'
        );
      }

      if (!response.ok) {
        return Logger.error({
          module: MODULE,
          context: 'setSiteVariable',
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      return { data: true };
    } catch (error) {
      return Logger.error({
        module: MODULE,
        context: 'setSiteVariable',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getSiteVariable(
    siteUid: string,
    variableName: string
  ): Promise<APIResponse<string | null>> {
    const { data: token, error: tokenError } = await this.getToken();
    if (tokenError) return { error: tokenError };

    try {
      const variablesResponse = await fetchWithRetry(
        `${this.apiUrl}/api/v2/site/${siteUid}/variables`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        },
        MODULE,
        'getSiteVariable'
      );

      if (!variablesResponse.ok) {
        if (variablesResponse.status === 404) return { data: null };
        return Logger.error({
          module: MODULE,
          context: 'getSiteVariable',
          message: `HTTP ${variablesResponse.status}: ${variablesResponse.statusText}`,
        });
      }

      const variables = (await variablesResponse.json()) as {
        variables: { id: string; name: string; value: string; masked: boolean }[];
      };
      const match = variables.variables.find((v) => v.name === variableName);

      return { data: match?.value ?? null };
    } catch (error) {
      return Logger.error({
        module: MODULE,
        context: 'getSiteVariable',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private postFilter<T>(items: T[], filters?: LocalFilters<T>): T[] {
    return applyFilters(
      items as unknown as Record<string, unknown>[],
      filters as unknown as LocalFilters<Record<string, unknown>>
    ) as T[];
  }

  private async getToken(): Promise<APIResponse<string>> {
    try {
      if (this.token && new Date().getTime() < this.tokenExpiry.getTime()) {
        return { data: this.token };
      }

      const apiKey = this.config.apiKey;
      const apiSecretKey = this.config.apiSecretKey;

      if (!apiKey || !apiSecretKey) {
        return Logger.error({
          module: MODULE,
          context: 'getToken',
          message: 'Failed to decrypt API credentials',
        });
      }

      const response = await fetch(`${this.config.url}/auth/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + btoa('public-client:public'),
        },
        body: new URLSearchParams({
          grant_type: 'password',
          username: apiKey,
          password: apiSecretKey,
        }),
      });

      if (!response.ok) {
        return Logger.error({
          module: MODULE,
          context: 'getToken',
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      const data = (await response.json()) as { access_token: string; expires_in?: number };
      this.token = data.access_token;
      this.tokenExpiry = new Date(
        new Date().getTime() + (data.expires_in ? data.expires_in * 1000 : 55 * 60 * 1000)
      );

      return { data: data.access_token };
    } catch (error) {
      return Logger.error({
        module: MODULE,
        context: 'getToken',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
