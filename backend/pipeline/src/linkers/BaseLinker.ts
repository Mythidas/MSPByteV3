import { Job } from 'bullmq';
import { getSupabase } from '../supabase.js';
import { QueueNames, queueManager } from '../lib/queue.js';
import { MetricsCollector } from '../lib/metrics.js';
import { Logger } from '../lib/logger.js';
import type { IntegrationId } from '../config.js';
import type { LinkJobData, Entity, RelationshipToCreate } from '../types.js';

/**
 * BaseLinker - Abstract base class for relationship linkers.
 * Loads entities, calls concrete link(), reconciles relationships.
 */
export abstract class BaseLinker {
  protected metrics: MetricsCollector;
  protected integrationId: IntegrationId;

  constructor(integrationId: IntegrationId) {
    this.metrics = new MetricsCollector();
    this.integrationId = integrationId;
  }

  start(): void {
    const queueName = QueueNames.link(this.integrationId);

    queueManager.createWorker<LinkJobData>(queueName, this.handleLinkJob.bind(this), {
      concurrency: 5,
    });

    Logger.log({
      module: 'BaseLinker',
      context: 'start',
      message: `${this.getLinkerName()} started worker for ${this.integrationId}`,
      level: 'info',
    });
  }

  private async handleLinkJob(job: Job<LinkJobData>): Promise<void> {
    const {
      tenantId,
      integrationId,
      integrationDbId,
      syncId,
      syncJobId,
      siteId,
      startedAt,
      metrics: previousMetrics,
    } = job.data;

    if (previousMetrics) {
      this.metrics = MetricsCollector.fromJSON(previousMetrics);
    } else {
      this.metrics.reset();
    }

    this.metrics.startStage('linker');
    const supabase = getSupabase();

    Logger.log({
      module: 'BaseLinker',
      context: 'handleLinkJob',
      message: `Starting linking for ${integrationId}`,
      level: 'info',
    });

    try {
      // Load all entities for this integration + tenant
      this.metrics.trackQuery();
      const { data: entities } = await supabase
        .from('entities')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('integration_id', integrationId);

      Logger.log({
        module: 'BaseLinker',
        context: 'handleLinkJob',
        message: `Loaded ${entities?.length || 0} entities`,
        level: 'trace',
      });

      // Load existing relationships
      this.metrics.trackQuery();
      const { data: existingRelationships } = await supabase
        .from('entity_relationships')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('integration_id', integrationId);

      Logger.log({
        module: 'BaseLinker',
        context: 'handleLinkJob',
        message: `Found ${existingRelationships?.length || 0} existing relationships`,
        level: 'trace',
      });

      // Determine desired relationships
      const desiredRelationships = await this.link((entities || []) as Entity[]);

      Logger.log({
        module: 'BaseLinker',
        context: 'handleLinkJob',
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
      );

      Logger.log({
        module: 'BaseLinker',
        context: 'handleLinkJob',
        message: `Reconciliation: ${result.created} created, ${result.updated} updated, ${result.deleted} deleted`,
        level: 'info',
      });

      this.metrics.endStage('linker');

      // Trigger analyze stage
      await this.triggerAnalyze(tenantId, integrationId, integrationDbId, syncId, syncJobId, startedAt, siteId);
    } catch (error) {
      this.metrics.trackError(error as Error, job.attemptsMade);
      this.metrics.endStage('linker');
      Logger.log({
        module: 'BaseLinker',
        context: 'handleLinkJob',
        message: `Linking failed: ${error}`,
        level: 'error',
      });
      throw error;
    }
  }

  protected abstract link(entities: Entity[]): Promise<RelationshipToCreate[]>;
  protected abstract getLinkerName(): string;

  private async reconcileRelationships(
    existing: any[],
    desired: RelationshipToCreate[],
    tenantId: number,
    integrationId: IntegrationId,
    syncId: string,
  ): Promise<{ created: number; updated: number; deleted: number }> {
    const supabase = getSupabase();
    const now = new Date().toISOString();

    // Build map of existing by key
    const existingMap = new Map<string, any>();
    for (const rel of existing) {
      const key = `${rel.parent_entity_id}:${rel.child_entity_id}:${rel.relationship_type}`;
      existingMap.set(key, rel);
    }

    const desiredKeys = new Set<string>();
    const toCreate: any[] = [];
    const toUpdate: number[] = [];

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
    const toDelete: number[] = [];
    for (const rel of existing) {
      const key = `${rel.parent_entity_id}:${rel.child_entity_id}:${rel.relationship_type}`;
      if (!desiredKeys.has(key)) {
        toDelete.push(rel.id);
      }
    }

    // Execute
    if (toCreate.length > 0) {
      this.metrics.trackUpsert();
      await supabase.from('entity_relationships').insert(toCreate);
    }

    if (toUpdate.length > 0) {
      this.metrics.trackUpsert();
      await supabase
        .from('entity_relationships')
        .update({ last_seen_at: now, sync_id: syncId, updated_at: now })
        .in('id', toUpdate);
    }

    if (toDelete.length > 0) {
      this.metrics.trackUpsert();
      // Delete in chunks of 100
      for (let i = 0; i < toDelete.length; i += 100) {
        await supabase
          .from('entity_relationships')
          .delete()
          .in('id', toDelete.slice(i, i + 100));
      }
    }

    return { created: toCreate.length, updated: toUpdate.length, deleted: toDelete.length };
  }

  private async triggerAnalyze(
    tenantId: number,
    integrationId: IntegrationId,
    integrationDbId: string,
    syncId: string,
    syncJobId: number,
    startedAt?: number,
    siteId?: number,
  ): Promise<void> {
    await queueManager.addJob(
      QueueNames.analyze,
      {
        tenantId,
        integrationId,
        integrationDbId,
        syncId,
        syncJobId,
        siteId,
        startedAt,
        metrics: this.metrics.toJSON(),
      },
      { priority: 5 },
    );

    Logger.log({
      module: 'BaseLinker',
      context: 'triggerAnalyze',
      message: `Triggered analyze job for ${integrationId}`,
      level: 'info',
    });
  }

  async stop(): Promise<void> {
    Logger.log({
      module: 'BaseLinker',
      context: 'stop',
      message: `${this.getLinkerName()} stopped`,
      level: 'info',
    });
  }
}
