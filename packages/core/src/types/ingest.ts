export enum IngestType {
  // M365
  M365Identities = "m365-identities",
  M365Groups = "m365-groups",
  M365Roles = "m365-roles",
  M365Licenses = "m365-licenses",
  M365Policies = "m365-policies",
  M365ExchangeConfig = "m365-exchange-config",

  // Datto RMM
  DattoSites = "datto-sites",
  DattoEndpoints = "datto-endpoints",

  // Sophos
  SophosSites = "sophos-sites",
  SophosEndpoints = "sophos-endpoints",

  // HaloPSA
  HaloSites = "halo-sites",

  // Cove Backups
  CoveSites = "cove-sites",
  CoveEndpoints = "cove-endpoints",
}

export enum IngestTrigger {
  Scheduled = "scheduled",
  Manual = "manual",
  EventDriven = "event_driven",
  Retry = "retry",
}

export enum IngestStatus {
  Pending = "pending",
  Running = "running",
  Completed = "completed",
  Failed = "failed",
  Skipped = "skipped", // planner decided data was still fresh
}

// Freshness window in seconds — defined per IngestType by each adapter
export type FreshnessWindows = Partial<Record<IngestType, number>>;
