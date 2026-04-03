export type SophosPartnerEndpoint = {
  id: string;
  os: {
    name: string;
    build: number;
    isServer: boolean;
    platform: string;
    majorVersion: number;
    minorVersion: number;
  };
  type: string;
  health: {
    overall: "good" | "bad";
    threats: {
      status: "good" | "bad";
    };
    services: {
      status: "good" | "bad";
      serviceDetails: {
        name: string;
        status: "running" | "stopped";
      }[];
    };
  };
  online: boolean;
  tenant: {
    id: string;
  };
  modules: {
    name: string;
    version: string;
  }[];
  hostname: string;
  lockdown: {
    status: "enabled" | "disabled" | "unavailable";
  };
  packages?: {
    ztna?: {
      status: "assigned" | "unassigned";
    };
    encryption?: {
      status: "assigned" | "unassigned";
      available?: {
        id: string;
        name: string;
      }[];
    };
    protection?: {
      name: string;
      status: "assigned" | "unassigned" | "upgradable";
      available?: {
        id: string;
        name: string;
      }[];
      assignedId?: string;
    };
  };
  isolation: {
    status: "isolated" | "notIsolated";
  };
  lastSeenAt: string; // ISO timestamp
  mdrManaged: boolean;
  macAddresses?: string[];
  ipv4Addresses?: string[];
  assignedProducts: {
    code: string;
    status: "installed" | "notInstalled";
    version: string;
  }[];
  associatedPerson: {
    id: string;
    name: string;
    viaLogin: string;
  };
  tamperProtectionEnabled: boolean;
  tamperProtectionSupported: boolean;
};
