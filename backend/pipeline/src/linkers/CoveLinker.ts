import { BaseLinker } from './BaseLinker.js';
import { getSupabase, getORM } from '../supabase.js';
import { PipelineTracker } from '../lib/tracker.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import type { Entity, RelationshipToCreate, SyncContext } from '../types.js';

export class CoveLinker extends BaseLinker {
  constructor() {
    super('cove');
  }

  protected async link(entities: Entity[]): Promise<RelationshipToCreate[]> {
    const companies = entities.filter((e) => e.entity_type === 'company');
    const endpoints = entities.filter((e) => e.entity_type === 'endpoint');

    // Build map: company external_id (= String(Info.Id)) → entity id
    const partnerIdToEntityId = new Map<string, string>();
    for (const site of companies) {
      if (site.external_id) {
        partnerIdToEntityId.set(site.external_id, site.id);
      }
    }

    const relationships: RelationshipToCreate[] = [];

    for (const endpoint of endpoints) {
      const partnerId = String(endpoint.raw_data?.PartnerId ?? '');
      if (!partnerId) continue;

      const parentCompanyEntityId = partnerIdToEntityId.get(partnerId);
      if (!parentCompanyEntityId) continue;

      relationships.push({
        siteId: endpoint.site_id || undefined,
        parentEntityId: parentCompanyEntityId,
        childEntityId: endpoint.id,
        relationshipType: 'contains',
      });
    }

    Logger.info({
      module: 'CoveLinker',
      context: 'link',
      message: `Determined ${relationships.length} device→company relationships`,
    });

    return relationships;
  }

  async linkAndReconcile(ctx: SyncContext, tracker: PipelineTracker): Promise<void> {
    // Run normal link-and-reconcile
    await super.linkAndReconcile(ctx, tracker);

    // Post-link steps only after company sync
    if (ctx.entityType === 'company' && ctx.integrationDbId) {
      await this.assignSiteIds(ctx, tracker);
      await this.cleanupStaleMappings(ctx, tracker);
      await this.fanOutEndpointJobs(ctx, tracker);
    }
  }

  private async assignSiteIds(ctx: SyncContext, tracker: PipelineTracker): Promise<void> {
    const orm = getORM();

    // Load site_to_integration mappings for this integration
    tracker.trackQuery();
    const { data: mappings } = await getSupabase()
      .from('site_to_integration')
      .select('site_id, external_id')
      .eq('integration_id', ctx.integrationDbId)
      .eq('tenant_id', ctx.tenantId);

    if (!mappings || mappings.length === 0) return;

    // Build map: external_id → site_id
    const externalIdToSiteId = new Map<string, string>();
    for (const mapping of mappings) {
      externalIdToSiteId.set(mapping.external_id, mapping.site_id);
    }

    // Group company entities by target site_id (skip those already correct)
    const companyEntities = ctx.processedEntities.filter((e) => e.entity_type === 'company');
    const updateGroups = new Map<string, string[]>();

    for (const entity of companyEntities) {
      const targetSiteId = externalIdToSiteId.get(entity.external_id);
      if (!targetSiteId || entity.site_id === targetSiteId) continue;

      if (!updateGroups.has(targetSiteId)) updateGroups.set(targetSiteId, []);
      updateGroups.get(targetSiteId)!.push(entity.id);
    }

    if (updateGroups.size === 0) return;

    for (const [siteId, entityIds] of updateGroups) {
      tracker.trackUpsert();
      const { error } = await orm.batchUpdate('public', 'entities', entityIds, {
        site_id: siteId,
      } as any);
      if (error) throw new Error(`Failed to assign site_id to company entities: ${error}`);
    }

    const totalUpdated = [...updateGroups.values()].reduce((sum, ids) => sum + ids.length, 0);
    Logger.info({
      module: 'CoveLinker',
      context: 'assignSiteIds',
      message: `Assigned site_id to ${totalUpdated} company entities`,
    });
  }

  private async cleanupStaleMappings(ctx: SyncContext, tracker: PipelineTracker): Promise<void> {
    const orm = getORM();

    // Load only company entities — this is a company-sync-only operation
    tracker.trackQuery();
    const { data, error } = await tracker.trackSpan('linker:cleanup_stale_mappings', async () => {
      return orm.select('public', 'entities', (q) =>
        q
          .eq('tenant_id', ctx.tenantId)
          .eq('integration_id', ctx.integrationId)
          .eq('entity_type', 'company')
      );
    });

    if (error) throw new Error(`Failed to load company entities: ${error}`);

    const companyEntities = data?.rows || [];
    const knownExternalIds = new Set(companyEntities.map((e) => e.external_id));

    // Load site_to_integration mappings
    tracker.trackQuery();
    const { data: mappings } = await getSupabase()
      .from('site_to_integration')
      .select('id, external_id')
      .eq('integration_id', ctx.integrationDbId)
      .eq('tenant_id', ctx.tenantId);

    const staleIds = (mappings || [])
      .filter((m) => !knownExternalIds.has(m.external_id))
      .map((m) => m.id);

    if (staleIds.length > 0) {
      tracker.trackUpsert();
      const { error: deleteError } = await orm.batchDelete(
        'public',
        'site_to_integration',
        staleIds
      );
      if (deleteError) throw new Error(`Failed to delete stale mappings: ${deleteError}`);

      Logger.info({
        module: 'CoveLinker',
        context: 'cleanupStaleMappings',
        message: `Deleted ${staleIds.length} stale site_to_integration mappings`,
      });
    }
  }

  async fanOutEndpointJobs(ctx: SyncContext, tracker: PipelineTracker): Promise<number> {
    const supabase = getSupabase();

    // Load site_to_integration mappings
    tracker.trackQuery();
    const { data: mappings } = await supabase
      .from('site_to_integration')
      .select('site_id')
      .eq('integration_id', ctx.integrationDbId)
      .eq('tenant_id', ctx.tenantId);

    if (!mappings || mappings.length === 0) return 0;

    // Check for existing active endpoint jobs for this integration+tenant
    tracker.trackQuery();
    const { data: existingJobs } = await supabase
      .from('sync_jobs')
      .select('site_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('integration_id', ctx.integrationId)
      .eq('entity_type', 'endpoint')
      .in('status', ['pending', 'queued', 'running']);

    const existingSiteIds = new Set((existingJobs || []).map((j) => j.site_id));

    const jobsToInsert = mappings
      .filter((m) => !existingSiteIds.has(m.site_id))
      .map((m) => ({
        tenant_id: ctx.tenantId,
        integration_id: ctx.integrationId,
        entity_type: 'endpoint',
        status: 'pending',
        priority: 3,
        trigger: 'scheduled',
        site_id: m.site_id,
      }));

    if (jobsToInsert.length > 0) {
      tracker.trackUpsert();
      await supabase.from('sync_jobs').insert(jobsToInsert);

      Logger.info({
        module: 'CoveLinker',
        context: 'fanOutEndpointJobs',
        message: `Created ${jobsToInsert.length} endpoint sync jobs`,
      });
    }

    return jobsToInsert.length;
  }
}
