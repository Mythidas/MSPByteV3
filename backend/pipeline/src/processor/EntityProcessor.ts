import crypto from 'crypto';
import { getSupabase, getORM } from '../supabase.js';
import { PipelineTracker } from '../lib/tracker.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import type { Entity, RawEntity } from '../types.js';

/**
 * EntityProcessor - Hash-based upsert to entities table.
 * No BullMQ — plain class called by SyncWorker.
 * Core algorithm: fetch existing by external_id, hash comparison,
 * three-way split (create/update/touch).
 */
export class EntityProcessor {
  async process(
    entities: RawEntity[],
    tenantId: string,
    integrationId: string,
    entityType: string,
    syncId: string,
    tracker: PipelineTracker,
    siteId?: string,
    connectionId?: string
  ): Promise<Entity[]> {
    Logger.info({
      module: 'EntityProcessor',
      context: 'process',
      message: `Processing ${entities.length} ${entityType} entities`,
    });

    const chunks = chunkArray(entities, 100);
    const allProcessed: Entity[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkEntities = await tracker.trackSpan(`processor:chunk:${i}`, async () => {
        return this.processChunk(
          chunks[i],
          tenantId,
          integrationId,
          entityType,
          syncId,
          tracker,
          siteId,
          connectionId
        );
      });
      allProcessed.push(...chunkEntities);

      Logger.trace({
        module: 'EntityProcessor',
        context: 'process',
        message: `Processed chunk ${i + 1}/${chunks.length}`,
      });
    }

    const c = tracker.getCounters();
    Logger.info({
      module: 'EntityProcessor',
      context: 'process',
      message: `Completed: ${c.entities_created} created, ${c.entities_updated} updated, ${c.entities_unchanged} unchanged`,
    });

    return allProcessed;
  }

