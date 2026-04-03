import type {
  Microsoft365Config,
  MSGraphError,
} from "@workspace/shared/types/integrations/microsoft/index";
import z from "zod";

const TokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });

export class Microsoft365HTTPClient {
  private tokenCache = new Map<string, { token: string; expiration: Date }>();

  constructor(readonly config: Microsoft365Config) {}

  async getToken(tenantId: string): Promise<string> {
    const cached = this.tokenCache.get(tenantId);
    if (cached && cached.expiration > new Date()) return cached.token;

    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(
        `Microsoft365HTTPClient.getToken: HTTP ${response.status} ${response.statusText} for tenant ${tenantId}`,
      );
    }

    const json = TokenSchema.parse(await response.json());
    const token = json.access_token;
    const expiration = new Date(Date.now() + (json.expires_in - 300) * 1000);
    this.tokenCache.set(tenantId, { token, expiration });
    return token;
  }

  clearCache(): void {
    this.tokenCache.clear();
  }

  async get<T>(
    url: string,
    tenantId: string,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const token = await this.getToken(tenantId);
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
    });

    if (!response.ok) await this.throwGraphError(response);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return response.json() as Promise<T>;
  }

  async post<T>(url: string, tenantId: string, body: unknown): Promise<T> {
    const token = await this.getToken(tenantId);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) await this.throwGraphError(response);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return response.json() as Promise<T>;
  }

  async getAllPaged<T>(
    url: string,
    tenantId: string,
    forgetStatuses?: number[],
  ): Promise<T[]> {
    const token = await this.getToken(tenantId);
    const items: T[] = [];
    let nextUrl: string | undefined = url;

    while (nextUrl) {
      const response = await fetch(nextUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        if (forgetStatuses?.includes(response.status)) return items;
        await this.throwGraphError(response);
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const json = (await response.json()) as { value: T[]; "@odata.nextLink"?: string };
      items.push(...json.value);
      nextUrl = json["@odata.nextLink"];
    }

    return items;
  }

  private async throwGraphError(response: Response): Promise<never> {
    let detail = response.statusText;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const body = (await response.json()) as MSGraphError;
      if (body?.error?.message) detail = body.error.message;
    } catch {
      // body was not JSON — fall back to statusText
    }
    throw new Error(`Graph API error: ${response.status} ${detail}`);
  }
}
