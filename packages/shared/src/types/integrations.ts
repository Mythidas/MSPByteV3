import type { SchemaFields } from "@workspace/shared/types/jobs/contracts/schema-registry";
import { IngestType } from "@workspace/shared/types/jobs/ingest";
import type { JobScopeLevel } from "@workspace/shared/types/jobs/job";
import type { Schemas } from "@workspace/shared/types/database";

export const INTEGRATION_IDS = [
  "sophos-partner",
  "dattormm",
  "cove",
  "microsoft-365",
  "halopsa",
  "mspagent",
] as const;
export type IntegrationId = (typeof INTEGRATION_IDS)[number];

export enum IntegrationRefreshIntervalMinutes {
  "1-Hours" = 60 * 1,
  "2-Hours" = 60 * 2,
  "4-Hours" = 60 * 4,
  "8-Hours" = 60 * 8,
  "12-Hours" = 60 * 12,
  "24-Hours" = 60 * 24,
}

// ─── DB Routing ──────────────────────────────────────────────────────────────
// Only present on ingest types that map to a queryable vendor table.
// Used by the workflow + compliance systems to know where data lives.

export type DbRoute = {
  schema: Schemas; // postgres schema       e.g. "vendors"
  table: string; // table name                   e.g. "m365_identities"
  shape: SchemaFields;
};

// ─── Ingest Type Config ───────────────────────────────────────────────────────

export type IngestTypeConfig = {
  type: IngestType;
  freshnessMinutes: number; // planner skips re-enqueue if data is newer than this
  priority: number; // BullMQ priority — lower number = higher priority
  workerConcurrency?: number; // max parallel workers for this type (default: 5)
  scopeLevel: JobScopeLevel;
  db?: DbRoute; // present if this type has a queryable vendor table
  hasLinker?: boolean; // true = enqueue a linking job after ingest completes
  linkerDependencies?: IngestType[]; // ingest types that must have a sync state before linking runs
};

// ─── Navigation ──────────────────────────────────────────────────────────────
// Drives the frontend sidebar per integration. Kept here so the UI
// never needs a DB lookup to know what routes an integration exposes.

export type IntegrationNavItem = {
  label: string;
  route: string;
  isNullable: boolean; // true = show even when no data exists yet
};

// ─── Integration ─────────────────────────────────────────────────────────────

export type IntegrationCategory =
  | "psa"
  | "rmm"
  | "recovery"
  | "security"
  | "identity"
  | "other";

// Whether jobs are scoped to a site FK or a link FK.
// Drives how the planner builds jobs and how the worker resolves scope.
export type IntegrationScope = "site" | "link";

export type Integration = {
  id: IntegrationId;
  name: string;
  category: IntegrationCategory;
  scope: IntegrationScope;
  supportedTypes: IngestTypeConfig[];
  navigation: IntegrationNavItem[];
};
