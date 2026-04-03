import type { MSGraphDomain } from "@workspace/shared/types/integrations/microsoft/domains";
import { Microsoft365HTTPClient } from "./http-client";
import z from "zod";
import type { MSGraphGroup } from "@workspace/shared/types/integrations/microsoft/groups";
import type { MSGraphIdentity } from "@workspace/shared/types/integrations/microsoft/identity";
import type { MSGraphSubscribedSku } from "@workspace/shared/types/integrations/microsoft/licenses";
import type { MSGraphConditionalAccessPolicy } from "@workspace/shared/types/integrations/microsoft/policies";
import type { MSGraphRole } from "@workspace/shared/types/integrations/microsoft/roles";
import type {
  Microsoft365Config,
  MSGraphReturn,
} from "@workspace/shared/types/integrations/microsoft";
import type { MSGraphDelegatedRelationship } from "@workspace/shared/types/integrations/microsoft/gdap";

export type GraphParams = {
  $select?: string;
  $filter?: string;
  $orderby?: string;
  $top?: number;
  cursor?: string;
};

function buildGraphUrl(base: string, params?: GraphParams): string {
  if (params?.cursor) return params.cursor;
  const q = new URLSearchParams();
  if (params?.$select) q.set("$select", params.$select);
  if (params?.$filter) q.set("$filter", params.$filter);
  if (params?.$orderby) q.set("$orderby", params.$orderby);
  if (params?.$top) q.set("$top", String(params.$top));
  const qs = q.toString();
  return qs ? `${base}?${qs}` : base;
}

export class Microsoft365Connector {
  private readonly client: Microsoft365HTTPClient;

  readonly users: {
    list(
      params?: GraphParams,
    ): Promise<{ items: MSGraphIdentity[]; next?: string }>;
    listAll(params?: GraphParams): Promise<MSGraphIdentity[]>;
    memberOf(userId: string, all?: boolean): Promise<Record<string, unknown>[]>;
  };

  readonly groups: {
    list(
      params?: GraphParams,
    ): Promise<{ items: MSGraphGroup[]; next?: string }>;
    listAll(params?: GraphParams): Promise<MSGraphGroup[]>;
    members(groupId: string, all?: boolean): Promise<Record<string, unknown>[]>;
    memberOf(groupId: string, all?: boolean): Promise<Record<string, unknown>[]>;
  };

  readonly subscribedSkus: {
    list(
      params?: GraphParams,
    ): Promise<{ items: MSGraphSubscribedSku[]; next?: string }>;
    listAll(params?: GraphParams): Promise<MSGraphSubscribedSku[]>;
  };

  readonly directoryRoles: {
    list(
      params?: GraphParams,
    ): Promise<{ items: MSGraphRole[]; next?: string }>;
    listAll(params?: GraphParams): Promise<MSGraphRole[]>;
    members(roleTemplateId: string, all?: boolean): Promise<Record<string, unknown>[]>;
  };

  readonly identity: {
    conditionalAccess: {
      policies: {
        list(
          params?: GraphParams,
        ): Promise<{ items: MSGraphConditionalAccessPolicy[]; next?: string }>;
        listAll(): Promise<MSGraphConditionalAccessPolicy[]>;
      };
    };
  };

  readonly policies: {
    identitySecurityDefaults: {
      isEnabled(): Promise<boolean>;
    };
  };

  readonly domains: {
    list(
      params?: GraphParams,
    ): Promise<{ items: MSGraphDomain[]; next?: string }>;
    listAll(params?: GraphParams): Promise<MSGraphDomain[]>;
  };

  readonly tenantRelationships: {
    delegatedAdminRelationships: {
      list(
        params?: GraphParams,
      ): Promise<{ items: MSGraphDelegatedRelationship[]; next?: string }>;
      listAll(): Promise<MSGraphDelegatedRelationship[]>;
    };
  };

  readonly servicePrincipals: {
    findOwn(): Promise<{ id: string } | null>;
  };

  readonly roleManagement: {
    directory: {
      roleAssignments: {
        create(principalId: string, roleDefinitionId: string): Promise<void>;
      };
    };
  };

  constructor(
    readonly config: Microsoft365Config,
    private targetTenantId?: string,
  ) {
    this.client = new Microsoft365HTTPClient(config);
    this.users = this.buildUsersNamespace();
    this.groups = this.buildGroupsNamespace();
    this.subscribedSkus = this.buildSubscribedSkusNamespace();
    this.directoryRoles = this.buildDirectoryRolesNamespace();
    this.identity = this.buildIdentityNamespace();
    this.policies = this.buildPoliciesNamespace();
    this.domains = this.buildDomainsNamespace();
    this.tenantRelationships = this.buildTenantRelationshipsNamespace();
    this.servicePrincipals = this.buildServicePrincipalsNamespace();
    this.roleManagement = this.buildRoleManagementNamespace();
  }

  forTenant(customerTenantId: string): Microsoft365Connector {
    return new Microsoft365Connector(this.config, customerTenantId);
  }

  clearTokenCache(): void {
    this.client.clearCache();
  }

