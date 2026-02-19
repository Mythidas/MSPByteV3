import { APIResponse, Debug } from '@workspace/shared/lib/utils/debug';

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
      return Debug.error({
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

  async getIdentities(options: {
    domains: string[];
    cursor?: string;
  }): Promise<APIResponse<{ identities: any[]; next?: string }>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      const url =
        options.cursor ||
        'https://graph.microsoft.com/v1.0/users?$top=999&$select=id,displayName,userPrincipalName,mail,accountEnabled,createdDateTime,signInActivity,assignedLicenses,assignedPlans';

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok)
        throw new Error(`Graph API error: ${response.status} ${response.statusText}`);

      const json = await response.json();
      const allUsers = json.value || [];

      const identities =
        options.domains.length > 0
          ? allUsers.filter((u: any) =>
              options.domains.some((d) =>
                u.userPrincipalName?.toLowerCase().endsWith(d.toLowerCase())
              )
            )
          : allUsers;

      return {
        data: {
          identities,
          next: json['@odata.nextLink'] || undefined,
        },
      };
    } catch (err) {
      return Debug.error({
        module: 'Microsoft365Connector',
        context: 'getIdentities',
        message: String(err),
      });
    }
  }

  async getGroups(): Promise<APIResponse<any[]>> {
    try {
      const items = await this.getAllPaged(
        'https://graph.microsoft.com/v1.0/groups?$top=999&$select=id,displayName,description,groupTypes,mailEnabled,securityEnabled,membershipRule'
      );
      return { data: items };
    } catch (err) {
      return Debug.error({
        module: 'Microsoft365Connector',
        context: 'getGroups',
        message: String(err),
      });
    }
  }

  async getGroupMembers(groupId: string): Promise<APIResponse<any[]>> {
    try {
      const items = await this.getAllPaged(
        `https://graph.microsoft.com/v1.0/groups/${groupId}/members?$select=id,displayName,userPrincipalName,@odata.type`
      );
      return { data: items };
    } catch (err) {
      return Debug.error({
        module: 'Microsoft365Connector',
        context: 'getGroupMembers',
        message: String(err),
      });
    }
  }

  async getGroupMemberOf(groupId: string): Promise<APIResponse<any[]>> {
    try {
      const items = await this.getAllPaged(
        `https://graph.microsoft.com/v1.0/groups/${groupId}/memberOf?$select=id,displayName,@odata.type`
      );
      return { data: items };
    } catch (err) {
      return Debug.error({
        module: 'Microsoft365Connector',
        context: 'getGroupMemberOf',
        message: String(err),
      });
    }
  }

  async getSubscribedSkus(): Promise<APIResponse<any[]>> {
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
      return Debug.error({
        module: 'Microsoft365Connector',
        context: 'getSubscribedSkus',
        message: String(err),
      });
    }
  }

  async getRoles(): Promise<APIResponse<any[]>> {
    try {
      const items = await this.getAllPaged(
        'https://graph.microsoft.com/v1.0/directoryRoles?$select=id,displayName,description,roleTemplateId'
      );
      return { data: items };
    } catch (err) {
      return Debug.error({
        module: 'Microsoft365Connector',
        context: 'getRoles',
        message: String(err),
      });
    }
  }

  async getRoleMembers(roleId: string): Promise<APIResponse<any[]>> {
    try {
      const items = await this.getAllPaged(
        `https://graph.microsoft.com/v1.0/directoryRoles/${roleId}/members?$select=id,displayName,userPrincipalName,@odata.type`
      );
      return { data: items };
    } catch (err) {
      return Debug.error({
        module: 'Microsoft365Connector',
        context: 'getRoleMembers',
        message: String(err),
      });
    }
  }

  async getConditionalAccessPolicies(): Promise<APIResponse<any[]>> {
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
      return Debug.error({
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
      return Debug.error({
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
      return Debug.error({
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
      return Debug.error({
        module: 'Microsoft365Connector',
        context: 'getGDAPCustomers',
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
      let body: URLSearchParams;

      if (this.config.refreshToken) {
        // Delegated flow: use refresh_token grant for both MSP and customer tenants.
        // This works across GDAP-managed tenants without creating an Enterprise App
        // in each customer tenant.
        body = new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: this.config.refreshToken,
          scope: 'https://graph.microsoft.com/.default offline_access',
        });
      } else {
        // Fallback: client_credentials (direct mode or partner without stored refresh_token)
        body = new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        });
      }

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

      // Notify caller if Microsoft rotated the refresh token
      if (json.refresh_token && json.refresh_token !== this.config.refreshToken) {
        this.config.refreshToken = json.refresh_token;
        this.config.onRefreshToken?.(json.refresh_token);
      }

      return { data: token };
    } catch (err) {
      return Debug.error({
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
}
