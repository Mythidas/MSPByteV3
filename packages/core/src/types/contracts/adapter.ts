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
  desiredStateSchema: Record<string, unknown>;
};

export interface AdapterContract {
  readonly integrationId: string;

  fetch(ctx: JobContext): Promise<UpsertPayload[]>;
}
