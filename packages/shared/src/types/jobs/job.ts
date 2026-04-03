import type { TenantId, SiteId, LinkId } from "./tenant";
import type { IngestType, IngestTrigger } from "./ingest";

export type JobScopeLevel = "tenant" | "link";
export type JobContext = {
  // Scope
  tenantId: TenantId;
  siteId?: SiteId;
  linkId?: LinkId;
  scopeLevel: JobScopeLevel;

  // Job identity
  jobId: string; // ingest_jobs.id
  ingestType: IngestType;
  integrationId: string; // 'datto_rmm' | 'm365' | 'sophos' etc.
  trigger: IngestTrigger;

  // Credentials — decrypted by worker before adapter call, never stored
  credentials: Record<string, string>;

  // State from last successful run — used for delta fetching
  lastSyncedAt?: Date;
  metadata?: Record<string, unknown>; // cursor, deltaToken, pageState etc.
};

export type JobResult = {
  success: boolean;
  recordCount: number;
  error?: string;
  metadata?: Record<string, unknown>; // updated cursor/token to persist
  metrics?: Record<string, number>; // duration, apiCalls, retries etc.
};
