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
});
