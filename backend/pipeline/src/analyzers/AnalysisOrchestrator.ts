import { Job } from 'bullmq';
import { getSupabase } from '../supabase.js';
import { QueueNames, queueManager } from '../lib/queue.js';
import { MetricsCollector } from '../lib/metrics.js';
import { Logger } from '../lib/logger.js';
import { JobScheduler } from '../scheduler/JobScheduler.js';
import type { IntegrationId, EntityType } from '../config.js';
import type { AnalyzeJobData, AnalysisContext, Entity, Relationship, EntityState, AnalyzerResult } from '../types.js';
import { BaseAnalyzer } from './BaseAnalyzer.js';
import { AlertManager } from './AlertManager.js';
import { TagManager } from './TagManager.js';

/**
 * AnalysisOrchestrator - Coordinates all analyzers with batched data loading.
 * Loads context once, runs analyzers in parallel, merges results, applies changes.
 * Updates sync_jobs with completion status and metrics.
 */
export class AnalysisOrchestrator {
  private metrics: MetricsCollector;
  private analyzers: BaseAnalyzer[];
  private alertManager: AlertManager;
  private tagManager: TagManager;

  constructor(analyzers: BaseAnalyzer[]) {
    this.metrics = new MetricsCollector();
    this.analyzers = analyzers;
    this.alertManager = new AlertManager();
    this.tagManager = new TagManager();
  }

  start(): void {
    queueManager.createWorker<AnalyzeJobData>(QueueNames.analyze, this.handleAnalyzeJob.bind(this), {
      concurrency: 10,
    });

    Logger.log({
      module: 'AnalysisOrchestrator',
      context: 'start',
      message: `Started with ${this.analyzers.length} analyzers`,
      level: 'info',
    });
  }

