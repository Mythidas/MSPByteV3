import { APIResponse, Logger } from '@workspace/shared/lib/utils/logger';
import { fetchWithRetry } from '@workspace/shared/lib/utils/fetchWithRetry';
import type {
  SophosPartnerConfig,
  SophosPartnerTenant,
  SophosPartnerAPIResponse,
  SophosTenantConfig,
} from '@workspace/shared/types/integrations/sophos/index';
import type { SophosPartnerEndpoint } from '@workspace/shared/types/integrations/sophos/endpoints';
import type {
  SophosPartnerFirewall,
  SophosPartnerFirewallFirmware,
  SophosPartnerFirewallLicense,
} from '@workspace/shared/types/integrations/sophos/firewall';
import type { SophosPartnerLicense } from '@workspace/shared/types/integrations/sophos/licenses';
import { type LocalFilters, applyFilters } from '@workspace/shared/types/connector';

const MODULE = 'SophosPartnerConnector';

export class SophosPartnerConnector {
  private token: string | null = null;
  private tokenExpiry: Date = new Date();
  private partnerId: string | null = null;

  constructor(private config: SophosPartnerConfig) {}

  async checkHealth(): Promise<APIResponse<boolean>> {
    const { data: token, error: tokenError } = await this.getToken();
    if (tokenError) return { error: tokenError };
    return { data: !!token };
  }

  async getTenants(
    filters?: LocalFilters<SophosPartnerTenant>
  ): Promise<APIResponse<SophosPartnerTenant[]>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const { data: partnerId, error: idError } = await this.getPartnerID();
      if (idError) return { error: idError };

      const baseUrl = 'https://api.central.sophos.com/partner/v1/tenants?pageTotal=true&pageSize=100';
      const tenants = await this.fetchAllPages<SophosPartnerTenant>(baseUrl, {
        Authorization: `Bearer ${token}`,
        'X-Partner-ID': partnerId,
      });

      if (!filters?.sort) {
        tenants.sort((a, b) => a.name.localeCompare(b.name));
      }

