import { fetchWithRetry } from "@workspace/shared/lib/utils/fetch-with-retry";
import type {
  SophosPartnerConfig,
  SophosPartnerAPIResponse,
} from "@workspace/shared/types/integrations/sophos/index";
import z from "zod";

const MODULE = "SophosHTTPClient";
const TOKEN_URL = "https://id.sophos.com/api/v2/oauth2/token";
const WHOAMI_URL = "https://api.central.sophos.com/whoami/v1";

type TokenEntry = { token: string; expiresAt: number };
const tokenCache = new Map<string, Promise<TokenEntry>>();

function tokenCacheKey(tenantId: string, config: SophosPartnerConfig): string {
  return `${tenantId}::${config.clientId}::sophos-partner`;
}

const partnerIdCache = new Map<string, string>();

export class SophosHTTPClient {
  constructor(
    private config: SophosPartnerConfig,
    private tenantId: string,
  ) {}

  async getToken(): Promise<string> {
    const key = tokenCacheKey(this.tenantId, this.config);
    const cached = tokenCache.get(key);

    if (cached) {
      const entry = await cached;
      if (Date.now() < entry.expiresAt) return entry.token;
      tokenCache.delete(key);
    }

    const pending = this.fetchToken();
    tokenCache.set(key, pending);
    pending.catch(() => tokenCache.delete(key));
    return (await pending).token;
  }

  invalidateToken(): void {
    tokenCache.delete(tokenCacheKey(this.tenantId, this.config));
  }

  private async fetchToken(): Promise<TokenEntry> {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret || "",
      scope: "token",
    });

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(
        `SophosHTTPClient.getToken: HTTP ${response.status} ${response.statusText}`,
      );
    }

    const data = z
      .object({
        expires_in: z.number(),
        access_token: z.string(),
      })
      .parse(await response.json());

    return {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 30) * 1000,
    };
  }

  async getPartnerId(): Promise<string> {
    const key = tokenCacheKey(this.tenantId, this.config);
    const cached = partnerIdCache.get(key);
    if (cached) return cached;

    const token = await this.getToken();
    const data = await this.get<{ id: string }>(WHOAMI_URL, {
      Authorization: `Bearer ${token}`,
    });
    partnerIdCache.set(key, data.id);
    return data.id;
  }

  async partnerHeaders(): Promise<Record<string, string>> {
    const [token, partnerId] = await Promise.all([
      this.getToken(),
      this.getPartnerId(),
    ]);
    return { Authorization: `Bearer ${token}`, "X-Partner-ID": partnerId };
  }

  async tenantHeaders(tenantId: string): Promise<Record<string, string>> {
    const token = await this.getToken();
    return { Authorization: `Bearer ${token}`, "X-Tenant-ID": tenantId };
  }

  async get<T>(url: string, headers: Record<string, string>): Promise<T> {
    const response = await fetchWithRetry(
      url,
      { method: "GET", headers },
      MODULE,
      "get",
    );
    if (!response.ok) {
      throw new Error(
        `SophosHTTPClient.get: HTTP ${response.status} ${response.statusText} — ${url}`,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return response.json() as Promise<T>;
  }

  async post<T>(
    url: string,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<T> {
    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      MODULE,
      "post",
    );
    if (!response.ok) {
      throw new Error(
        `SophosHTTPClient.post: HTTP ${response.status} ${response.statusText} — ${url}`,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return response.json() as Promise<T>;
  }

  async fetchAllPages<T>(
    baseUrl: string,
    headers: Record<string, string>,
  ): Promise<T[]> {
    const items: T[] = [];
    let page = 1;

    while (true) {
      const data = await this.get<SophosPartnerAPIResponse<T>>(
        `${baseUrl}&page=${page}`,
        headers,
      );
      items.push(...data.items);
      if (page >= data.pages.total) break;
      page++;
    }

    return items;
  }
}
