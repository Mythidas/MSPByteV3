import type { CoveConnectorConfig } from "@workspace/shared/types/integrations/cove/index";
import z from "zod";

const VisaResponseSchema = z.object({
  error: z.unknown().optional(),
  result: z.unknown().optional(),
  visa: z.string().optional(),
});

export class CoveHTTPClient {
  private token: string | null = null;

  constructor(readonly config: CoveConnectorConfig) {}

  async getVisa(): Promise<string> {
    if (this.token) return this.token;

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

    this.token = data.visa;
    return this.token;
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
    return response.json() as Promise<T>;
  }
}
