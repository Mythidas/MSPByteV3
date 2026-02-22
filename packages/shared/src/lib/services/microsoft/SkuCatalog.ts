import { Logger } from '../../utils/logger.js';

/**
 * Resolves Microsoft SKU part numbers to human-friendly product names.
 * Fetches Microsoft's public CSV once per process lifetime and caches the result.
 */
export class SkuCatalog {
  private static cache: Map<string, string> | null = null;

  /**
   * Returns a map of skuPartNumber → friendly product name for the given SKU IDs.
   * Falls back gracefully if the CSV fetch fails.
   */
  static async resolve(): Promise<Map<string, string>> {
    if (SkuCatalog.cache) return SkuCatalog.cache;

    const map = new Map<string, string>();
    try {
      const res = await fetch(
        'https://download.microsoft.com/download/e/3/e/e3e9faf2-f28b-490a-9ada-c6089a1fc5b0/Product%20names%20and%20service%20plan%20identifiers%20for%20licensing.csv'
      );
      const text = await res.text();
      const lines = text.split('\n');
      // CSV columns: Product_Display_Name, String_Id (skuPartNumber), GUID, ...
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = parseCsvLine(line);
        const skuPartNumber = cols[1]?.trim();
        const friendlyName = cols[0]?.trim().replace(/^"|"$/g, '');
        if (skuPartNumber && friendlyName && !map.has(skuPartNumber)) {
          map.set(skuPartNumber, friendlyName);
        }
      }
    } catch (err) {
      Logger.warn({
        module: 'SkuCatalog',
        context: 'resolve',
        message: `Failed to fetch SKU friendly names CSV: ${err}`,
      });
    }

    SkuCatalog.cache = map;
    return map;
  }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
