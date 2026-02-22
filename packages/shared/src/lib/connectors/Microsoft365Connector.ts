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

  /**
   * Returns a new connector scoped to a specific customer tenant.
   * Uses the same credentials but acquires tokens for the target tenant.
   */
  forTenant(customerTenantId: string): Microsoft365Connector {
    return new Microsoft365Connector(this.config, customerTenantId);
  }

  /**
   * Fetches identities from the Graph API.
   *
   * Filter translation:
   * - Supported ops (eq, neq, contains, startsWith, in, lt, gt, lte, gte) → OData $filter server-side
   * - `endsWith` → post-filter in-memory (Graph doesn't support it in $filter)
   * - `or` with any untranslatable sub-clause → post-filter in-memory
   * - `cursor` → used as the full nextLink URL for pagination
   */
  async getIdentities(
    filters?: ConnectorFilters<MSGraphIdentity>,
    fetchAll?: boolean
  ): Promise<APIResponse<{ identities: MSGraphIdentity[]; next?: string }>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const url =
        filters?.cursor ?? this.makeGraphURL('https://graph.microsoft.com/v1.0/users', filters);

      if (fetchAll) {
        const values = await this.getAllPaged(url);
        return { data: { identities: values } };
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok)
        throw new Error(`Graph API error: ${response.status} ${response.statusText}`);

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

  async getGroups(): Promise<APIResponse<MSGraphGroup[]>> {
    try {
      const items = await this.getAllPaged(
        'https://graph.microsoft.com/v1.0/groups?$top=999&$select=id,displayName,description,groupTypes,mailEnabled,securityEnabled,membershipRule'
      );
      return { data: items };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'getGroups',
        message: String(err),
      });
    }
  }

  async getGroupMembers(groupId: string): Promise<APIResponse<any[]>> {
    try {
      const items = await this.getAllPaged(
        `https://graph.microsoft.com/v1.0/groups/${groupId}/members?$select=id,displayName,userPrincipalName`
      );
      return { data: items };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'getGroupMembers',
        message: String(err),
      });
    }
  }

  async getGroupMemberOf(groupId: string): Promise<APIResponse<any[]>> {
    try {
      const items = await this.getAllPaged(
        `https://graph.microsoft.com/v1.0/groups/${groupId}/memberOf?$select=id,displayName`
      );
      return { data: items };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'getGroupMemberOf',
        message: String(err),
      });
    }
  }

  async getSubscribedSkus(): Promise<APIResponse<MSGraphSubscribedSku[]>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const response = await fetch('https://graph.microsoft.com/v1.0/subscribedSkus', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error(`Graph API error: ${response.status}`);

      const json = await response.json();
      return { data: json.value || [] };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'getSubscribedSkus',
        message: String(err),
      });
    }
  }

  async getRoles(): Promise<APIResponse<MSGraphRole[]>> {
    try {
      const items = await this.getAllPaged(
        'https://graph.microsoft.com/v1.0/directoryRoles?$select=id,displayName,description,roleTemplateId'
      );
      return { data: items };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'getRoles',
        message: String(err),
      });
    }
  }

  async getRoleMembers(roleId: string): Promise<APIResponse<any[]>> {
    try {
      const items = await this.getAllPaged(
        `https://graph.microsoft.com/v1.0/directoryRoles/${roleId}/members?$select=id,displayName,userPrincipalName`
      );
      return { data: items };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'getRoleMembers',
        message: String(err),
      });
    }
  }

  async getConditionalAccessPolicies(): Promise<APIResponse<MSGraphConditionalAccessPolicy[]>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const response = await fetch(
        'https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies',
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) throw new Error(`Graph API error: ${response.status}`);

      const json = await response.json();
      return { data: json.value || [] };
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

      if (!response.ok) throw new Error(`Graph API error: ${response.status}`);

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

  /**
   * Lists verified domains in the target tenant.
   * Used to discover which domains belong to each GDAP customer.
   */
  async getTenantDomains(): Promise<APIResponse<any[]>> {
    try {
      const items = await this.getAllPaged(
        'https://graph.microsoft.com/v1.0/domains?$select=id,isDefault,isVerified,authenticationType'
      );
      return { data: items };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'getTenantDomains',
        message: String(err),
      });
    }
  }

  /**
   * Lists active GDAP (delegated admin) relationships for this partner tenant.
   * Only relevant in partner mode.
   */
  async getGDAPCustomers(): Promise<APIResponse<any[]>> {
    try {
      const items = await this.getAllPaged(
        'https://graph.microsoft.com/v1.0/tenantRelationships/delegatedAdminRelationships'
      );
      return { data: items };
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'getGDAPCustomers',
        message: String(err),
      });
    }
  }

  /**
   * Checks whether the enterprise app (service principal) exists in the target tenant.
   * Used to determine if admin consent has been granted for a GDAP customer tenant.
   */
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

  /**
   * Returns the Object ID of the app's service principal in the target tenant, or null if not found.
   */
  async getServicePrincipalId(): Promise<APIResponse<string | null>> {
    try {
      const { data: token, error } = await this.getToken();
      if (error) return { error };

      const url = `https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '${this.config.clientId}'&$select=id&$count=true`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: 'eventual' },
      });

      if (!response.ok) throw new Error(`Graph API error: ${response.status} ${response.statusText}`);

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

  /**
   * Assigns a directory role to a service principal via the unified RBAC API.
   * Returns true on success, false if the assignment already exists (409/400 treated as success).
   * Requires RoleManagement.ReadWrite.Directory.
   */
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
      if (response.ok || response.status === 409 || response.status === 400) {
        return { data: true };
      }

      throw new Error(`${response.status} ${response.statusText}`);
    } catch (err) {
      return Logger.error({
        module: 'Microsoft365Connector',
        context: 'assignDirectoryRole',
        message: String(err),
      });
    }
  }

  /**
   * Returns the currently active tenant ID (customer or own).
   */
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

      if (!response.ok) throw new Error(`Graph API error: ${response.status}`);

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

    const { field, op, value } = clause as FieldFilter<MSGraphIdentity>;
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

  private makeGraphURL = <T>(base: string, filters?: ConnectorFilters<T>): string => {
    const params = new URLSearchParams();
    params.set('$top', String(filters?.limit ?? 999));

    if (filters?.select) {
      params.set('$select', (filters.select as unknown as string[]).join(','));
    } else {
      params.set(
        '$select',
        'id,displayName,userPrincipalName,mail,accountEnabled,createdDateTime,signInActivity,assignedLicenses,assignedPlans'
      );
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

  private formatODataValue(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    return `'${String(value)}'`;
  }
}
