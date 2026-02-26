import { getSupabase } from '../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import type { Entity, EntityState, Relationship } from '../types.js';
import type { BaseJob } from './BaseJob.js';
import type { JobContext, JobResult } from './types.js';
import { AlertManager } from '../analyzers/AlertManager.js';
import { TagManager } from '../analyzers/TagManager.js';
import { PipelineTracker } from '../lib/tracker.js';
import type { Json } from '@workspace/shared/types/schema';

/**
 * QueryJobRunner — executes one (job × scope) pair.
 * Loads entities, builds JobContext, runs the job, applies results.
 * Replaces AnalysisOrchestrator.
 */
export class QueryJobRunner {
  private alertManager: AlertManager;
  private tagManager: TagManager;
  private jobs: BaseJob[];

  constructor(jobs: BaseJob[]) {
    this.alertManager = new AlertManager();
    this.tagManager = new TagManager();
    this.jobs = jobs;
  }

  async run(
    queryJobId: string,
    tenantId: string,
    connectionId: string | null,
    siteId: string | null
  ): Promise<void> {
    const supabase = getSupabase();
    const tracker = new PipelineTracker();

    // 1. Look up query_jobs row
    const { data: queryJobRow, error: jobError } = await supabase
      .from('query_jobs')
      .select('*')
      .eq('id', queryJobId)
      .single();

    if (jobError || !queryJobRow) {
      throw new Error(`query_jobs row not found: ${queryJobId}`);
    }

    const { name, integration_id: integrationId } = queryJobRow;

    // 2. Find matching registered job
    const job = this.jobs.find(
      (j) => j.getName() === name && j.getIntegrationId() === integrationId
    );

    if (!job) {
      throw new Error(`No registered job for name=${name} integrationId=${integrationId}`);
    }

    // 3. Insert query_job_history row
    const { data: historyRow, error: historyInsertError } = await supabase
      .from('query_job_history')
      .insert({
        job_id: queryJobId,
        tenant_id: tenantId,
        connection_id: connectionId,
        site_id: siteId,
        status: 'running',
      })
      .select()
      .single();

    if (historyInsertError || !historyRow) {
      throw new Error(`Failed to insert query_job_history: ${historyInsertError?.message}`);
    }

    const historyId = historyRow.id;

    try {
      // 4. Load entities scoped to (tenantId, integrationId, connectionId, siteId)
      const { entities, relationships } = await tracker.trackSpan('query:load_entities', () =>
        this.loadEntities(tenantId, integrationId, connectionId, siteId)
      );

      // 5. Build JobContext
      const ctx = this.buildContext(
        tenantId,
        integrationId,
        connectionId,
        siteId,
        entities,
        relationships
      );

      // 6. Execute job
      Logger.info({
        module: 'QueryJobRunner',
        context: 'run',
        message: `Executing job ${name} for ${integrationId} (tenant ${tenantId}, conn ${connectionId}, site ${siteId})`,
      });

      const result = await tracker.trackSpan('query:execute', () => job.execute(ctx));

      // 7. Apply results
      const { alertStats, entitiesUpdated } = await tracker.trackSpan(
        'query:apply_results',
        async () => {
          const alertStats = await this.alertManager.processAlerts(
            result.alerts,
            tenantId,
            integrationId,
            historyId,
            siteId ?? undefined,
            connectionId ?? undefined,
            job.getAlertTypes(),
          );

          await this.tagManager.applyTags(tenantId, result.entityTags);

          let entitiesUpdated = 0;
          if (result.entityStates.size > 0) {
            entitiesUpdated = await this.batchApplyStates(result.entityStates);
          }

          return { alertStats, entitiesUpdated };
        }
      );

      const metrics = tracker.toJSON();

      // 8. Update history row to completed
      await supabase
        .from('query_job_history')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          alerts_created: alertStats.created,
          alerts_resolved: alertStats.resolved,
          tags_applied: result.entityTags.size,
          entities_updated: entitiesUpdated,
          duration_ms: metrics.total_ms,
          metrics: metrics as unknown as Json,
        })
        .eq('id', historyId);

