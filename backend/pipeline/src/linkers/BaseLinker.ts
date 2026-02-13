import { getSupabase } from '../supabase.js';
import { MetricsCollector } from '../lib/metrics.js';
import { Logger } from '../lib/logger.js';
import type { IntegrationId } from '../config.js';
import type { Entity, RelationshipToCreate } from '../types.js';

/**
 * BaseLinker - Abstract base class for relationship linkers.
 * No BullMQ — plain class called by SyncWorker (optionally).
 * Loads entities, calls concrete link(), reconciles relationships.
 */
export abstract class BaseLinker {
  readonly integrationId: IntegrationId;

  constructor(integrationId: IntegrationId) {
    this.integrationId = integrationId;
  }

  /**
   * Full link-and-reconcile flow: loads all entities + existing relationships,
   * calls abstract link(), reconciles (create new, touch existing, delete stale).
   */
  async linkAndReconcile(
    tenantId: string,
    integrationId: string,
    syncId: string,
    metrics: MetricsCollector,
  ): Promise<void> {
    const supabase = getSupabase();

    Logger.log({
      module: 'BaseLinker',
      context: 'linkAndReconcile',
      message: `Starting linking for ${integrationId}`,
      level: 'info',
    });

    // Load all entities for this integration + tenant
    metrics.trackQuery();
    const { data: entities } = await supabase
      .from('entities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('integration_id', integrationId);

    Logger.log({
      module: 'BaseLinker',
      context: 'linkAndReconcile',
      message: `Loaded ${entities?.length || 0} entities`,
      level: 'trace',
    });

    // Load existing relationships
    metrics.trackQuery();
    const { data: existingRelationships } = await supabase
      .from('entity_relationships')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('integration_id', integrationId);

    Logger.log({
      module: 'BaseLinker',
      context: 'linkAndReconcile',
      message: `Found ${existingRelationships?.length || 0} existing relationships`,
      level: 'trace',
    });

    // Determine desired relationships
    const desiredRelationships = await this.link((entities || []) as Entity[]);

    Logger.log({
      module: 'BaseLinker',
      context: 'linkAndReconcile',
      message: `Linker determined ${desiredRelationships.length} desired relationships`,
      level: 'trace',
    });

    // Reconcile
    const result = await this.reconcileRelationships(
      (existingRelationships || []) as any[],
      desiredRelationships,
      tenantId,
      integrationId,
      syncId,
      metrics,
    );

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
    tenantId: string,
    integrationId: string,
    syncId: string,
    metrics: MetricsCollector,
  ): Promise<{ created: number; updated: number; deleted: number }> {
    const supabase = getSupabase();
    const now = new Date().toISOString();

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
          tenant_id: tenantId,
          integration_id: integrationId,
          parent_entity_id: rel.parentEntityId,
          child_entity_id: rel.childEntityId,
          relationship_type: rel.relationshipType,
          metadata: rel.metadata || {},
          last_seen_at: now,
          sync_id: syncId,
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

    // Execute
    if (toCreate.length > 0) {
      metrics.trackUpsert();
      await supabase.from('entity_relationships').insert(toCreate);
    }

    if (toUpdate.length > 0) {
      metrics.trackUpsert();
      await supabase
        .from('entity_relationships')
        .update({ last_seen_at: now, sync_id: syncId, updated_at: now })
        .in('id', toUpdate);
    }

    if (toDelete.length > 0) {
      metrics.trackUpsert();
      for (let i = 0; i < toDelete.length; i += 100) {
        await supabase
          .from('entity_relationships')
          .delete()
          .in('id', toDelete.slice(i, i + 100));
      }
    }

    return { created: toCreate.length, updated: toUpdate.length, deleted: toDelete.length };
  }
}
