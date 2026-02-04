export type DattoRMMSite = {
  id: string;
  uid: string; // Unique site identifier
  name: string;
  description?: string;
  notes?: string;
  onDemand?: boolean;

  splashtopAutoInstall?: boolean;
  portalUrl?: string;

  autotaskCompanyId?: string;
  autotaskCompanyName?: string;
  connectwiseCompanyId?: string;
  connectwiseCompanyName?: string;

  tigerpawAccountId?: string;
  tigerpawAccountName?: string;
  siteVariables?: Record<string, string>; // Site-level variables
  deviceStatus: {
    numberOfDevices: number;
    numberOfOnlineDevices: number;
    numberOfOfflineDevices: number;
  };
};