      Logger.info({
        module: 'QueryJobRunner',
        context: 'run',
        message: `Job ${name} completed in ${metrics.total_ms}ms — ${alertStats.created} alerts, ${alertStats.resolved} resolved`,
      });
    } catch (error) {
      tracker.trackError(error as Error);
      const metrics = tracker.toJSON();

      await supabase
        .from('query_job_history')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: (error as Error).message,
          duration_ms: metrics.total_ms,
          metrics: metrics as unknown as Json,
        })
        .eq('id', historyId);

      throw error;
    }
  }

  private async loadEntities(
    tenantId: string,
    integrationId: string,
    connectionId: string | null,
    siteId: string | null
  ): Promise<{ entities: Entity[]; relationships: Relationship[] }> {
    const supabase = getSupabase();

    let entityQuery = supabase
      .from('entities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('integration_id', integrationId);

    if (siteId) {
      // Site-scoped: load site entities + company entities for context
      const [siteResult, companyResult] = await Promise.all([
        supabase
          .from('entities')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('integration_id', integrationId)
          .eq('site_id', siteId),
        supabase
          .from('entities')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('integration_id', integrationId)
          .eq('entity_type', 'company'),
      ]);

      const siteEntities = (siteResult.data || []) as Entity[];
      const companyEntities = (companyResult.data || []) as Entity[];

      // Deduplicate
      const seen = new Set<string>();
      const entities: Entity[] = [];
      for (const e of [...siteEntities, ...companyEntities]) {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          entities.push(e);
        }
      }

      const { data: rels } = await supabase
        .from('entity_relationships')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('integration_id', integrationId)
        .eq('site_id', siteId);

      return { entities, relationships: (rels || []) as Relationship[] };
    } else if (connectionId) {
      // Connection-scoped
      entityQuery = entityQuery.eq('connection_id', connectionId);
      const { data: entityData } = await entityQuery;
      const entities = (entityData || []) as Entity[];

      const entityIds = new Set(entities.map((e) => e.id));
      const { data: allRels } = await supabase
        .from('entity_relationships')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('integration_id', integrationId);

      const relationships = ((allRels || []) as Relationship[]).filter(
        (r) => entityIds.has(r.parent_entity_id) || entityIds.has(r.child_entity_id)
      );

      return { entities, relationships };
    } else {
      // All entities for this integration
      const { data: entityData } = await entityQuery;
      const entities = (entityData || []) as Entity[];

      const { data: rels } = await supabase
        .from('entity_relationships')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('integration_id', integrationId);

      return { entities, relationships: (rels || []) as Relationship[] };
    }
  }

  private buildContext(
    tenantId: string,
    integrationId: string,
    connectionId: string | null,
    siteId: string | null,
    entities: Entity[],
    relationships: Relationship[]
  ): JobContext {
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
      exchange_configs: entities.filter((e) => e.entity_type === 'exchange-config'),
    };

    const entityMap = new Map(entities.map((e) => [e.id, e]));

    return {
      tenantId,
      integrationId,
      connectionId,
      siteId,
      entities: grouped,
      relationships,
      getChildEntities(parentId: string): Entity[] {
        const childIds = relationships
          .filter((r) => r.parent_entity_id === parentId)
          .map((r) => r.child_entity_id);
        return childIds.map((id) => entityMap.get(id)).filter((e): e is Entity => e !== undefined);
      },
    };
  }

  private async batchApplyStates(states: Map<string, EntityState>): Promise<number> {
    const supabase = getSupabase();
    const now = new Date().toISOString();

    const byState = new Map<EntityState, string[]>();
    for (const [entityId, state] of states) {
      if (!byState.has(state)) byState.set(state, []);
      byState.get(state)!.push(entityId);
    }

    for (const [state, entityIds] of byState) {
      for (let i = 0; i < entityIds.length; i += 500) {
        const chunk = entityIds.slice(i, i + 500);
        await supabase.from('entities').update({ state, updated_at: now }).in('id', chunk);
      }
    }

    Logger.trace({
      module: 'QueryJobRunner',
      context: 'batchApplyStates',
      message: `Applied state changes to ${states.size} entities`,
    });

    return states.size;
  }
}
