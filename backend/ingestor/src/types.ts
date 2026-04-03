import { IntegrationId } from "@workspace/shared/types/integrations";
import { IngestType } from "@workspace/shared/types/jobs/ingest";

// ============================================================================
// JOB DATA (BullMQ queue payload — maps to ingest_jobs table)
// ============================================================================

export type IngestJobData = {
  tenantId: string;
  integrationId: IntegrationId;
  ingestType: IngestType;
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
  integrationId: IntegrationId;
  ingestType: string;
};
