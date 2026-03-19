import { INTEGRATIONS } from "@workspace/core/config/integrations";
import { SchemaFields } from "@workspace/core/types/contracts/schema-registry";
import { IngestType } from "@workspace/core/types/ingest";
import { JobScopeLevel } from "@workspace/core/types/job";

export type IntegrationId =
  | "sophos-partner"
  | "dattormm"
  | "cove"
  | "microsoft-365"
  | "halopsa"
  | "mspagent";

// ─── DB Routing ──────────────────────────────────────────────────────────────
// Only present on ingest types that map to a queryable vendor table.
// Used by the workflow + compliance systems to know where data lives.

export type DbRoute = {
  schema: string; // postgres schema              e.g. "vendors"
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Convenience lookups used by the planner and worker.

export function getIntegration(id: IntegrationId): Integration {
  return INTEGRATIONS[id];
}

export function getIngestTypeConfig(
  integrationId: IntegrationId,
  type: IngestType,
): IngestTypeConfig | undefined {
  return INTEGRATIONS[integrationId]?.supportedTypes.find(
    (t) => t.type === type,
  );
}

// Returns all (integration, ingestType) pairs that have a DB route —
// used by the compliance schema registry to know what's queryable.
export function getAllDbRoutedTypes(): {
  integrationId: IntegrationId;
  ingestType: IngestType;
  db: DbRoute;
}[] {
  return Object.values(INTEGRATIONS).flatMap((integration) =>
    integration.supportedTypes
      .filter((t) => t.db != null)
      .map((t) => ({
        integrationId: integration.id,
        ingestType: t.type,
        db: t.db!,
      })),
  );
}

export function getTypeMap() {
  const map = new Map<
    IngestType,
    {
      integration: string;
      schema: string;
      table: string;
      ingestType: IngestType;
    }
  >();
  for (const integration of Object.values(INTEGRATIONS)) {
    for (const t of integration.supportedTypes) {
      if (t.type && t.db?.schema && t.db.table) {
        map.set(t.type, {
          integration: integration.id,
          schema: t.db.schema,
          table: t.db.table,
          ingestType: t.type,
        });
      }
    }
  }
  return map;
}
