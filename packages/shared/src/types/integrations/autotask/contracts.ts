import type { AutoTaskUserDefinedField } from "$lib/types/integrations/autotask";

export type AutoTaskContract = {
  id: string;

  billingPreference: number;

  billToCompanyContactID: number;
  billToCompanyID: number;
  companyID: number;

  contactID: number;
  contactName: string;

  contractCategory: number;
  contractExclusionSetID: number;
  exclusionContractID: number;

  contractName: string;
  contractNumber: string;
  contractPeriodType: number;
  contractType: number;

  description: string;

  startDate: string; // ISO 8601
  endDate: string; // ISO 8601

  status: number;
  isCompliant: boolean;
  isDefaultContract: boolean;

  estimatedCost: number;
  estimatedHours: number;
  estimatedRevenue: number;

  overageBillingRate: number;
  internalCurrencyOverageBillingRate: number;

  setupFee: number;
  internalCurrencySetupFee: number;
  setupFeeBillingCodeID: number;

  purchaseOrderNumber: string;

  opportunityID: number;
  renewedContractID: number;
  serviceLevelAgreementID: number;
  organizationalLevelAssociationID: number;

  timeReportingRequiresStartAndStopTimes: number;

  lastModifiedDateTime: string; // ISO 8601

  userDefinedFields: AutoTaskUserDefinedField[];
};

export type AutoTaskContractService = {
  id: string;
  contractID: string;
  serviceID: string;
  isBundle: boolean; // Custom

  quoteItemID: number;

  internalCurrencyAdjustedPrice: number;
  internalCurrencyUnitPrice: number;

  unitCost: number;
  unitPrice: number;

  internalDescription: string;
  invoiceDescription: string;

  soapParentPropertyId: AutoTaskSoapProperty;
};

export type AutoTaskContractServiceUnit = {
  id: string;
  serviceID: string;
  contractID: string;
  contractServiceID: string;
  organizationalLevelAssociationID: string;
  vendorCompanyID: string;
  soapParentPropertyId: string;

  approveAndPostDate: string; // ISO
  endDate: string; // ISO
  startDate: string; // ISO

  cost: number;
  internalCurrencyPrice: number;
  price: number;
  units: number;
};

export type AutoTaskContractServiceBundleUnit = {
  serviceBundleID: string;
  contractServiceBundleID: string;
} & Omit<AutoTaskContractServiceUnit, "contractServiceID" | "serviceID">;

export type AutoTaskSoapProperty = {
  type: string;
  nodeType: string;
  name?: string;
  returnType?: string;
  tailCall?: boolean;
  canReduce?: boolean;

  parameters?: AutoTaskSoapParameter[];

  body?: {
    nodeType: string;
    type: string;
    canReduce?: boolean;
  };
};

export type AutoTaskSoapParameter = {
  type: string;
  nodeType: string;
  name: string;
  isByRef: boolean;
  canReduce: boolean;
};
