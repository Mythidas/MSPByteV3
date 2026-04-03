import type { CoveConnectorConfig, CoveDataResponse } from "@workspace/shared/types/integrations/cove/index";
import z from "zod";

const VisaResponseSchema = z.object({
  error: z.unknown().optional(),
  result: z.unknown().optional(),
  visa: z.string().optional(),
});

// Process-level visa cache keyed by server + clientId + partnerId.
// Stores the in-flight Promise so concurrent jobs with the same credentials
// await a single Login call instead of each triggering their own, which hits
// Cove's auth rate limit when many site jobs start simultaneously.
const visaCache = new Map<string, Promise<string>>();

function visaCacheKey(tenantId: string, config: CoveConnectorConfig): string {
  return `${tenantId}::${config.clientId}::cove`;
}

function isAuthError(error: { code: number; data?: unknown }): boolean {
  if (error.code === -32001) return true; // expired/invalid visa
  if (error.code === -32603 && error.data === 14409) return true; // rate-limited login
  return false;
}

export class CoveHTTPClient {
  constructor(
    readonly config: CoveConnectorConfig,
    private readonly tenantId: string,
  ) {}

  async getVisa(): Promise<string> {
    const key = visaCacheKey(this.tenantId, this.config);
    const cached = visaCache.get(key);
    if (cached) return cached;

    const pending = this.fetchVisa();
    visaCache.set(key, pending);
    pending.catch(() => visaCache.delete(key));
    return pending;
  }

  invalidateVisa(): void {
    visaCache.delete(visaCacheKey(this.tenantId, this.config));
  }

  private async fetchVisa(): Promise<string> {
    const response = await fetch(this.config.server, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "login",
        method: "Login",
        params: {
          username: this.config.clientId,
          password: this.config.clientSecret,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `CoveHTTPClient.getVisa: HTTP ${response.status} ${response.statusText}`,
      );
    }

    const data = VisaResponseSchema.parse(await response.json());

    if (data.error) {
      throw new Error(
        `CoveHTTPClient.getVisa: JSON-RPC error: ${JSON.stringify(data.error)}`,
      );
    }
    if (!data.result || !data.visa) {
      throw new Error("CoveHTTPClient.getVisa: no visa in response");
    }

    return data.visa;
  }

  async rpc<T>(method: string, params: unknown): Promise<T> {
    const visa = await this.getVisa();

    const response = await fetch(this.config.server, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "jsonrpc",
        visa,
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `CoveHTTPClient.rpc(${method}): HTTP ${response.status} ${response.statusText}`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const data = await response.json() as CoveDataResponse<T>;

    if (data.error && isAuthError(data.error)) {
      this.invalidateVisa();
      throw new Error(
        `CoveHTTPClient.rpc(${method}): auth error, visa evicted: ${JSON.stringify(data.error)}`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return data as T;
  }
}
