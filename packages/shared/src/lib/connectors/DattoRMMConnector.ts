import { APIResponse, Logger } from '@workspace/shared/lib/utils/logger';
import {
  DattoRMMConfig,
  DattoRMMPagination,
} from '@workspace/shared/types/integrations/datto/index';
import { DattoRMMDevice } from '@workspace/shared/types/integrations/datto/devices';
import { DattoRMMSite } from '@workspace/shared/types/integrations/datto/sites';

export class DattoRMMConnector {
  private readonly apiUrl: string;

  constructor(private config: DattoRMMConfig) {
    this.apiUrl = this.config.url;
  }

  async checkHealth(): Promise<APIResponse<boolean>> {
    const { data: token, error } = await this.getToken();
    if (error) return { error };
    return { data: !!token };
  }

  async getSites(): Promise<APIResponse<DattoRMMSite[]>> {
    const { data: token, error: tokenError } = await this.getToken();
    if (tokenError) return { error: tokenError };

    const sites: DattoRMMSite[] = [];
    let url = `${this.apiUrl}/api/v2/account/sites`;

    try {
      while (true) {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          return Logger.error({
            module: 'DattoRMMConnector',
            context: 'getSites',
            message: `HTTP ${response.status}: ${response.statusText}`,
          });
        }

        const data = (await response.json()) as {
          sites: DattoRMMSite[];
          pageDetails: DattoRMMPagination;
        };

        // Handle pagination - Datto RMM returns data in 'sites' array
        if (data.sites && Array.isArray(data.sites)) {
          sites.push(...data.sites);

          if (data.pageDetails && data.pageDetails.nextPageUrl) {
            url = data.pageDetails.nextPageUrl;
          } else break;
        } else {
          // No more sites to fetch
          break;
        }
      }

      return { data: sites };
    } catch (error) {
      return Logger.error({
        module: 'DattoRMMConnector',
        context: 'getSites',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getDevices(siteId: string): Promise<APIResponse<DattoRMMDevice[]>> {
    const { data: token, error: tokenError } = await this.getToken();
    if (tokenError) return { error: tokenError };

    const devices: DattoRMMDevice[] = [];
    let url = `${this.apiUrl}/api/v2/site/${siteId}/devices`;

    try {
      while (true) {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          return Logger.error({
            module: 'DattoRMMConnector',
            context: 'getDevices',
            message: `HTTP ${response.status}: ${response.statusText}`,
          });
        }

        const data = (await response.json()) as {
          devices: DattoRMMDevice[];
          pageDetails: DattoRMMPagination;
        };

        // Handle pagination - Datto RMM returns data in 'sites' array
        if (data.devices && Array.isArray(data.devices)) {
          devices.push(...data.devices);

          if (data.pageDetails && data.pageDetails.nextPageUrl) {
            url = data.pageDetails.nextPageUrl;
          } else break;
        } else {
          // No more sites to fetch
          break;
        }
      }

      return { data: devices };
    } catch (error) {
      return Logger.error({
        module: 'DattoRMMConnector',
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
      // First, get all variables to find the variableId
      const variablesResponse = await fetch(`${this.apiUrl}/api/v2/site/${siteUid}/variables`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!variablesResponse.ok && variablesResponse.status !== 404) {
        return Logger.error({
          module: 'DattoRMMConnector',
          context: 'setSiteVariable',
          message: `Failed to fetch variables: HTTP ${variablesResponse.status}: ${variablesResponse.statusText}`,
        });
      }

      let variableId: string | null = null;

      if (variablesResponse.ok) {
        const variables = (await variablesResponse.json()) as {
          variables: {
            id: string;
            name: string;
          }[];
        };
        const matchingVariable = variables.variables.find((v: any) => v.name === variableName);
        if (matchingVariable) {
          variableId = matchingVariable.id;
        }
      }

      let response;
      if (variableId) {
        // Update existing variable using variableId
        response = await fetch(`${this.apiUrl}/api/v2/site/${siteUid}/variable/${variableId}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: variableName,
            value: value,
          }),
        });
      } else {
        // Create new variable (no variableId in path)
        response = await fetch(`${this.apiUrl}/api/v2/site/${siteUid}/variable`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: variableName,
            value: value,
          }),
        });
      }

      if (!response.ok) {
        return Logger.error({
          module: 'DattoRMMConnector',
          context: 'setSiteVariable',
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      return { data: true };
    } catch (error) {
      return Logger.error({
        module: 'DattoRMMConnector',
        context: 'setSiteVariable',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get a site variable from Datto RMM
   * @param siteUid - The Datto site UID
   * @param variableName - The variable name to retrieve
   */
  async getSiteVariable(
    siteUid: string,
    variableName: string
  ): Promise<APIResponse<string | null>> {
    const { data: token, error: tokenError } = await this.getToken();
    if (tokenError) return { error: tokenError };

    try {
      // First, get all variables to find the variableId
      const variablesResponse = await fetch(`${this.apiUrl}/api/v2/site/${siteUid}/variables`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!variablesResponse.ok) {
        if (variablesResponse.status === 404) {
          // Variable doesn't exist
          return { data: null };
        }
        return Logger.error({
          module: 'DattoRMMConnector',
          context: 'getSiteVariable',
          message: `HTTP ${variablesResponse.status}: ${variablesResponse.statusText}`,
        });
      }

      const variables = (await variablesResponse.json()) as {
        variables: {
          id: string;
          name: string;
          value: string;
          masked: boolean;
        }[];
      };
      const matchingVariable = variables.variables.find((v: any) => v.name === variableName);

      return { data: matchingVariable?.value || null };
    } catch (error) {
      return Logger.error({
        module: 'DattoRMMConnector',
        context: 'getSiteVariable',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async getToken(): Promise<APIResponse<string>> {
    try {
      // Decrypt credentials
      const apiKey = this.config.apiKey;
      const apiSecretKey = this.config.apiSecretKey;

      if (!apiKey || !apiSecretKey) {
        return Logger.error({
          module: 'DattoRMMConnector',
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
          module: 'DattoRMMConnector',
          context: 'getToken',
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      const data = (await response.json()) as { access_token: string };
      return { data: data.access_token };
    } catch (error) {
      return Logger.error({
        module: 'DattoRMMConnector',
        context: 'getToken',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