  private async handleAnalyzeJob(job: Job<AnalyzeJobData>): Promise<void> {
    const {
      tenantId,
      integrationId,
      syncId,
      syncJobId,
      siteId,
      entityType,
      startedAt,
      metrics: previousMetrics,
    } = job.data;

    if (previousMetrics) {
      this.metrics = MetricsCollector.fromJSON(previousMetrics);
    } else {
      this.metrics.reset();
    }

    this.metrics.startStage('analyzer');
    const pipelineStartedAt = startedAt || Date.now();
    const supabase = getSupabase();

    Logger.log({
      module: 'AnalysisOrchestrator',
      context: 'handleAnalyzeJob',
      message: `Starting analysis for ${integrationId}`,
      level: 'info',
    });

    try {
      // Load context ONCE
      const context = await this.loadContext(tenantId, integrationId, syncId);

      const totalEntities = Object.values(context.entities).flat().length;
      Logger.log({
        module: 'AnalysisOrchestrator',
        context: 'handleAnalyzeJob',
        message: `Loaded context: ${totalEntities} entities, ${context.relationships.length} relationships`,
        level: 'trace',
      });

      // Run all analyzers in parallel
      const results = await Promise.all(
        this.analyzers.map(async (analyzer) => {
          try {
            const result = await analyzer.analyze(context);
            Logger.log({
              module: 'AnalysisOrchestrator',
              context: 'handleAnalyzeJob',
              message: `${analyzer.getName()}: ${result.alerts.length} alerts, ${result.entityTags.size} tagged, ${result.entityStates.size} states`,
              level: 'trace',
            });
            return result;
          } catch (error) {
            Logger.log({
              module: 'AnalysisOrchestrator',
              context: 'handleAnalyzeJob',
              message: `${analyzer.getName()} failed: ${error}`,
              level: 'error',
            });
            throw error;
          }
        }),
      );

      // Merge results
      const mergedTags = this.mergeTags(results);
      const mergedStates = this.mergeStates(results);
      const allAlerts = results.flatMap((r) => r.alerts);

      // Apply tags via TagManager (entity_tags table)
      await this.tagManager.applyTags(mergedTags);

      // Apply entity states
      if (mergedStates.size > 0) {
        await this.batchApplyStates(mergedStates);
      }

      // Process alerts via AlertManager (entity_alerts table)
      await this.alertManager.processAlerts(allAlerts, tenantId, integrationId, syncId, siteId);

      this.metrics.endStage('analyzer');

      // Update sync_jobs with completion
      const completedAt = new Date().toISOString();
      await supabase
        .from('sync_jobs')
        .update({
          status: 'completed',
          completed_at: completedAt,
          metrics: this.metrics.toJSON(),
          updated_at: completedAt,
        })
        .eq('id', syncJobId);

      // Schedule next recurring sync
      await JobScheduler.scheduleNextSync(tenantId, integrationId, entityType as EntityType | undefined);

      Logger.log({
        module: 'AnalysisOrchestrator',
        context: 'handleAnalyzeJob',
        message: `Analysis complete for ${integrationId}`,
        level: 'info',
      });
    } catch (error) {
      this.metrics.trackError(error as Error, job.attemptsMade);
      this.metrics.endStage('analyzer');

      // Mark sync_job as failed
      try {
        await supabase
          .from('sync_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            metrics: this.metrics.toJSON(),
            error: (error as Error).message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', syncJobId);
      } catch (updateError) {
        Logger.log({
          module: 'AnalysisOrchestrator',
          context: 'handleAnalyzeJob',
          message: `Failed to update sync_job: ${updateError}`,
          level: 'error',
        });
      }

      Logger.log({
        module: 'AnalysisOrchestrator',
        context: 'handleAnalyzeJob',
        message: `Analysis failed: ${error}`,
        level: 'error',
      });

      throw error;
    }
  }

  private async loadContext(
    tenantId: number,
    integrationId: IntegrationId,
    syncId: string,
  ): Promise<AnalysisContext> {
    const supabase = getSupabase();

    this.metrics.trackQuery();
    const { data: allEntities } = await supabase
      .from('entities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('integration_id', integrationId);

    const entities = allEntities || [];

    const grouped = {
      identities: entities.filter((e) => e.entity_type === 'identity'),
      policies: entities.filter((e) => e.entity_type === 'policy'),
      licenses: entities.filter((e) => e.entity_type === 'license'),
      groups: entities.filter((e) => e.entity_type === 'group'),
      roles: entities.filter((e) => e.entity_type === 'role'),
      companies: entities.filter((e) => e.entity_type === 'company'),
      endpoints: entities.filter((e) => e.entity_type === 'endpoint'),
      firewalls: entities.filter((e) => e.entity_type === 'firewall'),
      backup_devices: entities.filter((e) => e.entity_type === 'backup_device'),
      backup_customers: entities.filter((e) => e.entity_type === 'backup_customer'),
      tickets: entities.filter((e) => e.entity_type === 'ticket'),
      contracts: entities.filter((e) => e.entity_type === 'contract'),
      contract_services: entities.filter((e) => e.entity_type === 'contract_service'),
      device_sites: entities.filter((e) => e.entity_type === 'device_site'),
    };

    this.metrics.trackQuery();
    const { data: relationships } = await supabase
      .from('entity_relationships')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('integration_id', integrationId);

    const rels = (relationships || []) as Relationship[];
    const entityMap = new Map(entities.map((e) => [e.id, e as Entity]));

    const context: AnalysisContext = {
      tenantId,
      integrationId,
      syncId,
      entities: grouped as any,
      relationships: rels,

      getEntity(id: number): Entity | undefined {
        return entityMap.get(id);
      },

      getRelationships(entityId: number, type?: string): Relationship[] {
        return rels.filter(
          (r) =>
            (r.parent_entity_id === entityId || r.child_entity_id === entityId) &&
            (!type || r.relationship_type === type),
        );
      },

      getChildEntities(parentId: number): Entity[] {
        const childIds = rels
          .filter((r) => r.parent_entity_id === parentId)
          .map((r) => r.child_entity_id);
        return childIds.map((id) => entityMap.get(id)).filter((e): e is Entity => e !== undefined);
      },

      getParentEntity(childId: number): Entity | undefined {
        const parentRel = rels.find((r) => r.child_entity_id === childId);
        return parentRel ? entityMap.get(parentRel.parent_entity_id) : undefined;
      },
    };

    return context;
  }

  private mergeTags(
    results: AnalyzerResult[],
  ): Map<number, { tag: string; category?: string; source: string }[]> {
    const merged = new Map<number, Map<string, { tag: string; category?: string; source: string }>>();

    for (const result of results) {
      for (const [entityId, tags] of result.entityTags) {
        if (!merged.has(entityId)) {
          merged.set(entityId, new Map());
        }
        const entityTagMap = merged.get(entityId)!;
        for (const t of tags) {
          entityTagMap.set(t.tag, t); // dedup by tag name
        }
      }
    }

    return new Map(
      Array.from(merged.entries()).map(([id, tagMap]) => [id, Array.from(tagMap.values())]),
    );
  }

  private mergeStates(results: AnalyzerResult[]): Map<number, EntityState> {
    const merged = new Map<number, EntityState>();
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

  private async batchApplyStates(states: Map<number, EntityState>): Promise<void> {
    const supabase = getSupabase();
    const now = new Date().toISOString();

    for (const [entityId, state] of states) {
      await supabase.from('entities').update({ state, updated_at: now }).eq('id', entityId);
    }

    Logger.log({
      module: 'AnalysisOrchestrator',
      context: 'batchApplyStates',
      message: `Applied state changes to ${states.size} entities`,
      level: 'trace',
    });
  }

  async stop(): Promise<void> {
    Logger.log({
      module: 'AnalysisOrchestrator',
      context: 'stop',
      message: 'AnalysisOrchestrator stopped',
      level: 'info',
    });
  }
}
