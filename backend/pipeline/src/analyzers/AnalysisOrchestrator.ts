import { getSupabase } from '../supabase.js';
import { MetricsCollector } from '../lib/metrics.js';
import { Logger } from '../lib/logger.js';
import { ensureAllEntitiesLoaded, ensureRelationshipsLoaded } from '../context.js';
import type { IntegrationId } from '../config.js';
import type {
  AnalysisContext,
  Entity,
  Relationship,
  EntityState,
  AnalyzerResult,
  SyncContext,
} from '../types.js';
import { BaseAnalyzer } from './BaseAnalyzer.js';
import { AlertManager } from './AlertManager.js';
import { TagManager } from './TagManager.js';

/**
 * AnalysisOrchestrator - Coordinates all analyzers with batched data loading.
 * Uses SyncContext to share loaded entities/relationships with other phases.
 * Loads context once, runs analyzers in parallel, merges results, applies changes.
 */
export class AnalysisOrchestrator {
  private analyzers: BaseAnalyzer[];
  private alertManager: AlertManager;
  private tagManager: TagManager;

  constructor(analyzers: BaseAnalyzer[]) {
    this.analyzers = analyzers;
    this.alertManager = new AlertManager();
    this.tagManager = new TagManager();
  }

  async analyze(
    ctx: SyncContext,
    metrics: MetricsCollector,
  ): Promise<void> {
    Logger.log({
      module: 'AnalysisOrchestrator',
      context: 'analyze',
      message: `Starting analysis for ${ctx.integrationId}`,
      level: 'info',
    });

    // Load context using shared SyncContext (avoids re-SELECTs)
    const context = await this.buildAnalysisContext(ctx, metrics);

    const totalEntities = Object.values(context.entities).flat().length;
    Logger.log({
      module: 'AnalysisOrchestrator',
      context: 'analyze',
      message: `Loaded context: ${totalEntities} entities, ${context.relationships.length} relationships`,
      level: 'trace',
    });

    const matchedAnalyzers = this.analyzers.filter((a) => a.getName() === ctx.integrationId);

    if (matchedAnalyzers.length === 0) {
      Logger.log({
        module: 'AnalysisOrchestrator',
        context: 'analyze',
        message: `No analyzers registered for ${ctx.integrationId}, skipping analysis`,
        level: 'trace',
      });
      return;
    }

    // Run matching analyzers in parallel
    const results = await Promise.all(
      matchedAnalyzers.map(async (analyzer) => {
        try {
          const result = await analyzer.analyze(context);
          Logger.log({
            module: 'AnalysisOrchestrator',
            context: 'analyze',
            message: `${analyzer.getName()}: ${result.alerts.length} alerts, ${result.entityTags.size} tagged, ${result.entityStates.size} states`,
            level: 'trace',
          });
          return result;
        } catch (error) {
          Logger.log({
            module: 'AnalysisOrchestrator',
            context: 'analyze',
            message: `${analyzer.getName()} failed: ${error}`,
            level: 'error',
          });
          throw error;
        }
      })
    );

    // Merge results
    const mergedTags = this.mergeTags(results);
    const mergedStates = this.mergeStates(results);
    const allAlerts = results.flatMap((r) => r.alerts);

    // Apply tags via TagManager
    await this.tagManager.applyTags(ctx.tenantId, mergedTags);

    // Apply entity states (grouped by state for efficiency)
    if (mergedStates.size > 0) {
      await this.batchApplyStates(mergedStates);
    }

    // Process alerts via AlertManager
    await this.alertManager.processAlerts(
      allAlerts,
      ctx.tenantId,
      ctx.integrationId,
      ctx.syncId,
      ctx.siteId,
    );

    Logger.log({
      module: 'AnalysisOrchestrator',
      context: 'analyze',
      message: `Analysis complete for ${ctx.integrationId}`,
      level: 'info',
    });
  }

