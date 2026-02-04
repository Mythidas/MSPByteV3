export type DattoRMMDevice = {
  id: string;
  uid: string;

  siteId: number;
  siteUid: string;
  siteName: string;

  deviceType: {
    category: string;
    type: string;
  };

  hostname: string;
  intIpAddress: string;
  extIpAddress: string;

  operatingSystem: string;
  displayVersion: string;
  cagVersion: string;

  lastLoggedInUser: string;
  domain: string;
  description: string;

  a64Bit: boolean;
  rebootRequired: boolean;
  online: boolean;
  suspended: boolean;
  deleted: boolean;

  lastSeen: string; // ISO 8601
  lastReboot: string; // ISO 8601
  lastAuditDate: string; // ISO 8601
  creationDate: string; // ISO 8601

  udf: DattoRMMUdf;

  snmpEnabled: boolean;
  deviceClass: "device" | string;
  portalUrl: string;
  warrantyDate: string;

  antivirus: {
    antivirusProduct: string;
    antivirusStatus: "RunningAndUpToDate" | string;
  };

  patchManagement: {
    patchStatus: "NoPolicy" | string;
    patchesApprovedPending: number;
    patchesNotApproved: number;
    patchesInstalled: number;
  };

  softwareStatus: string;
  webRemoteUrl: string;

  networkProbe: boolean;
  onboardedViaNetworkMonitor: boolean;
};

export type DattoRMMUdf = {
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
  udf6?: string;
  udf7?: string;
  udf8?: string;
  udf9?: string;
  udf10?: string;
  udf11?: string;
  udf12?: string;
  udf13?: string;
  udf14?: string;
  udf15?: string;
  udf16?: string;
  udf17?: string;
  udf18?: string;
  udf19?: string;
  udf20?: string;
  udf21?: string;
  udf22?: string;
  udf23?: string;
  udf24?: string;
  udf25?: string;
  udf26?: string;
  udf27?: string;
  udf28?: string;
  udf29?: string;
  udf30?: string;
};
