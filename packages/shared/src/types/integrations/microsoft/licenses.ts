export type MSGraphSubscribedSku = {
  skuId: string;
  skuPartNumber: string;
  servicePlans: Array<{
    servicePlanId: string;
    servicePlanName: string;
  }>;
  prepaidUnits?: {
    enabled: number;
    suspended: number;
    warning: number;
  };
  consumedUnits?: number;
};
