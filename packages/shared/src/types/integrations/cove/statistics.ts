import type { CoveDataResponse } from "./index.js";

export type CoveAccountStatistics = {
  AccountId: number;
  Flags: string[];
  PartnerId: number;
  Settings: Record<string, string>[];
};

export type CoveEnumerateAccountStatisticsResponse = CoveDataResponse<
  CoveAccountStatistics[]
>;
