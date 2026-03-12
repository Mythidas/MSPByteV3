// ============================================================================
// JOB DATA (BullMQ queue payload — maps to ingest_jobs table)
// ============================================================================

export type IngestJobData = {
  tenantId: string;
  integrationId: string;
  ingestType: string;
  ingestId: string; // ingest_jobs.ingest_id (batch run UUID)
  jobId: string; // ingest_jobs.id
  linkId: string | null;
  siteId: string | null;
};

export type LinkJobData = {
  tenantId: string;
  integrationId: string;
  linkId: string;
  linkOpType: string; // which op to run (key from linkOpDeps)
};

export type EnrichJobData = {
  tenantId: string;
  integrationId: string;
  linkId: string;
  enrichOpType: string;
};