  getActiveTenantId(): string {
    return this.targetTenantId ?? this.config.tenantId;
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.client.getToken(this.config.tenantId);
      return true;
    } catch {
      return false;
    }
  }

  private tenantId(): string {
    return this.targetTenantId ?? this.config.tenantId;
  }

  private buildUsersNamespace(): Microsoft365Connector["users"] {
    const client = this.client;
    const tenantId = () => this.tenantId();
    const defaultSelect =
      "id,displayName,userPrincipalName,mail,accountEnabled,createdDateTime,signInActivity,assignedLicenses,assignedPlans";

    return {
      async list(params?) {
        const url = buildGraphUrl("https://graph.microsoft.com/v1.0/users", {
          $select: defaultSelect,
          ...params,
        });
        const json = await client.get<MSGraphReturn<MSGraphIdentity[]>>(url, tenantId());
        return {
          items: json.value || [],
          next: json["@odata.nextLink"] || undefined,
        };
      },
      async listAll(params?) {
        const url = buildGraphUrl("https://graph.microsoft.com/v1.0/users", {
          $select: defaultSelect,
          ...params,
        });
        return client.getAllPaged<MSGraphIdentity>(url, tenantId());
      },
      async memberOf(userId, all?) {
        const url = buildGraphUrl(
          `https://graph.microsoft.com/v1.0/users/${userId}/memberOf`,
          {
            $select:
              "id,displayName,description,groupTypes,mailEnabled,securityEnabled,membershipRule",
          },
        );
        if (all) return client.getAllPaged<Record<string, unknown>>(url, tenantId());
        const json = await client.get<MSGraphReturn<Record<string, unknown>[]>>(url, tenantId());
        return json.value || [];
      },
    };
  }

  private buildGroupsNamespace(): Microsoft365Connector["groups"] {
    const client = this.client;
    const tenantId = () => this.tenantId();
    const defaultSelect =
      "id,displayName,description,groupTypes,mailEnabled,securityEnabled,membershipRule";

    return {
      async list(params?) {
        const url = buildGraphUrl("https://graph.microsoft.com/v1.0/groups", {
          $select: defaultSelect,
          ...params,
        });
        const json = await client.get<MSGraphReturn<MSGraphGroup[]>>(
          url,
          tenantId(),
        );
        return {
          items: json.value || [],
          next: json["@odata.nextLink"] || undefined,
        };
      },
      async listAll(params?) {
        const url = buildGraphUrl("https://graph.microsoft.com/v1.0/groups", {
          $select: defaultSelect,
          ...params,
        });
        return client.getAllPaged<MSGraphGroup>(url, tenantId());
      },
      async members(groupId, all?) {
        const url = buildGraphUrl(
          `https://graph.microsoft.com/v1.0/groups/${groupId}/members`,
          { $select: "id,displayName,userPrincipalName" },
        );
        if (all) return client.getAllPaged<Record<string, unknown>>(url, tenantId());
        const json = await client.get<MSGraphReturn<Record<string, unknown>[]>>(url, tenantId());
        return json.value || [];
      },
      async memberOf(groupId, all?) {
        const url = buildGraphUrl(
          `https://graph.microsoft.com/v1.0/groups/${groupId}/memberOf`,
          { $select: "id,displayName" },
        );
        if (all) return client.getAllPaged<Record<string, unknown>>(url, tenantId());
        const json = await client.get<MSGraphReturn<Record<string, unknown>[]>>(url, tenantId());
        return json.value || [];
      },
    };
  }

  private buildSubscribedSkusNamespace(): Microsoft365Connector["subscribedSkus"] {
    const client = this.client;
    const tenantId = () => this.tenantId();
    const url = "https://graph.microsoft.com/v1.0/subscribedSkus";

    return {
      async list(params?) {
        const finalUrl = params?.cursor ?? url;
        const json = await client.get<MSGraphReturn<MSGraphSubscribedSku[]>>(finalUrl, tenantId());
        return {
          items: json.value || [],
          next: json["@odata.nextLink"] || undefined,
        };
      },
      async listAll() {
        return client.getAllPaged<MSGraphSubscribedSku>(url, tenantId());
      },
    };
  }

  private buildDirectoryRolesNamespace(): Microsoft365Connector["directoryRoles"] {
    const client = this.client;
    const tenantId = () => this.tenantId();

    return {
      async list(params?) {
        const url = buildGraphUrl(
          "https://graph.microsoft.com/v1.0/directoryRoles",
          {
            $select: "id,displayName,description,roleTemplateId",
            ...params,
          },
        );
        const json = await client.get<MSGraphReturn<MSGraphRole[]>>(url, tenantId());
        return {
          items: json.value || [],
          next: json["@odata.nextLink"] || undefined,
        };
      },
      async listAll(params?) {
        const url = buildGraphUrl(
          "https://graph.microsoft.com/v1.0/directoryRoles",
          {
            $select: "id,displayName,description,roleTemplateId",
            ...params,
          },
        );
        return client.getAllPaged<MSGraphRole>(url, tenantId());
      },
      async members(roleTemplateId, all?) {
        const url = buildGraphUrl(
          `https://graph.microsoft.com/v1.0/directoryRoles(roleTemplateId='${roleTemplateId}')/members`,
          { $select: "id,displayName,userPrincipalName" },
        );
        if (all) return client.getAllPaged<Record<string, unknown>>(url, tenantId(), [404]);
        const tid = tenantId();
        const token = await client.getToken(tid);
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 404) return [];
        if (!response.ok)
          throw new Error(
            `Graph API error: ${response.status} ${response.statusText}`,
          );
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const json = (await response.json()) as MSGraphReturn<Record<string, unknown>[]>;
        return json.value || [];
      },
    };
  }

  private buildIdentityNamespace(): Microsoft365Connector["identity"] {
    const client = this.client;
    const tenantId = () => this.tenantId();
    const baseUrl =
      "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies";

    return {
      conditionalAccess: {
        policies: {
          async list(params?) {
            const url = params?.cursor ?? baseUrl;
            const json = await client.get<MSGraphReturn<MSGraphConditionalAccessPolicy[]>>(url, tenantId());
            return {
              items: json.value || [],
              next: json["@odata.nextLink"] || undefined,
            };
          },
          async listAll() {
            return client.getAllPaged<MSGraphConditionalAccessPolicy>(
              baseUrl,
              tenantId(),
            );
          },
        },
      },
    };
  }

  private buildPoliciesNamespace(): Microsoft365Connector["policies"] {
    const client = this.client;
    const tenantId = () => this.tenantId();

    return {
      identitySecurityDefaults: {
        async isEnabled() {
          const json = await client.get<{ isEnabled: boolean }>(
            "https://graph.microsoft.com/v1.0/policies/identitySecurityDefaultsEnforcementPolicy",
            tenantId(),
          );
          return json.isEnabled === true;
        },
      },
    };
  }

  private buildDomainsNamespace(): Microsoft365Connector["domains"] {
    const client = this.client;
    const tenantId = () => this.tenantId();

    return {
      async list(params?) {
        const url = buildGraphUrl("https://graph.microsoft.com/v1.0/domains", {
          $select: "id,isDefault,isVerified,authenticationType",
          ...params,
        });
        const json = await client.get<MSGraphReturn<MSGraphDomain[]>>(
          url,
          tenantId(),
        );
        return {
          items: json.value || [],
          next: json["@odata.nextLink"] || undefined,
        };
      },
      async listAll(params?) {
        const url = buildGraphUrl("https://graph.microsoft.com/v1.0/domains", {
          $select: "id,isDefault,isVerified,authenticationType",
          ...params,
        });
        return client.getAllPaged<MSGraphDomain>(url, tenantId());
      },
    };
  }

  private buildTenantRelationshipsNamespace(): Microsoft365Connector["tenantRelationships"] {
    const client = this.client;
    const tenantId = () => this.tenantId();
    const baseUrl =
      "https://graph.microsoft.com/v1.0/tenantRelationships/delegatedAdminRelationships";

    return {
      delegatedAdminRelationships: {
        async list(params?) {
          const url = params?.cursor ?? baseUrl;
          const json = await client.get<
            MSGraphReturn<MSGraphDelegatedRelationship[]>
          >(url, tenantId());
          return {
            items: json.value || [],
            next: json["@odata.nextLink"] || undefined,
          };
        },
        async listAll() {
          return client.getAllPaged<MSGraphDelegatedRelationship>(
            baseUrl,
            tenantId(),
          );
        },
      },
    };
  }

  private buildServicePrincipalsNamespace(): Microsoft365Connector["servicePrincipals"] {
    const client = this.client;
    const tenantId = () => this.tenantId();
    const clientId = this.config.clientId;

    return {
      async findOwn() {
        const url = `https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '${clientId}'&$select=id&$count=true`;
        const json = await client.get<MSGraphReturn<Array<{ id: string }>>>(url, tenantId(), {
          ConsistencyLevel: "eventual",
        });
        return json.value?.[0] ? { id: json.value[0].id } : null;
      },
    };
  }

  private buildRoleManagementNamespace(): Microsoft365Connector["roleManagement"] {
    const client = this.client;
    const tenantId = () => this.tenantId();

    return {
      directory: {
        roleAssignments: {
          async create(principalId, roleDefinitionId) {
            const tid = tenantId();
            const token = await client.getToken(tid);
            const response = await fetch(
              "https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignments",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  "@odata.type": "#microsoft.graph.unifiedRoleAssignment",
                  roleDefinitionId,
                  principalId,
                  directoryScopeId: "/",
                }),
              },
            );

            // 409 / 400 "conflicting object" = already assigned — treat as success
            if (response.ok || response.status === 409) return;
            const res: unknown = await response.json().catch(() => null);
            const parsed = z.object({ error: z.object({ message: z.string() }) }).safeParse(res);
            const msg = parsed.success ? parsed.data.error.message : response.statusText;
            if (
              msg.includes(
                "A conflicting object with one or more of the specified property values",
              )
            )
              return;
            throw new Error(
              `Microsoft365Connector.roleAssignments.create: ${response.status} ${msg}`,
            );
          },
        },
      },
    };
  }
}