  /**
   * Delete entities that exist in the DB for this scope but were not returned
   * by the adapter. Mirrors BaseLinker.reconcileRelationships() pattern.
   */
  async pruneStaleEntities(
    processedEntities: Entity[],
    tenantId: string,
    integrationId: string,
    entityType: string,
    tracker: PipelineTracker,
    siteId?: string,
    connectionId?: string
  ): Promise<number> {
    const survivingExternalIds = new Set(processedEntities.map((e) => e.external_id));
    const supabase = getSupabase();

    // Paginated fetch of all entity IDs in this scope (avoid pulling raw_data)
    const staleIds: string[] = [];
    const PAGE_SIZE = 1000;
    let offset = 0;

    while (true) {
      tracker.trackQuery();
      let query = supabase
        .from('entities')
        .select('id, external_id')
        .eq('tenant_id', tenantId)
        .eq('integration_id', integrationId)
        .eq('entity_type', entityType)
        .range(offset, offset + PAGE_SIZE - 1);

      if (siteId) {
        query = query.eq('site_id', siteId);
      }
      if (connectionId) {
        query = query.eq('connection_id', connectionId);
      }

      const { data, error } = await query;
      if (error) throw new Error(`Fetch entities for prune failed: ${error.message}`);
      if (!data || data.length === 0) break;

      for (const row of data) {
        if (!survivingExternalIds.has(row.external_id)) {
          staleIds.push(row.id);
        }
      }

      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    if (staleIds.length === 0) return 0;

    const { error } = await getORM().batchDelete('public', 'entities', staleIds);
    if (error) throw new Error(`Delete stale entities failed: ${error}`);

    tracker.trackEntityDeleted(staleIds.length);
    Logger.info({
      module: 'EntityProcessor',
      context: 'pruneStaleEntities',
      message: `Deleted ${staleIds.length} stale ${entityType} entities`,
    });

    return staleIds.length;
  }

  private async processChunk(
    entities: RawEntity[],
    tenantId: string,
    integrationId: string,
    entityType: string,
    syncId: string,
    tracker: PipelineTracker,
    siteId?: string,
    connectionId?: string
  ): Promise<Entity[]> {
    const supabase = getSupabase();
    const now = new Date().toISOString();
    const result: Entity[] = [];

    // Fetch existing entities by external_id (select full rows for upsert + return)
    const externalIds = entities.map((e) => e.externalId);

    tracker.trackQuery();
    const { data: existing } = await supabase
      .from('entities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('integration_id', integrationId)
      .eq('entity_type', entityType)
      .in('external_id', externalIds);

    const existingMap = new Map((existing || []).map((e) => [e.external_id, e]));

    const toCreate: any[] = [];
    const toUpsert: any[] = [];
    const toTouch: string[] = [];
    const touchedEntities: Entity[] = [];

    for (const entity of entities) {
      const dataHash = calculateHash({
        ...entity.rawData,
        displayName: entity.displayName,
        siteId: entity.siteId,
      });
      const ex = existingMap.get(entity.externalId);
      const displayName = entity.displayName || extractDisplayName(entity.rawData) || null;

      if (!ex) {
        toCreate.push({
          tenant_id: tenantId,
          integration_id: integrationId,
          site_id: entity.siteId || siteId || null,
          connection_id: entity.connectionId || connectionId || null,
          entity_type: entityType,
          external_id: entity.externalId,
          display_name: displayName,
          raw_data: entity.rawData,
          data_hash: dataHash,
          state: 'normal',
          last_seen_at: now,
          sync_id: syncId,
        });
      } else if (ex.data_hash !== dataHash) {
        // Build complete row for upsert (include all required columns)
        toUpsert.push({
          id: ex.id,
          tenant_id: ex.tenant_id,
          integration_id: ex.integration_id,
          site_id: entity.siteId || ex.site_id || null,
          entity_type: ex.entity_type,
          external_id: ex.external_id,
          display_name: displayName,
          raw_data: entity.rawData,
          data_hash: dataHash,
          state: ex.state,
          last_seen_at: now,
          sync_id: syncId,
          created_at: ex.created_at,
          updated_at: now,
        });
      } else {
        toTouch.push(ex.id);
        touchedEntities.push(ex as Entity);
      }
    }

    // CREATE
    if (toCreate.length > 0) {
      tracker.trackUpsert();
      const { data: created, error } = await supabase.from('entities').insert(toCreate).select('*');
      if (error) throw new Error(`Insert entities failed: ${error.message}`);
      tracker.trackEntityCreated(toCreate.length);
      if (created) result.push(...(created as Entity[]));

      Logger.trace({
        module: 'EntityProcessor',
        context: 'processChunk',
        message: `Created ${toCreate.length} entities`,
      });
    }

    // UPDATE (changed data) — chunked upsert on id conflict
    if (toUpsert.length > 0) {
      for (let i = 0; i < toUpsert.length; i += 100) {
        const chunk = toUpsert.slice(i, i + 100);
        tracker.trackUpsert();
        const { data: updated, error } = await supabase
          .from('entities')
          .upsert(chunk, { onConflict: 'id' })
          .select('*');
        if (error) throw new Error(`Upsert entities failed: ${error.message}`);
        if (updated) result.push(...(updated as Entity[]));
      }
      tracker.trackEntityUpdated(toUpsert.length);
      Logger.trace({
        module: 'EntityProcessor',
        context: 'processChunk',
        message: `Updated ${toUpsert.length} entities`,
      });
    }

    // TOUCH (unchanged, just bump last_seen_at)
    if (toTouch.length > 0) {
      tracker.trackUpsert();
      const orm = getORM();
      const { error: touchError } = await orm.batchUpdate('public', 'entities', toTouch, {
        last_seen_at: now,
        sync_id: syncId,
        updated_at: now,
      } as any);
      if (touchError) throw new Error(`Touch entities failed: ${touchError}`);
      tracker.trackEntityUnchanged(toTouch.length);
      result.push(...touchedEntities);

      Logger.trace({
        module: 'EntityProcessor',
        context: 'processChunk',
        message: `Touched ${toTouch.length} unchanged entities`,
      });
    }

    return result;
  }
}

function calculateHash(data: any): string {
  const jsonString = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash('sha256').update(jsonString).digest('hex');
}

function extractDisplayName(rawData: any): string | undefined {
  return (
    rawData?.displayName ||
    rawData?.display_name ||
    rawData?.name ||
    rawData?.Name ||
    rawData?.companyName ||
    rawData?.hostname ||
    rawData?.userPrincipalName
  );
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
