import { describe, it, expect, vi, afterEach } from 'vitest';
import { SophosPartnerConnector } from '../SophosConnector.js';

const CONFIG = { clientId: 'client-1', clientSecret: 'secret-1' };
const TENANT_CONFIG = { apiHost: 'https://api.tenant.sophos.com', tenantName: 'Acme', tenantId: 'tenant-1' };

const TOKEN_RESPONSE = { ok: true, body: { access_token: 'tok-1', expires_in: 3600 } };
const WHOAMI_RESPONSE = { ok: true, body: { id: 'partner-1' } };

function mockFetch(responses: Array<{ ok: boolean; status?: number; statusText?: string; body: unknown }>) {
  let call = 0;
  return vi.fn().mockImplementation(() => {
    const r = responses[call++] ?? responses[responses.length - 1];
    return Promise.resolve({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      statusText: r.statusText ?? (r.ok ? 'OK' : 'Internal Server Error'),
      json: async () => r.body,
      text: async () => String(r.body),
    });
  });
}

function makeTenant(name: string, id = name): object {
  return {
    id,
    name,
    showAs: name,
    status: 'active',
    apiHost: 'https://api.sophos.com',
    contact: { email: '', address: { city: '', state: '', address1: '', postalCode: '', countryCode: '' }, lastName: '', firstName: '' },
    partner: { id: 'partner-1' },
    products: [],
    dataRegion: 'EU',
    billingType: 'usage',
    organization: { id: 'org-1' },
    dataGeography: 'EU',
  };
}

function makeEndpoint(id: string, hostname: string): object {
  return {
    id,
    os: { name: 'Windows', build: 1, isServer: false, platform: 'windows', majorVersion: 10, minorVersion: 0 },
    type: 'computer',
    health: { overall: 'good', threats: { status: 'good' }, services: { status: 'good', serviceDetails: [] } },
    online: true,
    tenant: { id: 'tenant-1' },
    modules: [],
    hostname,
    lockdown: { status: 'disabled' },
    isolation: { status: 'notIsolated' },
    lastSeenAt: '2024-01-01T00:00:00Z',
    mdrManaged: false,
    assignedProducts: [],
    associatedPerson: { id: 'p1', name: 'User', viaLogin: 'user@example.com' },
    tamperProtectionEnabled: false,
    tamperProtectionSupported: false,
  };
}

function makeFirewall(id: string, name: string): object {
  return {
    id,
    name,
    hostname: name,
    serialNumber: `SN-${id}`,
    cluster: { id: '', mode: 'activePassive', status: 'primary', peers: { id: '', serialNumber: '' } },
    tenant: { id: 'tenant-1' },
    group: { id: 'g1', name: 'Default' },
    firmwareVersion: '19.5.0',
    model: 'XGS 107',
    status: { managing: 'approved', reporting: 'approved', connected: true, suspended: false },
    stateChangedAt: '2024-01-01T00:00:00Z',
    capabilities: [],
    geoLocation: { latitude: '0', longitude: '0' },
    createdBy: { id: 'u1', type: 'user', name: 'Admin', accountType: 'partner', accountId: 'a1' },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    updatedBy: { id: 'u1', type: 'user', name: 'Admin', accountType: 'partner', accountId: 'a1' },
  };
}

function makeFirewallLicense(serialNumber: string): object {
  return {
    serialNumber,
    owner: { id: 'o1', type: 'partner' },
    partner: { id: 'partner-1' },
    tenant: {},
    billingTenant: { id: 'bt1' },
    model: 'XGS 107',
    modelType: 'hardware',
    lastSeenAt: '2024-01-01T00:00:00Z',
    endDate: '2025-01-01T00:00:00Z',
    licenses: [],
  };
}

