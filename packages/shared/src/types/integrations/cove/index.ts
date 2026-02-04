export interface CoveConnectorConfig {
  server: string; // API base URL
  clientId: string;
  clientSecret: string;
  partnerId: number;
}

export interface CoveDataResponse<T> {
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
}
