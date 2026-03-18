import type { IngestType, FreshnessWindows } from "../ingest";
import type { JobContext, JobResult } from "../job";
import type { SchemaDefinition } from "./schema-registry";

export type UpsertPayload = {
  table: string;
  rows: Record<string, unknown>[];
  onConflict: string; // comma-separated conflict columns e.g. 'tenant_id,endpoint_id'
};

export type ComplianceTarget = {
  label: string;
  description: string;
  // The ingest type that must be fresh before evaluation runs
  dependsOn: IngestType;
  // Path into the integration data table to read actual state
  ingestPath: string;
  // Zod schema or JSON Schema describing the shape of desired state
  // (used by UI to render the standard definition form)
  desiredStateSchema: Record<string, unknown>;
};

export interface AdapterContract {
  readonly integrationId: string;
  readonly supportedTypes: IngestType[];
  readonly freshnessWindows: FreshnessWindows;

  // Schema exposed to compliance + workflow field pickers
  readonly schema: SchemaDefinition;

  // Compliance targets this adapter supports
  readonly complianceTargets: Record<string, ComplianceTarget>;

  // Called by worker — fetch from vendor API, return upsert payloads
  fetch(ctx: JobContext): Promise<UpsertPayload[]>;
}
