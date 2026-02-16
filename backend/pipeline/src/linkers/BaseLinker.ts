import { getORM } from '../supabase.js';
import { MetricsCollector } from '../lib/metrics.js';
import { Logger } from '../lib/logger.js';
import {
  ensureAllEntitiesLoaded,
  ensureRelationshipsLoaded,
  ensureSiteEntitiesLoaded,
  ensureSiteRelationshipsLoaded,
} from '../context.js';
import type { IntegrationId } from '../config.js';
import type { Entity, RelationshipToCreate, SyncContext } from '../types.js';

/**
 * BaseLinker - Abstract base class for relationship linkers.
 * No BullMQ — plain class called by SyncWorker (optionally).
 * Uses SyncContext to share loaded entities/relationships with other phases.
 */
export abstract class BaseLinker {
  readonly integrationId: IntegrationId;

  constructor(integrationId: IntegrationId) {
    this.integrationId = integrationId;
  }

  /**
   * Full link-and-reconcile flow: uses SyncContext for shared data,
   * calls abstract link(), reconciles (create new, touch existing, delete stale).
   *
   * When ctx.siteId is set (endpoint jobs), loads only site-scoped data
   * to avoid races between concurrent workers.
   */
  async linkAndReconcile(ctx: SyncContext, metrics: MetricsCollector): Promise<void> {
    Logger.log({
      module: 'BaseLinker',
      context: 'linkAndReconcile',
      message: `Starting linking for ${ctx.integrationId}${ctx.siteId ? ` (site: ${ctx.siteId})` : ''}`,
      level: 'info',
    });

    // Use site-scoped loading when siteId is set (endpoint jobs)
    const entities = ctx.siteId
      ? await ensureSiteEntitiesLoaded(ctx, metrics)
      : await ensureAllEntitiesLoaded(ctx, metrics);

    Logger.log({
      module: 'BaseLinker',
      context: 'linkAndReconcile',
      message: `Loaded ${entities.length} entities`,
      level: 'trace',
    });

    const existingRelationships = ctx.siteId
      ? await ensureSiteRelationshipsLoaded(ctx, metrics)
      : await ensureRelationshipsLoaded(ctx, metrics);

    Logger.log({
      module: 'BaseLinker',
      context: 'linkAndReconcile',
      message: `Found ${existingRelationships.length} existing relationships`,
      level: 'trace',
    });

    // Determine desired relationships
    const desiredRelationships = await this.link(entities);

    Logger.log({
      module: 'BaseLinker',
      context: 'linkAndReconcile',
      message: `Linker determined ${desiredRelationships.length} desired relationships`,
      level: 'trace',
    });

    // Reconcile
    const result = await this.reconcileRelationships(
      existingRelationships as any[],
      desiredRelationships,
      ctx,
      metrics
    );

    // Invalidate cached relationships since we just modified them
    ctx.relationships = null;

    Logger.log({
      module: 'BaseLinker',
      context: 'linkAndReconcile',
      message: `Reconciliation: ${result.created} created, ${result.updated} updated, ${result.deleted} deleted`,
      level: 'info',
    });
  }

  /**
   * Concrete linkers implement this to determine desired relationships from entities.
   */
  protected abstract link(entities: Entity[]): Promise<RelationshipToCreate[]>;

  private async reconcileRelationships(
    existing: any[],
    desired: RelationshipToCreate[],
    ctx: SyncContext,
    metrics: MetricsCollector
  ): Promise<{ created: number; updated: number; deleted: number }> {
    const orm = getORM();
    const now = new Date().toISOString();

    // sync_id FK references sync_jobs.id (PK), which is syncJobId — NOT syncId
    const syncJobId = ctx.syncJobId ?? null;

    // Build map of existing by composite key
    const existingMap = new Map<string, any>();
    for (const rel of existing) {
      const key = `${rel.parent_entity_id}:${rel.child_entity_id}:${rel.relationship_type}`;
      existingMap.set(key, rel);
    }

    const desiredKeys = new Set<string>();
    const toCreate: any[] = [];
    const toUpdate: string[] = [];

    for (const rel of desired) {
      const key = `${rel.parentEntityId}:${rel.childEntityId}:${rel.relationshipType}`;
      desiredKeys.add(key);

      const ex = existingMap.get(key);
      if (!ex) {
        toCreate.push({
          tenant_id: ctx.tenantId,
          integration_id: ctx.integrationId,
          parent_entity_id: rel.parentEntityId,
          child_entity_id: rel.childEntityId,
          relationship_type: rel.relationshipType,
          site_id: rel.siteId,
          metadata: rel.metadata || {},
          last_seen_at: now,
          sync_id: syncJobId,
        });
      } else {
        toUpdate.push(ex.id);
      }
    }

    // Find stale relationships to delete
    const toDelete: string[] = [];
    for (const rel of existing) {
      const key = `${rel.parent_entity_id}:${rel.child_entity_id}:${rel.relationship_type}`;
      if (!desiredKeys.has(key)) {
        toDelete.push(rel.id);
      }
    }

    // Execute using ORM batch methods
    if (toCreate.length > 0) {
      metrics.trackUpsert();
      const { error } = await orm.batchUpsert('public', 'entity_relationships', toCreate);
      if (error) {
        throw new Error(`Failed to insert entity_relationships: ${error}`);
      }
    }

    if (toUpdate.length > 0) {
      metrics.trackUpsert();
      const { error } = await orm.batchUpdate(
        'public',
        'entity_relationships',
        toUpdate,
        { last_seen_at: now, sync_id: syncJobId, updated_at: now } as any
      );
      if (error) {
        throw new Error(`Failed to update entity_relationships: ${error}`);
      }
    }

    if (toDelete.length > 0) {
      metrics.trackUpsert();
      const { error } = await orm.batchDelete('public', 'entity_relationships', toDelete);
      if (error) {
        throw new Error(`Failed to delete entity_relationships: ${error}`);
      }
    }

    return { created: toCreate.length, updated: toUpdate.length, deleted: toDelete.length };
  }
}
