import { fetchWithRetry } from "@workspace/shared/lib/utils/fetch-with-retry";
import type { HaloPSAConfig } from "@workspace/shared/types/integrations/halopsa/index";
import z from "zod";

const TokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
});

const MODULE = "HaloPSAHTTPClient";
const DEFAULT_TTL_S = 55 * 60;

type TokenEntry = { token: string; expiresAt: number };
const tokenCache = new Map<string, Promise<TokenEntry>>();

function tokenCacheKey(tenantId: string, config: HaloPSAConfig): string {
  return `${tenantId}::${config.clientId}::halopsa`;
}

export class HaloPSAHTTPClient {
  constructor(
    readonly config: HaloPSAConfig,
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
    const response = await fetch(`${this.config.url}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        scope: "all",
      }),
    });

    if (!response.ok) {
      throw new Error(
        `HaloPSAHTTPClient.getToken: HTTP ${response.status} ${response.statusText}`,
      );
    }

    const data = TokenResponseSchema.parse(await response.json());
    const expiresIn = data.expires_in ?? DEFAULT_TTL_S;
    return {
      token: data.access_token,
      expiresAt: Date.now() + (expiresIn - 30) * 1000,
    };
  }

  authHeaders(): Promise<Record<string, string>> {
    return this.getToken().then((token) => ({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }));
  }

  async get<T>(url: string): Promise<T> {
    const headers = await this.authHeaders();
    const response = await fetchWithRetry(
      url,
      { method: "GET", headers },
      MODULE,
      "get",
    );
    if (!response.ok) {
      throw new Error(
        `HaloPSAHTTPClient.get: HTTP ${response.status} ${response.statusText} — ${url}`,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return response.json() as Promise<T>;
  }

  async post<T>(
    url: string,
    body: unknown,
    contentType = "application/json",
  ): Promise<T> {
    const token = await this.getToken();
    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": contentType,
        },
        body: JSON.stringify(body),
      },
      MODULE,
      "post",
    );
    if (!response.ok) {
      throw new Error(
        `HaloPSAHTTPClient.post: HTTP ${response.status} ${response.statusText} — ${url}`,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return response.json() as Promise<T>;
  }

  async postForm(url: string, body: FormData): Promise<Response> {
    const token = await this.getToken();
    const response = await fetchWithRetry(
      url,
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body },
      MODULE,
      "postForm",
    );
    if (!response.ok) {
      throw new Error(
        `HaloPSAHTTPClient.postForm: HTTP ${response.status} ${response.statusText} — ${url}`,
      );
    }
    return response;
  }
}