  private async buildAnalysisContext(
    ctx: SyncContext,
    metrics: MetricsCollector,
  ): Promise<AnalysisContext> {
    const entities = await ensureAllEntitiesLoaded(ctx, metrics);
    const rels = await ensureRelationshipsLoaded(ctx, metrics);

    const grouped = {
      identities: entities.filter((e) => e.entity_type === 'identity'),
      policies: entities.filter((e) => e.entity_type === 'policy'),
      licenses: entities.filter((e) => e.entity_type === 'license'),
      groups: entities.filter((e) => e.entity_type === 'group'),
      roles: entities.filter((e) => e.entity_type === 'role'),
      companies: entities.filter((e) => e.entity_type === 'company'),
      endpoints: entities.filter((e) => e.entity_type === 'endpoint'),
      firewalls: entities.filter((e) => e.entity_type === 'firewall'),
      tickets: entities.filter((e) => e.entity_type === 'ticket'),
      contracts: entities.filter((e) => e.entity_type === 'contract'),
      contract_services: entities.filter((e) => e.entity_type === 'contract_service'),
    };

    const entityMap = new Map(entities.map((e) => [e.id, e]));

    return {
      tenantId: ctx.tenantId,
      integrationId: ctx.integrationId as IntegrationId,
      syncId: ctx.syncId,
      entities: grouped,
      relationships: rels,

      getEntity(id: string): Entity | undefined {
        return entityMap.get(id);
      },

      getRelationships(entityId: string, type?: string): Relationship[] {
        return rels.filter(
          (r) =>
            (r.parent_entity_id === entityId || r.child_entity_id === entityId) &&
            (!type || r.relationship_type === type)
        );
      },

      getChildEntities(parentId: string): Entity[] {
        const childIds = rels
          .filter((r) => r.parent_entity_id === parentId)
          .map((r) => r.child_entity_id);
        return childIds.map((id) => entityMap.get(id)).filter((e): e is Entity => e !== undefined);
      },

      getParentEntity(childId: string): Entity | undefined {
        const parentRel = rels.find((r) => r.child_entity_id === childId);
        return parentRel ? entityMap.get(parentRel.parent_entity_id) : undefined;
      },
    };
  }

  private mergeTags(
    results: AnalyzerResult[]
  ): Map<string, { tag: string; category?: string; source: string }[]> {
    const merged = new Map<
      string,
      Map<string, { tag: string; category?: string; source: string }>
    >();

    for (const result of results) {
      for (const [entityId, tags] of result.entityTags) {
        if (!merged.has(entityId)) {
          merged.set(entityId, new Map());
        }
        const entityTagMap = merged.get(entityId)!;
        for (const t of tags) {
          entityTagMap.set(t.tag, t);
        }
      }
    }

    return new Map(
      Array.from(merged.entries()).map(([id, tagMap]) => [id, Array.from(tagMap.values())])
    );
  }

  private mergeStates(results: AnalyzerResult[]): Map<string, EntityState> {
    const merged = new Map<string, EntityState>();
    const statePriority: Record<EntityState, number> = {
      normal: 0,
      low: 1,
      warn: 2,
      critical: 4,
    };

    for (const result of results) {
      for (const [entityId, state] of result.entityStates) {
        const existing = merged.get(entityId) || 'normal';
        if (statePriority[state] >= statePriority[existing]) {
          merged.set(entityId, state);
        }
      }
    }

    return merged;
  }

  /**
   * Group entity IDs by state value and issue one UPDATE per state (max 4).
   */
  private async batchApplyStates(states: Map<string, EntityState>): Promise<void> {
    const supabase = getSupabase();
    const now = new Date().toISOString();

    // Group entity IDs by state
    const byState = new Map<EntityState, string[]>();
    for (const [entityId, state] of states) {
      if (!byState.has(state)) {
        byState.set(state, []);
      }
      byState.get(state)!.push(entityId);
    }

    // One UPDATE per state value (max 4: normal, low, warn, critical)
    for (const [state, entityIds] of byState) {
      for (let i = 0; i < entityIds.length; i += 500) {
        const chunk = entityIds.slice(i, i + 500);
        await supabase.from('entities').update({ state, updated_at: now }).in('id', chunk);
      }
    }

    Logger.log({
      module: 'AnalysisOrchestrator',
      context: 'batchApplyStates',
      message: `Applied state changes to ${states.size} entities (${byState.size} batched UPDATEs)`,
      level: 'trace',
    });
  }
}