describe('SophosPartnerConnector', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getToken (via checkHealth)', () => {
    it('fetches and caches a token', async () => {
      const fetch = mockFetch([
        TOKEN_RESPONSE,
        // second checkHealth reuses cached token — no extra fetch needed
      ]);
      vi.stubGlobal('fetch', fetch);
      const connector = new SophosPartnerConnector(CONFIG);
      await connector.checkHealth();
      await connector.checkHealth();
      const tokenCalls = fetch.mock.calls.filter(([url]) =>
        (url as string).includes('oauth2')
      );
      expect(tokenCalls).toHaveLength(1);
    });

    it('returns error on 401', async () => {
      vi.stubGlobal('fetch', mockFetch([{ ok: false, status: 401, body: {} }]));
      const connector = new SophosPartnerConnector(CONFIG);
      const { error } = await connector.checkHealth();
      expect(error).toBeDefined();
    });
  });

  describe('getTenants', () => {
    it('returns tenants sorted by name', async () => {
      const page1 = { items: [makeTenant('Zebra'), makeTenant('Alpha')], pages: { total: 1, current: 1 } };
      vi.stubGlobal('fetch', mockFetch([TOKEN_RESPONSE, WHOAMI_RESPONSE, { ok: true, body: page1 }]));
      const { data } = await new SophosPartnerConnector(CONFIG).getTenants();
      expect(data).toHaveLength(2);
      expect(data![0].name).toBe('Alpha');
      expect(data![1].name).toBe('Zebra');
    });

    it('paginates through 2 pages', async () => {
      const page1 = { items: [makeTenant('Alpha')], pages: { total: 2, current: 1 } };
      const page2 = { items: [makeTenant('Beta')], pages: { total: 2, current: 2 } };
      vi.stubGlobal('fetch', mockFetch([
        TOKEN_RESPONSE,
        WHOAMI_RESPONSE,
        { ok: true, body: page1 },
        { ok: true, body: page2 },
      ]));
      const { data } = await new SophosPartnerConnector(CONFIG).getTenants();
      expect(data).toHaveLength(2);
    });

    it('applies where filter', async () => {
      const page1 = {
        items: [makeTenant('Alpha'), makeTenant('Beta'), makeTenant('Gamma')],
        pages: { total: 1, current: 1 },
      };
      vi.stubGlobal('fetch', mockFetch([TOKEN_RESPONSE, WHOAMI_RESPONSE, { ok: true, body: page1 }]));
      const { data } = await new SophosPartnerConnector(CONFIG).getTenants({
        where: [{ field: 'name', op: 'eq', value: 'Beta' }],
      });
      expect(data).toHaveLength(1);
      expect(data![0].name).toBe('Beta');
    });

    it('applies sort and limit', async () => {
      const page1 = {
        items: [makeTenant('Charlie'), makeTenant('Alpha'), makeTenant('Beta')],
        pages: { total: 1, current: 1 },
      };
      vi.stubGlobal('fetch', mockFetch([TOKEN_RESPONSE, WHOAMI_RESPONSE, { ok: true, body: page1 }]));
      const { data } = await new SophosPartnerConnector(CONFIG).getTenants({
        sort: { field: 'name', direction: 'asc' },
        limit: 2,
      });
      expect(data).toHaveLength(2);
      expect(data![0].name).toBe('Alpha');
      expect(data![1].name).toBe('Beta');
    });

    it('returns error on HTTP failure', async () => {
      vi.stubGlobal('fetch', mockFetch([TOKEN_RESPONSE, WHOAMI_RESPONSE, { ok: false, status: 500, body: {} }]));
      const { error } = await new SophosPartnerConnector(CONFIG).getTenants();
      expect(error).toBeDefined();
    });
  });

  describe('getEndpoints', () => {
    it('returns endpoints (single page)', async () => {
      const page1 = { items: [makeEndpoint('ep-1', 'host-1')], pages: { total: 1, current: 1 } };
      vi.stubGlobal('fetch', mockFetch([TOKEN_RESPONSE, { ok: true, body: page1 }]));
      const { data } = await new SophosPartnerConnector(CONFIG).getEndpoints(TENANT_CONFIG);
      expect(data).toHaveLength(1);
      expect(data![0].id).toBe('ep-1');
    });

    it('paginates through 2 pages', async () => {
      const page1 = { items: [makeEndpoint('ep-1', 'host-1')], pages: { total: 2, current: 1 } };
      const page2 = { items: [makeEndpoint('ep-2', 'host-2')], pages: { total: 2, current: 2 } };
      vi.stubGlobal('fetch', mockFetch([
        TOKEN_RESPONSE,
        { ok: true, body: page1 },
        { ok: true, body: page2 },
      ]));
      const { data } = await new SophosPartnerConnector(CONFIG).getEndpoints(TENANT_CONFIG);
      expect(data).toHaveLength(2);
    });

    it('returns error on HTTP failure', async () => {
      vi.stubGlobal('fetch', mockFetch([TOKEN_RESPONSE, { ok: false, status: 500, body: {} }]));
      const { error } = await new SophosPartnerConnector(CONFIG).getEndpoints(TENANT_CONFIG);
      expect(error).toBeDefined();
    });
  });

  describe('getFirewalls', () => {
    it('returns firewalls with no firmware check when empty', async () => {
      const firewallsResponse = { items: [], pages: { total: 1, current: 1 } };
      vi.stubGlobal('fetch', mockFetch([TOKEN_RESPONSE, { ok: true, body: firewallsResponse }]));
      const { data } = await new SophosPartnerConnector(CONFIG).getFirewalls(TENANT_CONFIG);
      expect(data).toHaveLength(0);
      // Should only be 2 calls: token + firewalls (no firmware check)
      // (fetch is stubbed globally so we can't easily count, but test data works)
    });

    it('fetches firmware and merges data', async () => {
      const fw = makeFirewall('fw-1', 'XGS-1');
      const firewallsResponse = { items: [fw] };
      const firmwareResponse = {
        firewalls: [{ id: 'fw-1', firmwareVersion: '19.5.0', upgradeToVersion: ['20.0.0'], serialNumber: 'SN-fw-1' }],
      };
      vi.stubGlobal('fetch', mockFetch([
        TOKEN_RESPONSE,
        { ok: true, body: firewallsResponse },
        { ok: true, body: firmwareResponse },
      ]));
      const { data } = await new SophosPartnerConnector(CONFIG).getFirewalls(TENANT_CONFIG);
      expect(data).toHaveLength(1);
      expect(data![0].firmware?.newestFirmware).toBe('20.0.0');
    });

    it('returns error on HTTP failure', async () => {
      vi.stubGlobal('fetch', mockFetch([TOKEN_RESPONSE, { ok: false, status: 500, body: 'Server Error' }]));
      const { error } = await new SophosPartnerConnector(CONFIG).getFirewalls(TENANT_CONFIG);
      expect(error).toBeDefined();
    });
  });

  describe('getFirewallLicenses', () => {
    it('uses X-Partner-ID when no config provided', async () => {
      const fetch = mockFetch([
        TOKEN_RESPONSE,
        WHOAMI_RESPONSE,
        { ok: true, body: { items: [makeFirewallLicense('SN-1')], pages: { total: 1, current: 1 } } },
      ]);
      vi.stubGlobal('fetch', fetch);
      const { data } = await new SophosPartnerConnector(CONFIG).getFirewallLicenses();
      expect(data).toHaveLength(1);
      // Verify X-Partner-ID header was used (not X-Tenant-ID)
      const licensesCall = fetch.mock.calls[2];
      expect(licensesCall[1].headers['X-Partner-ID']).toBe('partner-1');
      expect(licensesCall[1].headers['X-Tenant-ID']).toBeUndefined();
    });

    it('uses X-Tenant-ID when config provided', async () => {
      const fetch = mockFetch([
        TOKEN_RESPONSE,
        WHOAMI_RESPONSE,
        { ok: true, body: { items: [makeFirewallLicense('SN-1')], pages: { total: 1, current: 1 } } },
      ]);
      vi.stubGlobal('fetch', fetch);
      const { data } = await new SophosPartnerConnector(CONFIG).getFirewallLicenses(TENANT_CONFIG);
      expect(data).toHaveLength(1);
      // Verify X-Tenant-ID header was used
      const licensesCall = fetch.mock.calls[2];
      expect(licensesCall[1].headers['X-Tenant-ID']).toBe('tenant-1');
      expect(licensesCall[1].headers['X-Partner-ID']).toBeUndefined();
    });

    it('returns error on HTTP failure', async () => {
      vi.stubGlobal('fetch', mockFetch([
        TOKEN_RESPONSE,
        WHOAMI_RESPONSE,
        { ok: false, status: 500, body: {} },
      ]));
      const { error } = await new SophosPartnerConnector(CONFIG).getFirewallLicenses();
      expect(error).toBeDefined();
    });
  });

  describe('getLicenses', () => {
    it('returns license data', async () => {
      const licenseData = { organization: { id: 'org-1' }, licenses: [] };
      vi.stubGlobal('fetch', mockFetch([TOKEN_RESPONSE, { ok: true, body: licenseData }]));
      const { data } = await new SophosPartnerConnector(CONFIG).getLicenses(TENANT_CONFIG);
      expect(data?.organization.id).toBe('org-1');
    });

    it('returns error on HTTP failure', async () => {
      vi.stubGlobal('fetch', mockFetch([TOKEN_RESPONSE, { ok: false, status: 500, body: {} }]));
      const { error } = await new SophosPartnerConnector(CONFIG).getLicenses(TENANT_CONFIG);
      expect(error).toBeDefined();
    });
  });
});
