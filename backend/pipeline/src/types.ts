import type { IntegrationId, EntityType } from './config.js';

// ============================================================================
// ENTITY & RELATIONSHIP TYPES
// ============================================================================

export type EntityState = 'low' | 'normal' | 'warn' | 'critical';
export type MFACoverage = 'none' | 'partial' | 'full';

export interface Entity {
  id: string;
  tenant_id: string;
  integration_id: string;
  site_id: string | null;
  entity_type: string;
  external_id: string;
  display_name: string | null;
  raw_data: any;
  data_hash: string;
  state: string;
  last_seen_at: string;
  sync_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Relationship {
  id: string;
  tenant_id: string;
  integration_id: string;
  parent_entity_id: string;
  child_entity_id: string;
  relationship_type: string;
  metadata: any;
  last_seen_at: string;
  sync_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// ANALYSIS CONTEXT
// ============================================================================

export interface AnalysisContext {
  tenantId: string;
  integrationId: IntegrationId;
  syncId: string;

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
  };

  relationships: Relationship[];

  getEntity(id: string): Entity | undefined;
  getRelationships(entityId: string, type?: string): Relationship[];
  getChildEntities(parentId: string): Entity[];
  getParentEntity(childId: string): Entity | undefined;
}

// ============================================================================
// ALERT TYPES
// ============================================================================

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export type AlertType =
  | 'mfa-not-enforced'
  | 'mfa-partial-enforced'
  | 'policy-gap'
  | 'license-waste'
  | 'stale-user'
  | 'tamper-disabled'
  | 'backup-failed'
  | 'device-offline'
  | 'site-empty';

export interface Alert {
  entityId: string;
  alertType: AlertType;
  severity: AlertSeverity;
  message: string;
  fingerprint: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// ANALYZER TYPES
// ============================================================================

export interface AnalyzerResult {
  alerts: Alert[];
  entityTags: Map<string, { tag: string; category?: string; source: string }[]>;
  entityStates: Map<string, EntityState>;
}

// ============================================================================
// ADAPTER TYPES
// ============================================================================

export interface RawEntity {
  externalId: string;
  displayName?: string;
  siteId?: string;
  rawData: any;
}

export interface AdapterFetchResult {
  entities: RawEntity[];
  pagination?: {
    hasMore: boolean;
    cursor?: string;
  };
}

// ============================================================================
// PIPELINE JOB TYPES (BullMQ queue data — single queue design)
// ============================================================================

export interface SyncJobData {
  tenantId: string;
  integrationId: IntegrationId;
  integrationDbId: string;
  entityType: EntityType;
  syncId: string;
  syncJobId: string;

  siteId: string | null;
}

// ============================================================================
// LINKER TYPES
// ============================================================================

export interface RelationshipToCreate {
  parentEntityId: string;
  childEntityId: string;
  relationshipType: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// SYNC CONTEXT — Shared state between pipeline phases to avoid re-SELECTs
// ============================================================================

export interface SyncContext {
  tenantId: string;
  integrationId: string;
  integrationDbId: string;
  entityType: string;
  syncId: string;
  syncJobId?: string;
  siteId?: string;
  processedEntities: Entity[];
  allEntities: Entity[] | null;
  relationships: Relationship[] | null;
}

// ============================================================================
// ANALYSIS JOB TYPES
// ============================================================================

export interface AnalysisJobData {
  tenantId: string;
  integrationId: IntegrationId;
  integrationDbId: string;
  syncId: string;
}
