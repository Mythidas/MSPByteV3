import { getORM } from './supabase.js';
import { PipelineTracker } from './lib/tracker.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import type { Entity, Relationship, SyncContext } from './types.js';

export function createSyncContext(params: {
  tenantId: string;
  integrationId: string;
  integrationDbId: string;
  entityType: string;
  syncId: string;
  syncJobId?: string;
  siteId?: string;
  connectionId?: string;
}): SyncContext {
  return {
    ...params,
    processedEntities: [],
    allEntities: null,
    relationships: null,
  };
}

export async function ensureAllEntitiesLoaded(
  ctx: SyncContext,
  tracker: PipelineTracker
): Promise<Entity[]> {
  if (ctx.allEntities !== null) return ctx.allEntities;

  const orm = getORM();
  tracker.trackQuery();
  const { data, error } = await tracker.trackSpan('context:load_all_entities', async () => {
    return orm.select('public', 'entities', (q) =>
      q.eq('tenant_id', ctx.tenantId).eq('integration_id', ctx.integrationId)
    );
  });

  if (error) throw new Error(`Failed to load entities: ${error}`);

  ctx.allEntities = (data?.rows || []) as Entity[];

  Logger.trace({
    module: 'SyncContext',
    context: 'ensureAllEntitiesLoaded',
    message: `Loaded ${ctx.allEntities.length} entities (cached)`,
  });

  return ctx.allEntities;
}

export async function ensureRelationshipsLoaded(
  ctx: SyncContext,
  tracker: PipelineTracker
): Promise<Relationship[]> {
  if (ctx.relationships !== null) return ctx.relationships;

  const orm = getORM();
  tracker.trackQuery();
  const { data, error } = await tracker.trackSpan('context:load_all_relationships', async () => {
    return orm.select('public', 'entity_relationships', (q) =>
      q.eq('tenant_id', ctx.tenantId).eq('integration_id', ctx.integrationId)
    );
  });

  if (error) throw new Error(`Failed to load relationships: ${error}`);

  ctx.relationships = (data?.rows || []) as Relationship[];

  Logger.trace({
    module: 'SyncContext',
    context: 'ensureRelationshipsLoaded',
    message: `Loaded ${ctx.relationships.length} relationships (cached)`,
  });

  return ctx.relationships;
}

/**
 * Load entities scoped to a specific connection.
 */
export async function ensureConnectionEntitiesLoaded(
  ctx: SyncContext,
  tracker: PipelineTracker
): Promise<Entity[]> {
  if (ctx.allEntities !== null) return ctx.allEntities;

  const orm = getORM();
  tracker.trackQuery();
  const { data, error } = await tracker.trackSpan(
    'context:load_connection_entities',
    async () => {
      return orm.select('public', 'entities', (q) =>
        q
          .eq('tenant_id', ctx.tenantId)
          .eq('integration_id', ctx.integrationId)
          .eq('connection_id', ctx.connectionId!)
      );
    }
  );

  if (error) throw new Error(`Failed to load connection entities: ${error}`);

  ctx.allEntities = (data?.rows || []) as Entity[];

  Logger.trace({
    module: 'SyncContext',
    context: 'ensureConnectionEntitiesLoaded',
    message: `Loaded ${ctx.allEntities.length} entities for connection ${ctx.connectionId}`,
  });

  return ctx.allEntities;
}

/**
 * Load relationships scoped to a specific connection.
 * Fetches all relationships for the integration then filters to those
 * where at least one endpoint belongs to the connection's entity set.
 */
