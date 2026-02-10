import { APIResponse, Debug } from '@workspace/shared/lib/utils/debug';

export interface Microsoft365Config {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  domainMappings?: { domain: string; siteId?: string }[];
}

export class Microsoft365Connector {
  private token: string | null = null;
  private expiration: Date = new Date();

  constructor(private config: Microsoft365Config) {}

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

  async getIdentities(options: {
    domains: string[];
    cursor?: string;
  }): Promise<APIResponse<{ identities: any[]; next?: string }>> {
    try {
      const { data: token, error: tokenError } = await this.getToken();
      if (tokenError) return { error: tokenError };

      let url =
        options.cursor ||
        'https://graph.microsoft.com/v1.0/users?$top=999&$select=id,displayName,userPrincipalName,mail,accountEnabled,createdDateTime,signInActivity,assignedLicenses,assignedPlans';

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error(`Graph API error: ${response.status} ${response.statusText}`);

      const json = await response.json();
      const allUsers = json.value || [];

      // Filter by domains if provided
      const identities =
        options.domains.length > 0
          ? allUsers.filter((u: any) =>
              options.domains.some((d) => u.userPrincipalName?.toLowerCase().endsWith(d.toLowerCase())),
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
        'https://graph.microsoft.com/v1.0/groups?$top=999&$select=id,displayName,description,groupTypes,mailEnabled,securityEnabled,membershipRule',
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
        `https://graph.microsoft.com/v1.0/groups/${groupId}/members?$select=id,displayName,userPrincipalName,@odata.type`,
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
        `https://graph.microsoft.com/v1.0/groups/${groupId}/memberOf?$select=id,displayName,@odata.type`,
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

      const response = await fetch(
        'https://graph.microsoft.com/v1.0/subscribedSkus',
        { headers: { Authorization: `Bearer ${token}` } },
      );

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
        'https://graph.microsoft.com/v1.0/directoryRoles?$select=id,displayName,description,roleTemplateId',
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
        `https://graph.microsoft.com/v1.0/directoryRoles/${roleId}/members?$select=id,displayName,userPrincipalName,@odata.type`,
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
        { headers: { Authorization: `Bearer ${token}` } },
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
        { headers: { Authorization: `Bearer ${token}` } },
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

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async getToken(): Promise<APIResponse<string>> {
    if (this.token && this.expiration > new Date()) {
      return { data: this.token };
    }

    try {
      const url = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`;

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
      this.token = json.access_token;
      this.expiration = new Date(Date.now() + (json.expires_in - 300) * 1000);

      return { data: this.token! };
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
