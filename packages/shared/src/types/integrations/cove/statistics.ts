import type { CoveDataResponse } from "$lib/types/integrations/cove";

export type CoveAccountStatistics = {
  AccountId: number;
  Flags: string[];
  PartnerId: number;
  Settings: Record<string, string>[];
};

export type CoveEnumerateAccountStatisticsResponse = CoveDataResponse<
  CoveAccountStatistics[]
>;
