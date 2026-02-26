import type { Entity, EntityState, Alert } from '../types.js';

// ============================================================================
// JOB CONTEXT — passed to each job's execute()
// ============================================================================

export interface JobContext {
  tenantId: string;
  integrationId: string;
  connectionId: string | null;
  siteId: string | null;
  entities: {
    identities: Entity[];
    policies: Entity[];
    licenses: Entity[];
    groups: Entity[];
    roles: Entity[];
    companies: Entity[];
    endpoints: Entity[];
    firewalls: Entity[];
    tickets: Entity[];
    contracts: Entity[];
    contract_services: Entity[];
    exchange_configs: Entity[];
  };
  relationships: import('../types.js').Relationship[];
  getChildEntities(parentId: string): Entity[];
}

// ============================================================================
// JOB RESULT — returned from execute()
// ============================================================================

export interface JobResult {
  alerts: Alert[];
  entityTags: Map<string, { tag: string; category?: string; source: string }[]>;
  entityStates: Map<string, EntityState>;
}

// ============================================================================
// QUERY JOB BULLMQ PAYLOAD
// ============================================================================

export interface QueryJobData {
  queryJobId: string;
  tenantId: string;
  connectionId: string | null;
  siteId: string | null;
}
