import z from "zod";

export const CoveConnectorConfigSchema = z.object({
  server: z.string(),
  clientId: z.string(),
  clientSecret: z.string(),
  partnerId: z.number(),
});

export type CoveConnectorConfig = z.infer<typeof CoveConnectorConfigSchema>;

export type CoveDataResponse<T> = {
  jsonrpc: "2.0";
  id: string;
  visa?: string; // Present in your example
  result?: {
    result: T;
  };
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};