export async function ensureConnectionRelationshipsLoaded(
  ctx: SyncContext,
  tracker: PipelineTracker
): Promise<Relationship[]> {
  if (ctx.relationships !== null) return ctx.relationships;

  const entities = await ensureConnectionEntitiesLoaded(ctx, tracker);
  const entityIds = new Set(entities.map((e) => e.id));

  const orm = getORM();
  tracker.trackQuery();
  const { data, error } = await tracker.trackSpan(
    'context:load_connection_relationships',
    async () => {
      return orm.select('public', 'entity_relationships', (q) =>
        q.eq('tenant_id', ctx.tenantId).eq('integration_id', ctx.integrationId)
      );
    }
  );

  if (error) throw new Error(`Failed to load connection relationships: ${error}`);

  ctx.relationships = ((data?.rows || []) as Relationship[]).filter(
    (r) => entityIds.has(r.parent_entity_id) || entityIds.has(r.child_entity_id)
  );

  Logger.trace({
    module: 'SyncContext',
    context: 'ensureConnectionRelationshipsLoaded',
    message: `Loaded ${ctx.relationships.length} relationships for connection ${ctx.connectionId}`,
  });

  return ctx.relationships;
}

/**
 * Load entities scoped to a specific site. Also loads company entities
 * (parents needed for relationship linking).
 */
export async function ensureSiteEntitiesLoaded(
  ctx: SyncContext,
  tracker: PipelineTracker
): Promise<Entity[]> {
  if (ctx.allEntities !== null) return ctx.allEntities;

  if (!ctx.siteId) {
    return ensureAllEntitiesLoaded(ctx, tracker);
  }

  const orm = getORM();

  // Load site-scoped entities (endpoints for this site)
  tracker.trackQuery();
  const { data: siteData, error: siteError } = await tracker.trackSpan(
    'context:load_site_entities',
    async () => {
      return orm.select('public', 'entities', (q) =>
        q
          .eq('tenant_id', ctx.tenantId)
          .eq('integration_id', ctx.integrationId)
          .eq('site_id', ctx.siteId!)
      );
    }
  );

  if (siteError) throw new Error(`Failed to load site entities: ${siteError}`);

  // Also load company entities (parents needed for relationships)
  tracker.trackQuery();
  const { data: companyData, error: companyError } = await tracker.trackSpan(
    'context:load_company_entities',
    async () => {
      return orm.select('public', 'entities', (q) =>
        q
          .eq('tenant_id', ctx.tenantId)
          .eq('integration_id', ctx.integrationId)
          .eq('entity_type', 'company')
      );
    }
  );

  if (companyError) throw new Error(`Failed to load company entities: ${companyError}`);

  const siteEntities = (siteData?.rows || []) as Entity[];
  const companyEntities = (companyData?.rows || []) as Entity[];

  // Deduplicate (a company entity might also have the same site_id)
  const seen = new Set<string>();
  const combined: Entity[] = [];
  for (const e of [...siteEntities, ...companyEntities]) {
    if (!seen.has(e.id)) {
      seen.add(e.id);
      combined.push(e);
    }
  }

  ctx.allEntities = combined;

  Logger.trace({
    module: 'SyncContext',
    context: 'ensureSiteEntitiesLoaded',
    message: `Loaded ${siteEntities.length} site entities + ${companyEntities.length} company entities for site ${ctx.siteId}`,
  });

  return ctx.allEntities;
}

/**
 * Load relationships scoped to a specific site.
 */
export async function ensureSiteRelationshipsLoaded(
  ctx: SyncContext,
  tracker: PipelineTracker
): Promise<Relationship[]> {
  if (ctx.relationships !== null) return ctx.relationships;

  if (!ctx.siteId) {
    return ensureRelationshipsLoaded(ctx, tracker);
  }

  const orm = getORM();
  tracker.trackQuery();
  const { data, error } = await tracker.trackSpan('context:load_site_relationships', async () => {
    return orm.select('public', 'entity_relationships', (q) =>
      q
        .eq('tenant_id', ctx.tenantId)
        .eq('integration_id', ctx.integrationId)
        .eq('site_id', ctx.siteId!)
    );
  });

  if (error) throw new Error(`Failed to load site relationships: ${error}`);

  ctx.relationships = (data?.rows || []) as Relationship[];

  Logger.trace({
    module: 'SyncContext',
    context: 'ensureSiteRelationshipsLoaded',
    message: `Loaded ${ctx.relationships.length} relationships for site ${ctx.siteId}`,
  });

  return ctx.relationships;
}
