import crypto from 'crypto';
import { getSupabase } from '../supabase.js';
import { MetricsCollector } from '../lib/metrics.js';
import { Logger } from '../lib/logger.js';
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
    metrics: MetricsCollector,
    siteId?: string
  ): Promise<Entity[]> {
    Logger.log({
      module: 'EntityProcessor',
      context: 'process',
      message: `Processing ${entities.length} ${entityType} entities`,
      level: 'info',
    });

    const chunks = chunkArray(entities, 100);
    const allProcessed: Entity[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkEntities = await this.processChunk(
        chunks[i],
        tenantId,
        integrationId,
        entityType,
        syncId,
        metrics,
        siteId
      );
      allProcessed.push(...chunkEntities);

      Logger.log({
        module: 'EntityProcessor',
        context: 'process',
        message: `Processed chunk ${i + 1}/${chunks.length}`,
        level: 'trace',
      });
    }

    const m = metrics.getMetrics();
    Logger.log({
      module: 'EntityProcessor',
      context: 'process',
      message: `Completed: ${m.entities_created} created, ${m.entities_updated} updated, ${m.entities_unchanged} unchanged`,
      level: 'info',
    });

    return allProcessed;
  }

  private async processChunk(
    entities: RawEntity[],
    tenantId: string,
    integrationId: string,
    entityType: string,
    syncId: string,
    metrics: MetricsCollector,
    siteId?: string
  ): Promise<Entity[]> {
    const supabase = getSupabase();
    const now = new Date().toISOString();
    const result: Entity[] = [];

    // Fetch existing entities by external_id (select full rows for upsert + return)
    const externalIds = entities.map((e) => e.externalId);

    metrics.trackQuery();
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
      const dataHash = calculateHash(entity.rawData);
      const ex = existingMap.get(entity.externalId);
      const displayName = entity.displayName || extractDisplayName(entity.rawData) || null;

      if (!ex) {
        toCreate.push({
          tenant_id: tenantId,
          integration_id: integrationId,
          site_id: entity.siteId || siteId || null,
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
          site_id: ex.site_id,
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
      metrics.trackUpsert();
      const { data: created, error } = await supabase
        .from('entities')
        .insert(toCreate)
        .select('*');
      if (error) throw new Error(`Insert entities failed: ${error.message}`);
      metrics.trackEntityCreated(toCreate.length);
      if (created) result.push(...(created as Entity[]));

      Logger.log({
        module: 'EntityProcessor',
        context: 'processChunk',
        message: `Created ${toCreate.length} entities`,
        level: 'trace',
      });
    }

    // UPDATE (changed data) — chunked upsert on id conflict
    if (toUpsert.length > 0) {
      for (let i = 0; i < toUpsert.length; i += 100) {
        const chunk = toUpsert.slice(i, i + 100);
        metrics.trackUpsert();
        const { data: updated, error } = await supabase
          .from('entities')
          .upsert(chunk, { onConflict: 'id' })
          .select('*');
        if (error) throw new Error(`Upsert entities failed: ${error.message}`);
        if (updated) result.push(...(updated as Entity[]));
      }
      metrics.trackEntityUpdated(toUpsert.length);
      Logger.log({
        module: 'EntityProcessor',
        context: 'processChunk',
        message: `Updated ${toUpsert.length} entities`,
        level: 'trace',
      });
    }

    // TOUCH (unchanged, just bump last_seen_at)
    if (toTouch.length > 0) {
      metrics.trackUpsert();
      await supabase
        .from('entities')
        .update({ last_seen_at: now, sync_id: syncId, updated_at: now })
        .in('id', toTouch);
      metrics.trackEntityUnchanged(toTouch.length);
      result.push(...touchedEntities);

      Logger.log({
        module: 'EntityProcessor',
        context: 'processChunk',
        message: `Touched ${toTouch.length} unchanged entities`,
        level: 'trace',
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
