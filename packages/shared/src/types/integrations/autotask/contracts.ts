import { AutoTaskUserDefinedField } from '@workspace/shared/types/integrations/autotask/index';

export type AutoTaskContract = {
  id: number;

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
  id: number;
  contractID: number;
  serviceID: number;
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
  id: number;
  serviceID: number;
  contractID: number;
  contractServiceID: number;
  organizationalLevelAssociationID: number;
  vendorCompanyID: number;
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
  serviceBundleID: number;
  contractServiceBundleID: number;
} & Omit<AutoTaskContractServiceUnit, 'contractServiceID' | 'serviceID'>;

export type AutoTaskQuoteItem = {
  id: number;
  averageCost: number;
  chargeID: number;
  description: string;
  expenseID: number;
  highestCost: number;
  internalCurrencyLineDiscount: number;
  internalCurrencyUnitDiscount: number;
  internalCurrencyUnitPrice: number;
  isOptional: boolean;
  isTaxable: boolean;
  laborID: number;
  lineDiscount: number;
  markupRate: number;
  name: string;
  percentageDiscount: number;
  periodType: number;
  productID: number;
  quantity: number;
  quoteID: number;
  quoteItemType: number;
  serviceBundleID: number;
  serviceID: number;
  shippingID: number;
  sortOrderID: number;
  taxCategoryID: number;
  totalEffectiveTax: number;
  unitCost: number;
  unitDiscount: number;
  unitPrice: number;
  soapParentPropertyId: AutoTaskSoapProperty;
};

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
