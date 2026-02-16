import { getSupabase } from './supabase.js';
import { MetricsCollector } from './lib/metrics.js';
import { Logger } from './lib/logger.js';
import type { Entity, Relationship, SyncContext } from './types.js';

export function createSyncContext(params: {
  tenantId: string;
  integrationId: string;
  integrationDbId: string;
  entityType: string;
  syncId: string;
  syncJobId?: string;
  siteId?: string;
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
  metrics: MetricsCollector,
): Promise<Entity[]> {
  if (ctx.allEntities !== null) return ctx.allEntities;

  const supabase = getSupabase();
  metrics.trackQuery();
  const { data } = await supabase
    .from('entities')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .eq('integration_id', ctx.integrationId);

  ctx.allEntities = (data || []) as Entity[];

  Logger.log({
    module: 'SyncContext',
    context: 'ensureAllEntitiesLoaded',
    message: `Loaded ${ctx.allEntities.length} entities (cached)`,
    level: 'trace',
  });

  return ctx.allEntities;
}

export async function ensureRelationshipsLoaded(
  ctx: SyncContext,
  metrics: MetricsCollector,
): Promise<Relationship[]> {
  if (ctx.relationships !== null) return ctx.relationships;

  const supabase = getSupabase();
  metrics.trackQuery();
  const { data } = await supabase
    .from('entity_relationships')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .eq('integration_id', ctx.integrationId);

  ctx.relationships = (data || []) as Relationship[];

  Logger.log({
    module: 'SyncContext',
    context: 'ensureRelationshipsLoaded',
    message: `Loaded ${ctx.relationships.length} relationships (cached)`,
    level: 'trace',
  });

  return ctx.relationships;
}
