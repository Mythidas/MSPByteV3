import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Microsoft365Connector } from './Microsoft365Connector.js';

const CONFIG = { tenantId: 'tenant-1', clientId: 'client-1', clientSecret: 'secret-1' };

function mockFetch(responses: Array<{ ok: boolean; status?: number; body: unknown }>) {
  let call = 0;
  return vi.fn().mockImplementation(() => {
    const r = responses[call++] ?? responses[responses.length - 1];
    return Promise.resolve({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 400),
      statusText: r.ok ? 'OK' : 'Bad Request',
      json: async () => r.body,
    });
  });
}

describe('Microsoft365Connector', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getToken (via checkHealth)', () => {
    it('fetches and caches a token', async () => {
      const fetch = mockFetch([
        { ok: true, body: { access_token: 'tok-1', expires_in: 3600 } },
        { ok: true, body: { value: [] } }, // first checkHealth graph call
        { ok: true, body: { value: [] } }, // second checkHealth (should reuse token)
      ]);
      vi.stubGlobal('fetch', fetch);
      const connector = new Microsoft365Connector(CONFIG);
      await connector.checkHealth();
      await connector.checkHealth(); // second call — should reuse token
      // Token endpoint called only once
      const tokenCalls = fetch.mock.calls.filter(([url]) =>
        (url as string).includes('oauth2')
      );
      expect(tokenCalls).toHaveLength(1);
    });

    it('returns error when token request fails', async () => {
      vi.stubGlobal('fetch', mockFetch([{ ok: false, status: 401, body: {} }]));
      const connector = new Microsoft365Connector(CONFIG);
      const { error } = await connector.checkHealth();
      expect(error).toBeDefined();
    });
  });

  describe('getServicePrincipalId', () => {
    it('returns the SP object id when found', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          { ok: true, body: { value: [{ id: 'sp-123' }] } },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getServicePrincipalId();
      expect(data).toBe('sp-123');
    });

    it('returns null when SP not found', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          { ok: true, body: { value: [] } },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getServicePrincipalId();
      expect(data).toBeNull();
    });
  });

  describe('assignDirectoryRole', () => {
    it('returns true on 201 created', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          { ok: true, status: 201, body: {} },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).assignDirectoryRole(
        'sp-1',
        'role-1'
      );
      expect(data).toBe(true);
    });

    it('treats 409 (already assigned) as success', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          { ok: false, status: 409, body: {} },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).assignDirectoryRole(
        'sp-1',
        'role-1'
      );
      expect(data).toBe(true);
    });

    it('returns error on non-409 failure', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          { ok: false, status: 403, body: {} },
        ])
      );
      const { error } = await new Microsoft365Connector(CONFIG).assignDirectoryRole(
        'sp-1',
        'role-1'
      );
      expect(error).toBeDefined();
    });
  });

  describe('getIdentities', () => {
    it('returns a list of identities', async () => {
      const identities = [
        {
          id: 'u1',
          displayName: 'Alice',
          userPrincipalName: 'alice@contoso.com',
          accountEnabled: true,
          assignedLicenses: [],
          assignedPlans: [],
        },
      ];
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          { ok: true, body: { value: identities } },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getIdentities();
      expect(data?.identities).toHaveLength(1);
      expect(data?.identities[0].id).toBe('u1');
    });

    it('returns pagination cursor when nextLink is present', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          {
            ok: true,
            body: {
              value: [{ id: 'u1' }],
              '@odata.nextLink': 'https://graph.microsoft.com/next-page',
            },
          },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getIdentities();
      expect(data?.next).toBe('https://graph.microsoft.com/next-page');
    });
  });

  describe('getGroups', () => {
    it('returns list of groups', async () => {
      const groups = [
        { id: 'g1', displayName: 'Sales', groupTypes: [], mailEnabled: false, securityEnabled: true },
      ];
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          { ok: true, body: { value: groups } },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getGroups();
      expect(data?.groups).toHaveLength(1);
      expect(data?.groups[0].id).toBe('g1');
    });

    it('returns pagination cursor when nextLink is present', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          {
            ok: true,
            body: { value: [{ id: 'g1' }], '@odata.nextLink': 'https://graph.microsoft.com/groups-next' },
          },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getGroups();
      expect(data?.next).toBe('https://graph.microsoft.com/groups-next');
    });
  });

  describe('getGroupMembers', () => {
    it('returns list of members', async () => {
      const members = [{ id: 'u1', displayName: 'Alice', userPrincipalName: 'alice@contoso.com' }];
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          { ok: true, body: { value: members } },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getGroupMembers('group-1');
      expect(data?.members).toHaveLength(1);
      expect(data?.members[0].id).toBe('u1');
    });

    it('returns pagination cursor when nextLink is present', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          {
            ok: true,
            body: { value: [{ id: 'u1' }], '@odata.nextLink': 'https://graph.microsoft.com/members-next' },
          },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getGroupMembers('group-1');
      expect(data?.next).toBe('https://graph.microsoft.com/members-next');
    });
  });

  describe('getGroupMemberOf', () => {
    it('returns list of groups the group belongs to', async () => {
      const parentGroups = [{ id: 'pg1', displayName: 'All Staff' }];
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          { ok: true, body: { value: parentGroups } },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getGroupMemberOf('group-1');
      expect(data?.groups).toHaveLength(1);
      expect(data?.groups[0].id).toBe('pg1');
    });

    it('returns pagination cursor when nextLink is present', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          {
            ok: true,
            body: { value: [{ id: 'pg1' }], '@odata.nextLink': 'https://graph.microsoft.com/memberof-next' },
          },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getGroupMemberOf('group-1');
      expect(data?.next).toBe('https://graph.microsoft.com/memberof-next');
    });
  });

  describe('getSubscribedSkus', () => {
    it('returns list of subscribed SKUs', async () => {
      const skus = [{ skuId: 'sku-1', skuPartNumber: 'ENTERPRISEPACK', consumedUnits: 10 }];
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          { ok: true, body: { value: skus } },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getSubscribedSkus();
      expect(data?.skus).toHaveLength(1);
      expect(data?.skus[0].skuId).toBe('sku-1');
    });

    it('returns pagination cursor when nextLink is present', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          {
            ok: true,
            body: { value: [{ skuId: 'sku-1' }], '@odata.nextLink': 'https://graph.microsoft.com/skus-next' },
          },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getSubscribedSkus();
      expect(data?.next).toBe('https://graph.microsoft.com/skus-next');
    });
  });

  describe('getRoles', () => {
    it('returns list of directory roles', async () => {
      const roles = [{ id: 'r1', displayName: 'Global Administrator', description: 'All access', roleTemplateId: 'tmpl-1' }];
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          { ok: true, body: { value: roles } },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getRoles();
      expect(data?.roles).toHaveLength(1);
      expect(data?.roles[0].id).toBe('r1');
    });

    it('returns pagination cursor when nextLink is present', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          {
            ok: true,
            body: { value: [{ id: 'r1' }], '@odata.nextLink': 'https://graph.microsoft.com/roles-next' },
          },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getRoles();
      expect(data?.next).toBe('https://graph.microsoft.com/roles-next');
    });
  });

  describe('getRoleMembers', () => {
    it('returns list of role members', async () => {
      const members = [{ id: 'u1', displayName: 'Alice', userPrincipalName: 'alice@contoso.com' }];
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          { ok: true, body: { value: members } },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getRoleMembers('role-1');
      expect(data?.members).toHaveLength(1);
      expect(data?.members[0].id).toBe('u1');
    });

    it('returns pagination cursor when nextLink is present', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          {
            ok: true,
            body: { value: [{ id: 'u1' }], '@odata.nextLink': 'https://graph.microsoft.com/role-members-next' },
          },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getRoleMembers('role-1');
      expect(data?.next).toBe('https://graph.microsoft.com/role-members-next');
    });
  });

  describe('getConditionalAccessPolicies', () => {
    it('returns list of policies', async () => {
      const policies = [{ id: 'p1', displayName: 'Require MFA', state: 'enabled' }];
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          { ok: true, body: { value: policies } },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getConditionalAccessPolicies();
      expect(data?.policies).toHaveLength(1);
      expect(data?.policies[0].id).toBe('p1');
    });

    it('returns pagination cursor when nextLink is present', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          {
            ok: true,
            body: { value: [{ id: 'p1' }], '@odata.nextLink': 'https://graph.microsoft.com/policies-next' },
          },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getConditionalAccessPolicies();
      expect(data?.next).toBe('https://graph.microsoft.com/policies-next');
    });
  });

  describe('getTenantDomains', () => {
    it('returns list of tenant domains', async () => {
      const domains = [{ id: 'contoso.com', isDefault: true, isVerified: true, authenticationType: 'Managed' }];
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          { ok: true, body: { value: domains } },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getTenantDomains();
      expect(data?.domains).toHaveLength(1);
      expect(data?.domains[0].id).toBe('contoso.com');
    });

    it('returns pagination cursor when nextLink is present', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          {
            ok: true,
            body: { value: [{ id: 'contoso.com' }], '@odata.nextLink': 'https://graph.microsoft.com/domains-next' },
          },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getTenantDomains();
      expect(data?.next).toBe('https://graph.microsoft.com/domains-next');
    });
  });

  describe('getGDAPCustomers', () => {
    it('returns list of GDAP customers', async () => {
      const customers = [{ id: 'rel-1', customer: { tenantId: 'cust-tenant-1', displayName: 'Contoso Ltd' } }];
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          { ok: true, body: { value: customers } },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getGDAPCustomers();
      expect(data?.customers).toHaveLength(1);
      expect(data?.customers[0].id).toBe('rel-1');
    });

    it('returns pagination cursor when nextLink is present', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, body: { access_token: 'tok', expires_in: 3600 } },
          {
            ok: true,
            body: { value: [{ id: 'rel-1' }], '@odata.nextLink': 'https://graph.microsoft.com/gdap-next' },
          },
        ])
      );
      const { data } = await new Microsoft365Connector(CONFIG).getGDAPCustomers();
      expect(data?.next).toBe('https://graph.microsoft.com/gdap-next');
    });
  });
});
