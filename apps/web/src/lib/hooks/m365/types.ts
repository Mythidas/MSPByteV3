export interface IdentityStats {
  total: number;
  disabled: number;
  noMfa: number;
  noSignIn: number;
  members: number;
  guests: number;
}

export interface LicenseStats {
  totalSKUs: number;
  totalConsumed: number;
  totalAvailable: number;
}

export interface PolicyStats {
  enabled: number;
  disabled: number;
}

export interface DirectoryStats {
  groups: number;
  roles: number;
}

export interface ComplianceStats {
  pass: number;
  fail: number;
  total: number;
  topFailing: { id: string; name: string; severity: string }[];
}

export interface AlertStats {
  active: number;
}

export type TenantStats = {
  link: { id: string; name: string };
  identities: { total: number; noMfa: number; disabled: number };
  licenses: { consumed: number; total: number };
  compliance: { pass: number; total: number };
  alerts: number;
};
