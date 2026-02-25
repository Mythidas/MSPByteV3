import { APIResponse, Logger } from '@workspace/shared/lib/utils/logger';
import {
  SophosPartnerConfig,
  SophosPartnerTenant,
  SophosPartnerAPIResponse,
  SophosTenantConfig,
} from '@workspace/shared/types/integrations/sophos/index';
import { SophosPartnerEndpoint } from '@workspace/shared/types/integrations/sophos/endpoints';
import {
  SophosPartnerFirewall,
  SophosPartnerFirewallLicense,
} from '@workspace/shared/types/integrations/sophos/firewall';
import { SophosPartnerLicense } from '@workspace/shared/types/integrations/sophos/licenses';
import { ConnectorFilters, applyFilters } from '@workspace/shared/types/connector';

export class SophosPartnerConnector {
  private token: string | null = null;
  private expiration: Date = new Date();

  constructor(private config: SophosPartnerConfig) {}

  async checkHealth(): Promise<APIResponse<boolean>> {
    const { data: token, error: tokenError } = await this.getToken();
    if (tokenError) return { error: tokenError };
    return { data: !!token };
  }

  async getTenants(
    filters?: ConnectorFilters<SophosPartnerTenant>
  ): Promise<APIResponse<SophosPartnerTenant[]>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const sophosPartner = await this.getPartnerID();
      if (sophosPartner.error) {
        throw new Error(sophosPartner.error.message);
      }

      const tenants: SophosPartnerTenant[] = [];
      const url = 'https://api.central.sophos.com/partner/v1/tenants';

