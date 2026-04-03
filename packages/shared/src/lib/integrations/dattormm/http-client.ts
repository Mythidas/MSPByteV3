import { fetchWithRetry } from "@workspace/shared/lib/utils/fetch-with-retry";
import type { DattoRMMConfig } from "@workspace/shared/types/integrations/datto/index";
import z from "zod";

const TokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
});

const MODULE = "DattoRMMHTTPClient";

type TokenEntry = { token: string; expiresAt: number };
const tokenCache = new Map<string, Promise<TokenEntry>>();

function tokenCacheKey(tenantId: string, config: DattoRMMConfig): string {
  return `${tenantId}::${config.apiKey}::dattormm`;
}

export class DattoRMMHTTPClient {
  constructor(
    readonly config: DattoRMMConfig,
    private readonly tenantId: string,
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

  private async fetchToken(): Promise<TokenEntry> {
    const response = await fetch(`${this.config.url}/auth/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + btoa("public-client:public"),
      },
      body: new URLSearchParams({
        grant_type: "password",
        username: this.config.apiKey,
        password: this.config.apiSecretKey,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `DattoRMMHTTPClient.getToken: HTTP ${response.status} ${response.statusText}`,
      );
    }

    const data = TokenResponseSchema.parse(await response.json());
    const expiresIn = data.expires_in ?? 55 * 60;
    return {
      token: data.access_token,
      expiresAt: Date.now() + (expiresIn - 30) * 1000,
    };
  }

  async get<T>(url: string): Promise<T> {
    const token = await this.getToken();
    const response = await fetchWithRetry(
      url,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
      MODULE,
      "get",
    );
    if (!response.ok) {
      throw new Error(
        `DattoRMMHTTPClient.get: HTTP ${response.status} ${response.statusText} — ${url}`,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return response.json() as Promise<T>;
  }

  async getOrNull<T>(url: string): Promise<T | null> {
    const token = await this.getToken();
    const response = await fetchWithRetry(
      url,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
      MODULE,
      "get",
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(
        `DattoRMMHTTPClient.get: HTTP ${response.status} ${response.statusText} — ${url}`,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return response.json() as Promise<T>;
  }

  async post<T>(url: string, body: unknown): Promise<T> {
    const token = await this.getToken();
    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      MODULE,
      "post",
    );
    if (!response.ok) {
      throw new Error(
        `DattoRMMHTTPClient.post: HTTP ${response.status} ${response.statusText} — ${url}`,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return response.json() as Promise<T>;
  }

  async put<T>(url: string, body: unknown): Promise<T> {
    const token = await this.getToken();
    const response = await fetchWithRetry(
      url,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      MODULE,
      "put",
    );
    if (!response.ok) {
      throw new Error(
        `DattoRMMHTTPClient.put: HTTP ${response.status} ${response.statusText} — ${url}`,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return response.json() as Promise<T>;
  }
}
