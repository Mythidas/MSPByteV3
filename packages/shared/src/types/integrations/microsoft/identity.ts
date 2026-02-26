export type MSGraphIdentity = {
  id: string;
  userPrincipalName: string;
  userType: string;
  displayName: string;
  accountEnabled: boolean;
  companyName: string;
  jobTitle: string;

  // License & plans
  assignedLicenses?: {
    skuId: string;
    disabledPlans: string[];
  }[];
  assignedPlans?: {
    servicePlanId: string;
    service?: string;
    capabilityStatus?: string;
    assignedDateTime?: string;
  }[];

  // Sign-in
  signInActivity?: {
    lastSignInDateTime?: string;
    lastNonInteractiveSignInDateTime?: string;
    lastSignInRequestId?: string;
    lastNonInteractiveSignInRequestId?: string;
  };

  proxyAddresses?: string[];
};
