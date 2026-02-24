import { describe, it, expect, vi, beforeEach } from 'vitest';

// Module mocks must be declared before imports
vi.mock('../supabase.js', () => ({
  getSupabase: vi.fn(),
}));
vi.mock('@workspace/shared/lib/connectors/Microsoft365Connector', () => ({
  Microsoft365Connector: vi.fn(),
}));
vi.mock('@workspace/shared/lib/services/microsoft/SkuCatalog', () => ({
  SkuCatalog: { resolve: vi.fn().mockResolvedValue(new Map()) },
}));
vi.mock('@workspace/shared/lib/utils/encryption.js', () => ({
  default: { decrypt: vi.fn().mockResolvedValue('decrypted'), encrypt: vi.fn() },
}));

import { getSupabase } from '../supabase.js';
import { Microsoft365Connector } from '@workspace/shared/lib/connectors/Microsoft365Connector';
import { Microsoft365Adapter } from './Microsoft365Adapter.js';
import type { SyncJobData } from '../types.js';

// Minimal tracker mock — executes callbacks synchronously
function makeTracker() {
  return {
    trackApiCall: vi.fn(),
    trackQuery: vi.fn(),
    trackUpsert: vi.fn(),
    trackSpan: vi.fn().mockImplementation((_name: string, fn: () => unknown) => fn()),
  };
}

// Chainable Supabase query builder mock
function makeSupabaseMock(defaultRows: unknown[] = []) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: defaultRows, error: null }),
  };
  return { from: vi.fn().mockReturnValue(builder), _builder: builder };
}

const BASE_JOB: SyncJobData = {
  tenantId: 'msp-tenant',
  integrationId: 'microsoft-365',
  integrationDbId: 'int-db-id',
  entityType: 'identity',
  syncId: 'sync-1',
  syncJobId: 'job-1',
  siteId: null,
  connectionId: null,
};

describe('Microsoft365Adapter', () => {
  let adapter: Microsoft365Adapter;

  beforeEach(() => {
    adapter = new Microsoft365Adapter();
    vi.clearAllMocks();
  });

  it('direct mode: returns identity entities from getIdentities', async () => {
    const tracker = makeTracker();
    const supabase = makeSupabaseMock([]);
    vi.mocked(getSupabase).mockReturnValue(supabase as any);

    vi.spyOn(adapter as any, 'getIntegrationConfig').mockResolvedValue({
      mode: 'direct',
      tenantId: 't1',
      clientId: 'c1',
      clientSecret: 's1',
    });

    const mockConnector = {
      getIdentities: vi.fn().mockResolvedValue({
        data: {
          identities: [
            {
              id: 'u1',
              displayName: 'Alice',
              userPrincipalName: 'alice@contoso.com',
              accountEnabled: true,
              assignedLicenses: [],
              assignedPlans: [],
            },
          ],
        },
      }),
      getSubscribedSkus: vi.fn().mockResolvedValue({
        data: {
          skus: [
            {
              skuId: 'sk1',
              skuPartNumber: 'sk1p',
              servicePlans: [
                {
                  servicePlanId: 'spid1',
                  servicePlanName: 'SPID',
                },
              ],
            },
          ],
        },
      }),
    };
    // Must use regular function (not arrow) for constructor mocks with `new`
    vi.mocked(Microsoft365Connector).mockImplementation(function () {
      return mockConnector;
    } as any);

    const entities = await adapter.fetchAll(BASE_JOB, tracker as any);
    expect(entities).toHaveLength(1);
    expect(entities[0].externalId).toBe('u1');
    expect(entities[0].displayName).toBe('Alice');
  });

  it('throws for unknown entity type', async () => {
    const tracker = makeTracker();
    const supabase = makeSupabaseMock([]);
    vi.mocked(getSupabase).mockReturnValue(supabase as any);

    vi.spyOn(adapter as any, 'getIntegrationConfig').mockResolvedValue({
      mode: 'direct',
      tenantId: 't1',
      clientId: 'c1',
      clientSecret: 's1',
    });
    vi.mocked(Microsoft365Connector).mockImplementation(function () {
      return {};
    } as any);

    await expect(
      adapter.fetchAll({ ...BASE_JOB, entityType: 'unknown-type' as any }, tracker as any)
    ).rejects.toThrow('unknown entityType');
  });

  it('direct mode: identity entities strip assignedPlans from rawData', async () => {
    const tracker = makeTracker();
    vi.mocked(getSupabase).mockReturnValue(makeSupabaseMock([]) as any);

    vi.spyOn(adapter as any, 'getIntegrationConfig').mockResolvedValue({
      mode: 'direct',
      tenantId: 't1',
      clientId: 'c1',
      clientSecret: 's1',
    });

    const mockConnector = {
      getIdentities: vi.fn().mockResolvedValue({
        data: {
          identities: [
            {
              id: 'u2',
              displayName: 'Bob',
              userPrincipalName: 'bob@contoso.com',
              accountEnabled: true,
              assignedLicenses: [{ skuId: 'sku-1' }],
              assignedPlans: [{ servicePlanId: 'plan-1' }],
            },
          ],
        },
      }),
      getSubscribedSkus: vi.fn().mockResolvedValue({
        data: {
          skus: [
            {
              skuId: 'sk1',
              skuPartNumber: 'sk1p',
              servicePlans: [
                {
                  servicePlanId: 'spid1',
                  servicePlanName: 'SPID',
                },
              ],
            },
          ],
        },
      }),
    };
    vi.mocked(Microsoft365Connector).mockImplementation(function () {
      return mockConnector;
    } as any);

    const entities = await adapter.fetchAll(BASE_JOB, tracker as any);
    expect(entities[0].rawData).not.toHaveProperty('assignedPlans');
    expect(entities[0].rawData).toHaveProperty('assignedLicenses');
  });
});
