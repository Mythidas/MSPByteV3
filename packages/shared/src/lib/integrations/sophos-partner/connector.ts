import { SophosHTTPClient } from "./http-client";
import type {
  SophosPartnerConfig,
  SophosTenantConfig,
  SophosScope,
} from "@workspace/shared/types/integrations/sophos/index";
import type { SophosPartnerTenant } from "@workspace/shared/types/integrations/sophos/tenants";
import type {
  SophosPartnerEndpoint,
  SophosPartnerEndpointTP,
} from "@workspace/shared/types/integrations/sophos/endpoints";
import type {
  SophosPartnerFirewall,
  SophosPartnerFirewallLicense,
} from "@workspace/shared/types/integrations/sophos/firewall";
import type { SophosPartnerLicense } from "@workspace/shared/types/integrations/sophos/licenses";

export class SophosPartnerConnector {
  private readonly client: SophosHTTPClient;

  readonly partner: {
    tenants: {
      list(params?: { pageSize?: number }): Promise<SophosPartnerTenant[]>;
    };
  };

  readonly endpoint: {
    endpoints: {
      list(
        tenantConfig: SophosTenantConfig,
        params?: { pageSize?: number },
      ): Promise<SophosPartnerEndpoint[]>;
      tamper_protection: {
        get(
          tenantConfig: SophosTenantConfig,
          endpointId: string,
        ): Promise<SophosPartnerEndpointTP>;
      };
    };
  };

  readonly firewall: {
    firewalls: {
      list(
        tenantConfig: SophosTenantConfig,
        params?: { pageSize?: number },
      ): Promise<SophosPartnerFirewall[]>;
      firmwareUpgradeCheck(
        tenantConfig: SophosTenantConfig,
        firewallIds: string[],
      ): Promise<{ firewalls: { id: string; upgradeToVersion: string[] }[] }>;
    };
  };

  readonly licenses: {
    licenses: {
      get(tenantConfig: SophosTenantConfig): Promise<SophosPartnerLicense>;
    };
    firewalls: {
      list(scope: SophosScope): Promise<SophosPartnerFirewallLicense[]>;
    };
  };

  constructor(config: SophosPartnerConfig, tenantId: string) {
    this.client = new SophosHTTPClient(config, tenantId);
    this.partner = this.buildPartnerNamespace();
    this.endpoint = this.buildEndpointNamespace();
    this.firewall = this.buildFirewallNamespace();
    this.licenses = this.buildLicensesNamespace();
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.client.getToken();
      return true;
    } catch {
      return false;
    }
  }

  private buildPartnerNamespace(): SophosPartnerConnector["partner"] {
    const client = this.client;
    return {
      tenants: {
        async list(params?) {
          const headers = await client.partnerHeaders();
          const url = `https://api.central.sophos.com/partner/v1/tenants?pageTotal=true&pageSize=${params?.pageSize ?? 100}`;
          const tenants = await client.fetchAllPages<SophosPartnerTenant>(
            url,
            headers,
          );
          tenants.sort((a, b) => a.name.localeCompare(b.name));
          return tenants;
        },
      },
    };
  }

  private buildEndpointNamespace(): SophosPartnerConnector["endpoint"] {
    const client = this.client;
    return {
      endpoints: {
        async list(tenantConfig, params?) {
          const headers = await client.tenantHeaders(tenantConfig.tenantId);
          const url = `${tenantConfig.apiHost}/endpoint/v1/endpoints?pageSize=${params?.pageSize ?? 500}&pageTotal=true`;
          return client.fetchAllPages<SophosPartnerEndpoint>(url, headers);
        },
        tamper_protection: {
          async get(tenantConfig, endpointId) {
            const headers = await client.tenantHeaders(tenantConfig.tenantId);
            const url = `${tenantConfig.apiHost}/endpoint/v1/endpoints/${endpointId}/tamper-protection`;
            return client.get<SophosPartnerEndpointTP>(url, headers);
          },
        },
      },
    };
  }

  private buildFirewallNamespace(): SophosPartnerConnector["firewall"] {
    const client = this.client;
    const firewallMethods = {
      async list(
        tenantConfig: SophosTenantConfig,
        params?: { pageSize?: number },
      ) {
        const headers = await client.tenantHeaders(tenantConfig.tenantId);
        const url = `${tenantConfig.apiHost}/firewall/v1/firewalls?pageTotal=true&pageSize=${params?.pageSize ?? 100}`;
        const firewalls = await client.fetchAllPages<SophosPartnerFirewall>(
          url,
          headers,
        );

        if (firewalls.length > 0) {
          const result = await firewallMethods.firmwareUpgradeCheck(
            tenantConfig,
            firewalls.map((fw) => fw.id),
          );
          for (const check of result.firewalls ?? []) {
            const fw = firewalls.find((f) => f.id === check.id);
            if (fw) {
              fw.firmware = {
                id: check.id,
                upgradeToVersion: check.upgradeToVersion,
                newestFirmware: check.upgradeToVersion[0] ?? "",
              };
            }
          }
        }

        return firewalls;
      },
      async firmwareUpgradeCheck(
        tenantConfig: SophosTenantConfig,
        firewallIds: string[],
      ): Promise<{ firewalls: { id: string; upgradeToVersion: string[] }[] }> {
        const headers = await client.tenantHeaders(tenantConfig.tenantId);
        return client.post(
          `${tenantConfig.apiHost}/firewall/v1/firewalls/actions/firmware-upgrade-check`,
          headers,
          { firewalls: firewallIds },
        );
      },
    };
    return { firewalls: firewallMethods };
  }

  private buildLicensesNamespace(): SophosPartnerConnector["licenses"] {
    const client = this.client;
    return {
      licenses: {
        async get(tenantConfig) {
          const headers = await client.tenantHeaders(tenantConfig.tenantId);
          return client.get<SophosPartnerLicense>(
            "https://api.central.sophos.com/licenses/v1/licenses",
            { ...headers, Accept: "application/json" },
          );
        },
      },
      firewalls: {
        async list(scope) {
          const headers =
            scope.type === "partner"
              ? await client.partnerHeaders()
              : await client.tenantHeaders(scope.tenantId);
          const result = await client.get<{
            items: SophosPartnerFirewallLicense[];
          }>("https://api.central.sophos.com/licenses/v1/licenses/firewalls", {
            ...headers,
            Accept: "application/json",
          });
          return result.items;
        },
      },
    };
  }
}
