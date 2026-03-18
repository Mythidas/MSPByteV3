import type { TenantId, SiteId, LinkId } from "./tenant";
import type { IngestType } from "./ingest";

// ─── Ingestor events ─────────────────────────────────────────────────────────
// Emitted by backend/ingestor after a job completes successfully.
// Consumed by: backend/compliance (trigger eval), backend/workflows (trigger runs)

export type DataReadyEvent = {
  event: "data_ready";
  tenantId: TenantId;
  siteId?: SiteId;
  linkId?: LinkId;
  ingestType: IngestType;
  completedAt: string;
};

// ─── Compliance events ────────────────────────────────────────────────────────
// Emitted by backend/compliance after evaluation detects a change in posture.
// Consumed by: backend/workflows (trigger remediation runs)

export type DriftDetectedEvent = {
  event: "drift_detected";
  tenantId: TenantId;
  siteId?: SiteId;
  linkId?: LinkId;
  standardId: string; // the compliance standard that was evaluated
  integrationId: string;
  field: string; // dotted path e.g. 'exchange_config.reject_direct_send'
  expected: unknown;
  actual: unknown;
  detectedAt: string;
  resolved: boolean; // true = was drifted, now back in compliance
};

// ─── Per-service event unions ─────────────────────────────────────────────────
// Each service imports only the union it cares about.

export type IngestorEvent = DataReadyEvent;
export type ComplianceEvent = DriftDetectedEvent;

// Workflows consumes both
export type WorkflowTriggerEvent = DataReadyEvent | DriftDetectedEvent;
export type WorkflowTriggerEventName = WorkflowTriggerEvent["event"];
