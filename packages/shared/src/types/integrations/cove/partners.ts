import type { CoveDataResponse } from "./index.js";

// Core partner/customer entity (the items you usually care about)
export interface CoveChildPartner {
  ActualChildCount: number; // Number of direct children (0 = leaf/terminal)
  Children: CoveChildPartner[] | null; // Recursive children (null if not fetched recursively)

  Info: CovePartnerInfo;
}

// Main info object inside each partner
export interface CovePartnerInfo {
  Id: number; // Unique numeric partner ID
  Uid: string; // UUID string
  Name: string; // Display/partner name
  Level: CovePartnerLevel; // e.g. "Reseller", "ServiceOrganization", "EndCustomer"
  ParentId: number; // ID of the immediate parent
  LocationId: number; // Usually seems fixed in your data (18)

  ServiceType: string; // e.g. "AllInclusive"
  ChildServiceTypes: string[] | null; // Allowed service types for children

  State: string; // e.g. "InProduction"
  RegistrationOrigin: string; // e.g. "Domestic", "Undefined"

  TrialExpirationTime: number; // Unix timestamp (seconds); 0 = no trial or expired
  TrialRegistrationTime: number; // Unix timestamp (seconds); 0 = not a trial

  Company: CoveCompanyInfo;

  ExternalPartnerProperties: CoveExternalProperties | null;
  // ExternalCode?: string;               // Appears in some entries (optional)

  // Rarely used / optional fields from your sample
  // AdvancedPartnerProperties?: unknown | null;
  // Flags?: unknown | null;
  // PrivateFlags?: unknown | null;
}

// Company details (very variable — many fields empty or null)
export interface CoveCompanyInfo {
  LegalCompanyName: string; // Often empty even when Name is set
  PhoneNumber?: string;
  FaxNumber?: string;
  WebsiteAddress?: string;
  VatNumber?: string;
  ChamberOfCommerceNumber?: string;
  BankAccountNumber?: string;

  PostAddress: CoveAddress | null; // null or partial object

  // Billing-related (sometimes present at reseller level)
  BillingContactPersonId?: number;
}

// Postal address (frequently incomplete or null)
export interface CoveAddress {
  Address?: string;
  City?: string;
  State?: string;
  District?: string;
  ZipCode?: string;
  Country?: string; // Usually "US" when present
}

// External properties (key-value pairs, usually null or small array)
export interface CoveExternalProperties {
  Properties: [string, string][]; // e.g. [["EulaAccepted", "1"], ["DefaultUserEmail", "..."]]
}

// Enum-like string literal union for common levels
export type CovePartnerLevel =
  | "Reseller"
  | "ServiceOrganization"
  | "EndCustomer";
// Add others if you see them: "Distributor", "Root", etc.

// Full top-level response shape (what you get from jsonrpc)
export type CoveEnumerateChildPartnersResponse = CoveDataResponse<{
  ActualChildCount: number;
  Children: CoveChildPartner[];
  Info: CovePartnerInfo; // Info about the requested/parent partner
}>;
