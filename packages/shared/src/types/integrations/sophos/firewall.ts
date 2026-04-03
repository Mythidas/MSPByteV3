export type SophosPartnerFirewall = {
  id: string;
  cluster: {
    id: string;
    mode: "activeActive" | "activePassive";
    status: "primary" | "secondary";
    peers: {
      id: string;
      serialNumber: string;
    };
  };
  tenant: {
    id: string;
  };
  serialNumber: string;
  group: {
    id: string;
    name: string;
  };
  hostname: string;
  name: string;
  externalIpv4Addresses?: string[];
  firmwareVersion: string | null;
  model: string | null;
  status: {
    managing: "approved" | "approvalPending" | "rejected";
    reporting: "approved" | "approvalPending" | "rejected";
    connected: boolean;
    suspended: boolean;
  };
  stateChangedAt: string; // ISO 8601 date string
  capabilities: string[];
  geoLocation: {
    latitude: string;
    longitude: string;
  };
  createdBy: {
    id: string;
    type: "user" | "system";
    name: string;
    accountType: "tenant" | "partner";
    accountId: string;
  };
  createdAt: string; // ISO 8601 date string
  updatedAt: string; // ISO 8601 date string
  updatedBy: {
    id: string;
    type: "user" | "system";
    name: string;
    accountType: "tenant" | "partner";
    accountId: string;
  };
  firmware?: SophosPartnerFirewallFirmware;
};

export type SophosPartnerFirewallFirmware = {
  id: string;
  serialNumber?: string;
  firmwareVersion?: string;
  upgradeToVersion: string[];
  newestFirmware: string;
};

export type SophosPartnerFirewallLicense = {
  serialNumber: string;
  owner: {
    id: string;
    type: "partner" | "tenant"; // flexible if more possible
  };
  partner: {
    id: string;
  };
  tenant: Record<string, unknown>; // currently empty, refine if you know the shape
  billingTenant: {
    id: string;
  };
  model: string;
  modelType: "hardware" | "virtual";
  lastSeenAt: string;
  endDate: string;
  licenses: {
    id: string;
    licenseIdentifier: string;
    product: {
      code: string;
      name: string;
      genericCode: string;
    };
    startDate: string; // ISO date
    endDate: string; // ISO date
    perpetual: boolean;
    type: "usage" | "perpetual";
    quantity: number;
    usage: {
      current: {
        count: number;
      };
    };
  }[];
};
