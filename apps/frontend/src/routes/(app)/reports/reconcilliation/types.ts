export type ReconciliationReport = {
  generatedAt: string;
  sites: SiteReport[];
  summary: {
    totalSites: number;
    sitesWithIssues: number;
    totalMismatches: number;
  };
};

export type SiteReport = {
  id: string;
  name: string;
  status: 'complete' | 'issues' | 'error';
  mismatches: Mismatch[];
  contract: {
    servers: number;
    desktops: number;
    backups: number;
  };
  sophos: {
    servers: number;
    desktops: number;
  };
  datto: {
    servers: number;
    desktops: number;
  };
  cove: {
    devices: number;
  };
};

export type MismatchType =
  | 'sophos-servers'
  | 'sophos-desktops'
  | 'datto-servers'
  | 'datto-desktops'
  | 'cove-backups';

export type Mismatch = {
  type: MismatchType;
  label: string;
  expected: number;
  actual: number;
  difference: number;
};