      return { data: this.postFilter(tenants, filters) };
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'getTenants', message: String(err) });
    }
  }

  async getEndpoints(
    config: SophosTenantConfig,
    filters?: LocalFilters<SophosPartnerEndpoint>
  ): Promise<APIResponse<SophosPartnerEndpoint[]>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const baseUrl = `${config.apiHost}/endpoint/v1/endpoints?pageSize=500&pageTotal=true`;
      const endpoints = await this.fetchAllPages<SophosPartnerEndpoint>(baseUrl, {
        Authorization: `Bearer ${token}`,
        'X-Tenant-ID': config.tenantId,
      });

      return { data: this.postFilter(endpoints, filters) };
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'getEndpoints', message: String(err) });
    }
  }

  async getFirewalls(
    config: SophosTenantConfig,
    filters?: LocalFilters<SophosPartnerFirewall>
  ): Promise<APIResponse<SophosPartnerFirewall[]>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const baseUrl = `${config.apiHost}/firewall/v1/firewalls?pageTotal=true&pageSize=100`;
      const headers = {
        Authorization: `Bearer ${token}`,
        'X-Tenant-ID': config.tenantId,
      };

      const firewalls = await this.fetchAllPages<SophosPartnerFirewall>(baseUrl, headers);

      if (firewalls.length > 0) {
        const fwResponse = await fetchWithRetry(
          `${config.apiHost}/firewall/v1/firewalls/actions/firmware-upgrade-check`,
          {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ firewalls: firewalls.map((fw) => fw.id) }),
          },
          MODULE,
          'getFirewalls'
        );

        if (fwResponse.ok) {
          const firmwares = (await fwResponse.json()) as {
            firewalls: { id: string; upgradeToVersion: string[] }[];
          };
          for (const check of firmwares.firewalls ?? []) {
            const firewall = firewalls.find((fw) => fw.id === check.id);
            if (firewall) {
              firewall.firmware = {
                id: check.id,
                upgradeToVersion: check.upgradeToVersion,
                newestFirmware: check.upgradeToVersion[0] ?? '',
              } as SophosPartnerFirewallFirmware;
            }
          }
        }
      }

      return { data: this.postFilter(firewalls, filters) };
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'getFirewalls', message: String(err) });
    }
  }

  async getPartnerFirewallLicenses(
    filters?: LocalFilters<SophosPartnerFirewallLicense>
  ): Promise<APIResponse<SophosPartnerFirewallLicense[]>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const { data: partnerId, error: idError } = await this.getPartnerID();
      if (idError) return { error: idError };

      return this.fetchFirewallLicenses(token, { 'X-Partner-ID': partnerId }, filters);
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'getPartnerFirewallLicenses', message: String(err) });
    }
  }

  async getTenantFirewallLicenses(
    config: SophosTenantConfig,
    filters?: LocalFilters<SophosPartnerFirewallLicense>
  ): Promise<APIResponse<SophosPartnerFirewallLicense[]>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      return this.fetchFirewallLicenses(token, { 'X-Tenant-ID': config.tenantId }, filters);
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'getTenantFirewallLicenses', message: String(err) });
    }
  }

  async getLicenses(config: SophosTenantConfig): Promise<APIResponse<SophosPartnerLicense>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const response = await fetchWithRetry(
        'https://api.central.sophos.com/licenses/v1/licenses',
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Tenant-ID': config.tenantId,
          },
        },
        MODULE,
        'getLicenses'
      );

      if (!response.ok) {
        return Logger.error({
          module: MODULE,
          context: 'getLicenses',
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      return { data: (await response.json()) as SophosPartnerLicense };
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'getLicenses', message: String(err) });
    }
  }

  private async fetchFirewallLicenses(
    token: string,
    scopeHeader: Record<string, string>,
    filters?: LocalFilters<SophosPartnerFirewallLicense>
  ): Promise<APIResponse<SophosPartnerFirewallLicense[]>> {
    const response = await fetchWithRetry(
      'https://api.central.sophos.com/licenses/v1/licenses/firewalls',
      {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...scopeHeader },
      },
      MODULE,
      'fetchFirewallLicenses'
    );

    if (!response.ok) {
      return Logger.error({
        module: MODULE,
        context: 'fetchFirewallLicenses',
        message: `HTTP ${response.status}: ${response.statusText}`,
      });
    }

    const result = (await response.json()) as SophosPartnerAPIResponse<SophosPartnerFirewallLicense>;
    return { data: this.postFilter(result.items, filters) };
  }

  private async fetchAllPages<T>(
    baseUrl: string,
    headers: Record<string, string>
  ): Promise<T[]> {
    const items: T[] = [];
    let page = 1;

    while (true) {
      const response = await fetchWithRetry(
        `${baseUrl}&page=${page}`,
        { method: 'GET', headers },
        MODULE,
        'fetchAllPages'
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as SophosPartnerAPIResponse<T>;
      items.push(...data.items);

      if (page >= data.pages.total) break;
      page++;
    }

    return items;
  }

  private async getPartnerID(): Promise<APIResponse<string>> {
    if (this.partnerId) return { data: this.partnerId };

    try {
      const { data: token } = await this.getToken();

      const response = await fetchWithRetry(
        'https://api.central.sophos.com/whoami/v1',
        { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
        MODULE,
        'getPartnerID'
      );

      if (!response.ok) {
        return Logger.error({
          module: MODULE,
          context: 'getPartnerID',
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      const data = (await response.json()) as { id: string };
      this.partnerId = data.id;
      return { data: data.id };
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'getPartnerID', message: String(err) });
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
      if (this.token) {
        const expired = new Date().getTime() >= this.tokenExpiry.getTime() - 5000;
        if (!expired) return { data: this.token };
      }

      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret || '',
        scope: 'token',
      });

      const response = await fetch('https://id.sophos.com/api/v2/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!response.ok) {
        return Logger.error({
          module: MODULE,
          context: 'getToken',
          message: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      const data = (await response.json()) as { expires_in: number; access_token: string };
      this.token = data.access_token;
      this.tokenExpiry = new Date(new Date().getTime() + data.expires_in * 1000);

      return { data: data.access_token };
    } catch (err) {
      return Logger.error({ module: MODULE, context: 'getToken', message: String(err) });
    }
  }
}
