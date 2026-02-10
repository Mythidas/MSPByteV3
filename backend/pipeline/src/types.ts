import type { IntegrationId, EntityType } from './config.js';

// ============================================================================
// ENTITY & RELATIONSHIP TYPES
// ============================================================================

export type EntityState = 'low' | 'normal' | 'warn' | 'critical';
export type MFACoverage = 'none' | 'partial' | 'full';

export interface Entity {
  id: number;
  tenant_id: number;
  integration_id: string;
  site_id: number | null;
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
  id: number;
  tenant_id: number;
  integration_id: string;
  parent_entity_id: number;
  child_entity_id: number;
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
  tenantId: number;
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
    backup_devices: Entity[];
    backup_customers: Entity[];
    tickets: Entity[];
    contracts: Entity[];
    contract_services: Entity[];
    device_sites: Entity[];
  };

  relationships: Relationship[];

  getEntity(id: number): Entity | undefined;
  getRelationships(entityId: number, type?: string): Relationship[];
  getChildEntities(parentId: number): Entity[];
  getParentEntity(childId: number): Entity | undefined;
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
  | 'backup-failed';

export interface Alert {
  entityId: number;
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
  entityTags: Map<number, { tag: string; category?: string; source: string }[]>;
  entityStates: Map<number, EntityState>;
}

// ============================================================================
// ADAPTER TYPES
// ============================================================================

export interface RawEntity {
  externalId: string;
  displayName?: string;
  siteId?: number;
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
// PIPELINE JOB TYPES (BullMQ queue data)
// ============================================================================

export interface SyncJobData {
  tenantId: number;
  integrationId: IntegrationId;
  integrationDbId: string;
  entityType: EntityType;
  cursor?: string;
  batchNumber?: number;
  syncId: string;
  syncJobId: number;
  startedAt?: number;
  metrics?: any;
}

export interface ProcessJobData {
  tenantId: number;
  integrationId: IntegrationId;
  integrationDbId: string;
  entityType: EntityType;
  entities: RawEntity[];
  syncId: string;
  syncJobId: number;
  siteId?: number;
  startedAt?: number;
  metrics?: any;
}

export interface LinkJobData {
  tenantId: number;
  integrationId: IntegrationId;
  integrationDbId: string;
  syncId: string;
  syncJobId: number;
  siteId?: number;
  entityType?: EntityType;
  startedAt?: number;
  metrics?: any;
}

export interface AnalyzeJobData {
  tenantId: number;
  integrationId: IntegrationId;
  integrationDbId: string;
  syncId: string;
  syncJobId: number;
  siteId?: number;
  entityType?: EntityType;
  startedAt?: number;
  metrics?: any;
}

// ============================================================================
// LINKER TYPES
// ============================================================================

export interface RelationshipToCreate {
  parentEntityId: number;
  childEntityId: number;
  relationshipType: string;
  metadata?: Record<string, any>;
}
