import type { MSGraphIdentity } from '@workspace/shared/types/integrations/microsoft/identity.js';
import type { MSGraphGroup } from '@workspace/shared/types/integrations/microsoft/groups.js';
import type { MSGraphRole } from '@workspace/shared/types/integrations/microsoft/roles.js';
import type { MSGraphConditionalAccessPolicy } from '@workspace/shared/types/integrations/microsoft/policies.js';
import type { MSGraphSubscribedSku } from '@workspace/shared/types/integrations/microsoft/licenses.js';

// ============================================================================
// M365 ENTITY TYPES
// ============================================================================

export type M365EntityType =
  | 'identity'
  | 'group'
  | 'role'
  | 'policy'
  | 'license'
  | 'exchange-config';

export const M365_TYPES: M365EntityType[] = [
  'identity',
  'group',
  'role',
  'policy',
  'license',
  'exchange-config',
];

// ============================================================================
// TYPED RAW ENTITIES (adapter output)
// ============================================================================

export type RawM365Identity = {
  externalId: string;
  linkId: string | null;
  siteId: string | null;
  data: MSGraphIdentity;
};

export type RawM365Group = {
  externalId: string;
  linkId: string | null;
  siteId: string | null;
  data: MSGraphGroup;
};

export type RawM365Role = {
  externalId: string;
  linkId: string | null;
  data: MSGraphRole;
};

export type RawM365Policy = {
  externalId: string;
  linkId: string | null;
  siteId: string | null;
  data: MSGraphConditionalAccessPolicy;
};

export type RawM365License = {
  externalId: string;
  linkId: string | null;
  data: MSGraphSubscribedSku;
};

export type RawM365ExchangeConfig = {
  externalId: string;
  linkId: string | null;
  siteId: string | null;
  rejectDirectSend: boolean;
};

// Discriminated union for adapter output
export type RawM365Entity =
  | ({ type: 'identity' } & RawM365Identity)
  | ({ type: 'group' } & RawM365Group)
  | ({ type: 'role' } & RawM365Role)
  | ({ type: 'policy' } & RawM365Policy)
  | ({ type: 'license' } & RawM365License)
  | ({ type: 'exchange-config' } & RawM365ExchangeConfig);

// ============================================================================
// PROCESSED ROW (for linker + prune)
// ============================================================================

export type M365ProcessedRow = {
  id: string;
  external_id: string;
  link_id: string | null;
};

// ============================================================================
// JOB DATA (BullMQ queue payload — maps to ingest_jobs table)
// ============================================================================

export type IngestJobData = {
  tenantId: string;
  integrationId: 'microsoft-365';
  ingestType: M365EntityType;
  ingestId: string; // ingest_jobs.ingest_id (batch run UUID)
  jobId: string; // ingest_jobs.id
  linkId: string | null;
  siteId: string | null;
};

// ============================================================================
// INGEST CONTEXT (shared between processor and linker)
// ============================================================================

export type IngestContext = {
  tenantId: string;
  ingestType: M365EntityType;
  ingestId: string;
  jobId: string;
  linkId: string | null;
  siteId: string | null;
  processedRows: M365ProcessedRow[];
};
