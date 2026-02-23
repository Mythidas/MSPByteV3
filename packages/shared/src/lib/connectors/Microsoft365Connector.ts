import { APIResponse, Logger } from '@workspace/shared/lib/utils/logger';
import { MSGraphGroup } from '@workspace/shared/types/integrations/microsoft/groups';
import { MSGraphIdentity } from '@workspace/shared/types/integrations/microsoft/identity';
import { MSGraphSubscribedSku } from '@workspace/shared/types/integrations/microsoft/licenses';
import { MSGraphConditionalAccessPolicy } from '@workspace/shared/types/integrations/microsoft/policies';
import { MSGraphRole } from '@workspace/shared/types/integrations/microsoft/roles';
import {
  applyFilters,
  type ConnectorFilters,
  type FilterClause,
  type FieldFilter,
} from '@workspace/shared/types/connector';
import { MSGraphError } from '@workspace/shared/types/integrations/microsoft/index';

export interface Microsoft365Config {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  mode?: 'direct' | 'partner';
  certificatePem?: string;
  domainMappings?: { domain: string; siteId?: string }[];
  refreshToken?: string;
  onRefreshToken?: (newToken: string) => void;
}

export class Microsoft365Connector {
  private tokenCache = new Map<string, { token: string; expiration: Date }>();

  constructor(
    private config: Microsoft365Config,
    private targetTenantId?: string
  ) {}

