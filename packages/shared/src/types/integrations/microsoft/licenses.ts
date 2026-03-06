export type MSGraphSubscribedSku = {
  skuId: string;
  skuPartNumber: string;
  capabilityStatus: string;
  servicePlans: Array<{
    servicePlanId: string;
    servicePlanName: string;
  }>;
  prepaidUnits?: {
    enabled: number;
    suspended: number;
    warning: number;
    lockedOut: number;
  };
  consumedUnits?: number;
};