      let page = 1;
      while (true) {
        const response = await this.fetchWithRetry(
          `${url}?pageTotal=true&pageSize=100&page=${page}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              'X-Partner-ID': sophosPartner.data,
            },
          },
          'getTenants'
        );

        if (!response.ok) {
          return Logger.error({
            module: 'SophosPartnerConnector',
            context: 'getTenants',
            message: `HTTP ${response.status}: ${response.statusText}`,
          });
        }

        const data: SophosPartnerAPIResponse<SophosPartnerTenant> =
          (await response.json()) as SophosPartnerAPIResponse<SophosPartnerTenant>;
        tenants.push(...data.items);

        if (page >= data.pages.total) {
          break;
        }
        page++;
      }

      // Default sort by name when no sort filter provided
      if (!filters?.sort) {
        tenants.sort((a, b) => a.name.localeCompare(b.name));
      }

      return { data: this.applyLocalFilters(tenants, filters) };
    } catch (err) {
      return Logger.error({
        module: 'SophosPartnerConnector',
        context: 'getTenants',
        message: String(err),
      });
    }
  }

  async getEndpoints(
    config: SophosTenantConfig,
    filters?: ConnectorFilters<SophosPartnerEndpoint>
  ): Promise<APIResponse<SophosPartnerEndpoint[]>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const path = '/endpoint/v1/endpoints?pageSize=500&pageTotal=true';
      const url = config.apiHost + path;

      const endpoints: SophosPartnerEndpoint[] = [];
      let page = 1;
      while (true) {
        const response = await this.fetchWithRetry(
          `${url}&page=${page}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              'X-Tenant-ID': config.tenantId,
            },
          },
          'getEndpoints'
        );

        if (!response.ok) {
          return Logger.error({
            module: 'SophosPartnerConnector',
            context: 'getEndpoints',
            message: `HTTP ${response.status}: ${response.statusText}`,
          });
        }

        const data: SophosPartnerAPIResponse<SophosPartnerEndpoint> =
          (await response.json()) as SophosPartnerAPIResponse<SophosPartnerEndpoint>;
        endpoints.push(...data.items);

        if (page >= data.pages.total) {
          break;
        }
        page++;
      }

      return { data: this.applyLocalFilters(endpoints, filters) };
    } catch (err) {
      return Logger.error({
        module: 'SophosPartnerConnector',
        context: 'getEndpoints',
        message: String(err),
      });
    }
  }

  async getFirewalls(
    config: SophosTenantConfig,
    filters?: ConnectorFilters<SophosPartnerFirewall>
  ): Promise<APIResponse<SophosPartnerFirewall[]>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const path = '/firewall/v1/firewalls';
      const url = config.apiHost + path;

      const response = await this.fetchWithRetry(
        url,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Tenant-ID': config.tenantId,
          },
        },
        'getFirewalls'
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      const data = (await response.json()) as {
        items: SophosPartnerFirewall[];
      };

      if (data.items && data.items.length) {
        const fwResponse = await this.fetchWithRetry(
          url + '/actions/firmware-upgrade-check',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'X-Tenant-ID': config.tenantId,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              firewalls: data.items.map((fw: SophosPartnerFirewall) => fw.id),
            }),
          },
          'getFirewalls'
        );

        const firmwares = (await fwResponse.json()) as any;
        if (firmwares.firewalls && firmwares.firewalls.length) {
          for (const check of firmwares.firewalls) {
            const firewall = data.items.find((fw: SophosPartnerFirewall) => fw.id === check.id);
            if (firewall) {
              firewall.firmware = {
                ...check,
                newestFirmware: check.upgradeToVersion[0] || '',
              };
            }
          }
        }
      }

      return { data: this.applyLocalFilters([...data.items], filters) };
    } catch (err) {
      return Logger.error({
        module: 'SophosPartnerConnector',
        context: 'getFirewalls',
        message: String(err),
      });
    }
  }

  async getFirewallLicenses(
    config?: SophosTenantConfig,
    filters?: ConnectorFilters<SophosPartnerFirewallLicense>
  ): Promise<APIResponse<SophosPartnerFirewallLicense[]>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const { data: partnerId, error: idError } = await this.getPartnerID();
      if (idError) return { error: idError };

      const headers = config
        ? {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Tenant-ID': config.tenantId,
          }
        : {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Partner-ID': partnerId,
          };

      const url = 'https://api.central.sophos.com/licenses/v1/licenses/firewalls';
      const response = await this.fetchWithRetry(
        url,
        {
          method: 'GET',
          headers: headers as any,
        },
        'getFirewallLicenses'
      );

      if (!response.ok) {
        return Logger.error({
          module: 'SophosPartnerConnector',
          context: 'getFirewallLicenses',
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      const result =
        (await response.json()) as SophosPartnerAPIResponse<SophosPartnerFirewallLicense>;

      return { data: this.applyLocalFilters(result.items, filters) };
    } catch (err) {
      return Logger.error({
        module: 'SophosPartnerConnector',
        context: 'getFirewallLicenses',
        message: String(err),
      });
    }
  }

  async getLicenses(config: SophosTenantConfig): Promise<APIResponse<SophosPartnerLicense>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const url = 'https://api.central.sophos.com/licenses/v1/licenses';
      const response = await this.fetchWithRetry(
        url,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Tenant-ID': config.tenantId,
          },
        },
        'getLicenses'
      );

      if (!response.ok) {
        return Logger.error({
          module: 'SophosPartnerConnector',
          context: 'getLicenses',
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      const result = (await response.json()) as SophosPartnerLicense;

      return { data: result };
    } catch (err) {
      return Logger.error({
        module: 'SophosPartnerConnector',
        context: 'getLicenses',
        message: String(err),
      });
    }
  }

  private async getPartnerID(): Promise<APIResponse<string>> {
    try {
      const { data: token } = await this.getToken();

      const response = await this.fetchWithRetry(
        'https://api.central.sophos.com/whoami/v1',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        'getPartnerID'
      );

      if (!response.ok) {
        return Logger.error({
          module: 'SophosPartnerConnector',
          context: 'getPartnerID',
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      const data = (await response.json()) as { id: string };

      return {
        data: data.id,
      };
    } catch (err) {
      return Logger.error({
        module: 'SophosPartnerConnector',
        context: 'getPartnerID',
        message: String(err),
      });
    }
  }

  private async getToken(): Promise<APIResponse<string>> {
    try {
      if (this.token) {
        const expired = new Date().getTime() >= this.expiration.getTime() - 5000;
        if (!expired) return { data: this.token };
      }

      const clientId = this.config.clientId;
      const clientSecret = this.config.clientSecret;

      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret || '',
        scope: 'token',
      });

      const response = await fetch('https://id.sophos.com/api/v2/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        return Logger.error({
          module: 'SophosPartnerConnector',
          context: 'getToken',
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      const data = (await response.json()) as {
        expires_in: number;
        access_token: string;
      };
      this.token = data.access_token;
      this.expiration = new Date(new Date().getTime() + data.expires_in * 1000);

      return {
        data: data.access_token,
      };
    } catch (err) {
      return Logger.error({
        module: 'SophosPartnerConnector',
        context: 'getToken',
        message: String(err),
      });
    }
  }

  private async fetchWithRetry(url: string, init: RequestInit, context: string): Promise<Response> {
    const MAX_RETRIES = 5;
    const DEFAULT_RETRY_MS = 60_000;
    Logger.trace({
      module: 'SophosPartnerConnector',
      context,
      message: `Starting fetch on url: ${url}`,
    });

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(url, init);
      if (response.status !== 429) return response;
      if (attempt === MAX_RETRIES) {
        Logger.warn({
          module: 'SophosPartnerConnector',
          context,
          message: `429 persisted after ${MAX_RETRIES} retries`,
        });
        return response;
      }
      const retryAfter = response.headers.get('Retry-After');
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : DEFAULT_RETRY_MS;
      Logger.warn({
        module: 'SophosPartnerConnector',
        context,
        message: `429 rate limited. Waiting ${waitMs}ms (retry ${attempt + 1}/${MAX_RETRIES})`,
      });
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }
    throw new Error('fetchWithRetry: exceeded retry logic');
  }

  private applyLocalFilters<T>(items: T[], filters?: ConnectorFilters<T>): T[] {
    let result = applyFilters(
      items as unknown as Record<string, unknown>[],
      filters as unknown as ConnectorFilters<Record<string, unknown>>
    ) as T[];
    if (filters?.sort) {
      const { field, direction } = filters.sort;
      result = result.sort((a, b) => {
        const cmp = String(a[field]).localeCompare(String(b[field]));
        return direction === 'desc' ? -cmp : cmp;
      });
    }
    if (filters?.limit) result = result.slice(0, filters.limit);
    return result;
  }
}
