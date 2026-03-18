import type { IngestType } from "@workspace/core/types/ingest";

// ============================================================================
// JOB DATA (BullMQ queue payload — maps to ingest_jobs table)
// ============================================================================

export type IngestJobData = {
  tenantId: string;
  integrationId: string;
  ingestType: IngestType;
  ingestId: string; // ingest_jobs.ingest_id (batch run UUID)
  jobId: string; // ingest_jobs.id
  linkId: string | null;
  siteId: string | null;
};

export type LinkJobData = {
  tenantId: string;
  integrationId: string;
  linkId: string;
  linkerType: string; // which LinkerContract to run
};

export type EnrichJobData = {
  tenantId: string;
  integrationId: string;
  linkId: string | null;
  enrichmentType: string; // which EnrichmentContract to run
};

export type OrchestrationJobData = {
  tenantId: string;
  linkId: string | null;
  integrationId: string;
  ingestType: string;
};