  async checkHealth(): Promise<APIResponse<boolean>> {
    try {
      const { data: token, error } = await this.getToken();
      if (error) return { error };
      return { data: !!token };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'checkHealth',
        message: String(err),
      });
    }
  }

  forTenant(customerTenantId: string): Microsoft365Connector {
    return new Microsoft365Connector(this.config, customerTenantId);
  }

  async getIdentities(
    filters?: ConnectorFilters<MSGraphIdentity>,
    fetchAll?: boolean
  ): Promise<APIResponse<{ identities: MSGraphIdentity[]; next?: string }>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const url =
        filters?.cursor ??
        this.makeGraphURL(
          'https://graph.microsoft.com/v1.0/users',
          filters,
          'id,displayName,userPrincipalName,mail,accountEnabled,createdDateTime,signInActivity,assignedLicenses,assignedPlans'
        );

      if (fetchAll) {
        const values = await this.getAllPaged(url);
        return { data: { identities: values } };
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) await this.throwGraphError(response);

      const json = await response.json();
      const identities: MSGraphIdentity[] = json.value || [];

      return {
        data: {
          identities,
          next: json['@odata.nextLink'] || undefined,
        },
      };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'getIdentities',
        message: String(err),
      });
    }
  }

  async getGroups(
    filters?: ConnectorFilters<MSGraphGroup>,
    fetchAll?: boolean
  ): Promise<APIResponse<{ groups: MSGraphGroup[]; next?: string }>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const url =
        filters?.cursor ??
        this.makeGraphURL(
          'https://graph.microsoft.com/v1.0/groups',
          filters,
          'id,displayName,description,groupTypes,mailEnabled,securityEnabled,membershipRule'
        );

      if (fetchAll) {
        const values = await this.getAllPaged(url);
        return { data: { groups: values } };
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) await this.throwGraphError(response);

      const json = await response.json();
      return { data: { groups: json.value || [], next: json['@odata.nextLink'] || undefined } };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'getGroups',
        message: String(err),
      });
    }
  }

  async getGroupMembers(
    groupId: string,
    filters?: ConnectorFilters<any>,
    fetchAll?: boolean
  ): Promise<APIResponse<{ members: any[]; next?: string }>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const url =
        filters?.cursor ??
        this.makeGraphURL(
          `https://graph.microsoft.com/v1.0/groups/${groupId}/members`,
          filters,
          'id,displayName,userPrincipalName'
        );

      if (fetchAll) {
        const values = await this.getAllPaged(url);
        return { data: { members: values } };
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) await this.throwGraphError(response);

      const json = await response.json();
      return { data: { members: json.value || [], next: json['@odata.nextLink'] || undefined } };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'getGroupMembers',
        message: String(err),
      });
    }
  }

  async getGroupMemberOf(
    groupId: string,
    filters?: ConnectorFilters<any>,
    fetchAll?: boolean
  ): Promise<APIResponse<{ groups: any[]; next?: string }>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const url =
        filters?.cursor ??
        this.makeGraphURL(
          `https://graph.microsoft.com/v1.0/groups/${groupId}/memberOf`,
          filters,
          'id,displayName'
        );

      if (fetchAll) {
        const values = await this.getAllPaged(url);
        return { data: { groups: values } };
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) await this.throwGraphError(response);

      const json = await response.json();
      return { data: { groups: json.value || [], next: json['@odata.nextLink'] || undefined } };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'getGroupMemberOf',
        message: String(err),
      });
    }
  }

  async getSubscribedSkus(
    filters?: ConnectorFilters<MSGraphSubscribedSku>,
    fetchAll?: boolean
  ): Promise<APIResponse<{ skus: MSGraphSubscribedSku[]; next?: string }>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const url = filters?.cursor ?? 'https://graph.microsoft.com/v1.0/subscribedSkus';

      if (fetchAll) {
        const values = await this.getAllPaged(url);
        return { data: { skus: values } };
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) await this.throwGraphError(response);

      const json = await response.json();
      return { data: { skus: json.value || [], next: json['@odata.nextLink'] || undefined } };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'getSubscribedSkus',
        message: String(err),
      });
    }
  }

  async getRoles(
    filters?: ConnectorFilters<MSGraphRole>,
    fetchAll?: boolean
  ): Promise<APIResponse<{ roles: MSGraphRole[]; next?: string }>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const url =
        filters?.cursor ??
        this.makeGraphURL(
          'https://graph.microsoft.com/v1.0/directoryRoles',
          filters,
          'id,displayName,description,roleTemplateId'
        );

      if (fetchAll) {
        const values = await this.getAllPaged(url);
        return { data: { roles: values } };
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) await this.throwGraphError(response);

      const json = await response.json();
      return { data: { roles: json.value || [], next: json['@odata.nextLink'] || undefined } };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'getRoles',
        message: String(err),
      });
    }
  }

  async getRoleMembers(
    roleId: string,
    filters?: ConnectorFilters<any>,
    fetchAll?: boolean
  ): Promise<APIResponse<{ members: any[]; next?: string }>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const url =
        filters?.cursor ??
        this.makeGraphURL(
          `https://graph.microsoft.com/v1.0/directoryRoles/${roleId}/members`,
          filters,
          'id,displayName,userPrincipalName'
        );

      if (fetchAll) {
        const values = await this.getAllPaged(url);
        return { data: { members: values } };
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) await this.throwGraphError(response);

      const json = await response.json();
      return { data: { members: json.value || [], next: json['@odata.nextLink'] || undefined } };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'getRoleMembers',
        message: String(err),
      });
    }
  }

  async getConditionalAccessPolicies(
    filters?: ConnectorFilters<MSGraphConditionalAccessPolicy>,
    fetchAll?: boolean
  ): Promise<APIResponse<{ policies: MSGraphConditionalAccessPolicy[]; next?: string }>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const url =
        filters?.cursor ?? 'https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies';

      if (fetchAll) {
        const values = await this.getAllPaged(url);
        return { data: { policies: values } };
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) await this.throwGraphError(response);

      const json = await response.json();
      return { data: { policies: json.value || [], next: json['@odata.nextLink'] || undefined } };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'getConditionalAccessPolicies',
        message: String(err),
      });
    }
  }

  async getSecurityDefaultsEnabled(): Promise<APIResponse<boolean>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const response = await fetch(
        'https://graph.microsoft.com/v1.0/policies/identitySecurityDefaultsEnforcementPolicy',
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) await this.throwGraphError(response);

      const json = await response.json();
      return { data: json.isEnabled === true };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'getSecurityDefaultsEnabled',
        message: String(err),
      });
    }
  }

  async getTenantDomains(
    filters?: ConnectorFilters<any>,
    fetchAll?: boolean
  ): Promise<APIResponse<{ domains: any[]; next?: string }>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const url =
        filters?.cursor ??
        this.makeGraphURL(
          'https://graph.microsoft.com/v1.0/domains',
          filters,
          'id,isDefault,isVerified,authenticationType'
        );

      if (fetchAll) {
        const values = await this.getAllPaged(url);
        return { data: { domains: values } };
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) await this.throwGraphError(response);

      const json = await response.json();
      return { data: { domains: json.value || [], next: json['@odata.nextLink'] || undefined } };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'getTenantDomains',
        message: String(err),
      });
    }
  }

  async getGDAPCustomers(
    filters?: ConnectorFilters<any>,
    fetchAll?: boolean
  ): Promise<APIResponse<{ customers: any[]; next?: string }>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const url =
        filters?.cursor ??
        'https://graph.microsoft.com/v1.0/tenantRelationships/delegatedAdminRelationships';

      if (fetchAll) {
        const values = await this.getAllPaged(url);
        return { data: { customers: values } };
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) await this.throwGraphError(response);

      const json = await response.json();
      return { data: { customers: json.value || [], next: json['@odata.nextLink'] || undefined } };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'getGDAPCustomers',
        message: String(err),
      });
    }
  }

  async checkServicePrincipalExists(): Promise<APIResponse<boolean>> {
    try {
      const { data: token, error } = await this.getToken();
      if (error) return { data: false };

      const url = `https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '${this.config.clientId}'&$count=true`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          ConsistencyLevel: 'eventual',
        },
      });

      if (!response.ok) return { data: false };

      const json = await response.json();
      return { data: (json.value?.length ?? 0) > 0 };
    } catch {
      return { data: false };
    }
  }

  async getServicePrincipalId(): Promise<APIResponse<string | null>> {
    try {
      const { data: token, error } = await this.getToken();
      if (error) return { error };

      const url = `https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '${this.config.clientId}'&$select=id&$count=true`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: 'eventual' },
      });

      if (!response.ok) await this.throwGraphError(response);

      const json = await response.json();
      return { data: json.value?.[0]?.id ?? null };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'getServicePrincipalId',
        message: String(err),
      });
    }
  }

  async assignDirectoryRole(
    principalId: string,
    roleDefinitionId: string
  ): Promise<APIResponse<boolean>> {
    try {
      const { data: token, error } = await this.getToken();
      if (error) return { error };

      const response = await fetch(
        'https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignments',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            '@odata.type': '#microsoft.graph.unifiedRoleAssignment',
            roleDefinitionId,
            principalId,
            directoryScopeId: '/',
          }),
        }
      );

      // 409/400 = already assigned — treat as success
      if (response.ok || response.status === 409) {
        return { data: true };
      }

      const res = (await response.json()) as MSGraphError;
      if (
        res.error.message.includes(
          'A conflicting object with one or more of the specified property values is present in the directory'
        )
      ) {
        return { data: true };
      }

      throw new Error(`${response.status} ${res.error.message}`);
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'assignDirectoryRole',
        message: String(err),
      });
    }
  }

  getActiveTenantId(): string {
    return this.targetTenantId ?? this.config.tenantId;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async getToken(overrideTenantId?: string): Promise<APIResponse<string>> {
    const tenantId = overrideTenantId ?? this.targetTenantId ?? this.config.tenantId;
    const cached = this.tokenCache.get(tenantId);

    if (cached && cached.expiration > new Date()) {
      return { data: cached.token };
    }

    try {
      const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
      const body = new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!response.ok) {
        throw new Error(`Token request failed: ${response.status} ${response.statusText}`);
      }

      const json = await response.json();
      const token = json.access_token as string;
      const expiration = new Date(Date.now() + (json.expires_in - 300) * 1000);
      this.tokenCache.set(tenantId, { token, expiration });

      return { data: token };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'getToken',
        message: String(err),
      });
    }
  }

  private async getAllPaged(url: string): Promise<any[]> {
    const { data: token, error: tokenError } = await this.getToken();
    if (tokenError) throw new Error(tokenError.message);

    const items: any[] = [];
    let nextUrl: string | undefined = url;

    while (nextUrl) {
      const response: Response = await fetch(nextUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) await this.throwGraphError(response);

      const json: any = await response.json();
      items.push(...(json.value || []));
      nextUrl = json['@odata.nextLink'];
    }

    return items;
  }

  private genWhereClause = <T>(clause: FilterClause<T>): string | null => {
    if ('and' in clause) {
      const parts = clause.and.map(this.genWhereClause).filter((s): s is string => s !== null);
      if (parts.length === 0) return null;
      if (parts.length === 1) return parts[0];
      return `(${parts.join(' and ')})`;
    }
    if ('or' in clause) {
      const parts = clause.or.map(this.genWhereClause);
      if (parts.some((p) => p === null)) return null;
      if (parts.length === 0) return null;
      if (parts.length === 1) return parts[0];
      return `(${(parts as string[]).join(' or ')})`;
    }

    const { field, op, value } = clause as FieldFilter<T>;
    const f = String(field);
    switch (op) {
      case 'eq':
        return `${f} eq ${this.formatODataValue(value)}`;
      case 'neq':
        return `${f} ne ${this.formatODataValue(value)}`;
      case 'contains':
        return `contains(${f}, ${this.formatODataValue(value)})`;
      case 'startsWith':
        return `startsWith(${f}, ${this.formatODataValue(value)})`;
      case 'endsWith':
        return `endsWith(${f}, ${this.formatODataValue(value)})`;
      case 'in':
        return `${f} in (${(value as unknown[]).map(this.formatODataValue).join(', ')})`;
      case 'lt':
        return `${f} lt ${this.formatODataValue(value)}`;
      case 'gt':
        return `${f} gt ${this.formatODataValue(value)}`;
      case 'lte':
        return `${f} le ${this.formatODataValue(value)}`;
      case 'gte':
        return `${f} ge ${this.formatODataValue(value)}`;
      default:
        return null;
    }
  };

  private makeGraphURL = <T>(
    base: string,
    filters?: ConnectorFilters<T>,
    defaultSelect?: string
  ): string => {
    const params = new URLSearchParams();
    params.set('$top', String(filters?.limit ?? 999));

    if (filters?.select) {
      params.set('$select', (filters.select as unknown as string[]).join(','));
    } else if (defaultSelect) {
      params.set('$select', defaultSelect);
    }

    if (filters?.where?.length) {
      const clauses = filters.where
        .map((c) => this.genWhereClause(c))
        .filter((s): s is string => s !== null);
      if (clauses.length > 0) {
        params.set('$filter', clauses.join(' and '));
      }
    }

    if (filters?.sort) {
      params.set('$orderby', `${String(filters.sort.field)} ${filters.sort.direction}`);
    }

    return `${base}?${params.toString()}`;
  };

  private async throwGraphError(response: Response): Promise<never> {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as MSGraphError;
      if (body?.error?.message) detail = body.error.message;
    } catch {
      // body was not JSON — fall back to statusText
    }
    throw new Error(`Graph API error: ${response.status} ${detail}`);
  }

  private formatODataValue(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    return `'${String(value)}'`;
  }
}
