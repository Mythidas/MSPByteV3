export enum IngestType {
  // M365
  M365Identities = "m365-identities",
  M365Groups = "m365-groups",
  M365Licenses = "m365-licenses",
  M365Policies = "m365-policies",
  M365ExchangeConfig = "m365-exchange-config",

  // Datto RMM
  DattoEndpoints = "datto-endpoints",

  // Sophos
  SophosEndpoints = "sophos-endpoints",
  SophosFirewalls = "sophos-firewalls",

  // HaloPSA

  // Cove Backups
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
