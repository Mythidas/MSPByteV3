import { fetchWithRetry } from "@workspace/shared/lib/utils/fetch-with-retry";
import type { DattoRMMConfig } from "@workspace/shared/types/integrations/datto/index";
import z from "zod";

const TokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
});

const MODULE = "DattoRMMHTTPClient";

export class DattoRMMHTTPClient {
  private token: string | null = null;
  private tokenExpiry: Date = new Date();

  constructor(readonly config: DattoRMMConfig) {}

  async getToken(): Promise<string> {
    if (this.token && new Date().getTime() < this.tokenExpiry.getTime()) {
      return this.token;
    }

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
    this.token = data.access_token;
    this.tokenExpiry = new Date(
      new Date().getTime() +
        (data.expires_in ? data.expires_in * 1000 : 55 * 60 * 1000),
    );
    return this.token;
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
