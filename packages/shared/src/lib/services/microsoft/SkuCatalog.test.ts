import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SkuCatalog } from './SkuCatalog.js';

const SAMPLE_CSV = `Product_Display_Name,String_Id,GUID
"Microsoft 365 Business Basic",O365_BUSINESS_ESSENTIALS,3b555118-da6a-4418-894f-7df1e2096870
"Microsoft 365 Apps for Business",O365_BUSINESS,cdd28e44-67e3-425a-be4c-37b8079d7365
`;

beforeEach(() => {
  // Reset process-lifetime cache between tests
  (SkuCatalog as any)['cache'] = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SkuCatalog', () => {
  it('parses CSV and returns skuPartNumber → friendly name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: async () => SAMPLE_CSV }));
    const map = await SkuCatalog.resolve();
    expect(map.get('O365_BUSINESS_ESSENTIALS')).toBe('Microsoft 365 Business Basic');
    expect(map.get('O365_BUSINESS')).toBe('Microsoft 365 Apps for Business');
  });

  it('caches: fetch is only called once across multiple resolve() calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ text: async () => SAMPLE_CSV });
    vi.stubGlobal('fetch', fetchMock);
    await SkuCatalog.resolve();
    await SkuCatalog.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns empty map and does not throw when CSV fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const map = await SkuCatalog.resolve();
    expect(map.size).toBe(0);
  });

  it('deduplicates: keeps first occurrence when skuPartNumber appears multiple times', async () => {
    const duplicateCsv = `Product_Display_Name,String_Id,GUID
"First Name",DUPLICATE_SKU,guid-1
"Second Name",DUPLICATE_SKU,guid-2
`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: async () => duplicateCsv }));
    const map = await SkuCatalog.resolve();
    expect(map.get('DUPLICATE_SKU')).toBe('First Name');
  });
});
