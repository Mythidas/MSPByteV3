import crypto from 'crypto';
import { Job } from 'bullmq';
import { getSupabase } from '../supabase.js';
import { QueueNames, queueManager } from '../lib/queue.js';
import { MetricsCollector } from '../lib/metrics.js';
import { Logger } from '../lib/logger.js';
import type { IntegrationId } from '../config.js';
import type { ProcessJobData, RawEntity } from '../types.js';

/**
 * EntityProcessor - Hash-based upsert to entities table via Supabase.
 * Replaces the old Convex-based processor.
 */
export class EntityProcessor {
  private metrics: MetricsCollector;

  constructor() {
    this.metrics = new MetricsCollector();
  }

  start(): void {
    queueManager.createWorker<ProcessJobData>(QueueNames.process, this.processJob.bind(this), {
      concurrency: 10,
    });

    Logger.log({
      module: 'EntityProcessor',
      context: 'start',
      message: 'EntityProcessor worker started',
      level: 'info',
    });
  }

  private async processJob(job: Job<ProcessJobData>): Promise<void> {
    const {
      tenantId,
      integrationId,
      integrationDbId,
      entityType,
      entities,
      siteId,
      syncId,
      syncJobId,
      startedAt,
      metrics: previousMetrics,
    } = job.data;

    if (previousMetrics) {
      this.metrics = MetricsCollector.fromJSON(previousMetrics);
    } else {
      this.metrics.reset();
    }

    this.metrics.startStage('processor');

    Logger.log({
      module: 'EntityProcessor',
      context: 'processJob',
      message: `Processing ${entities.length} ${entityType} entities`,
      level: 'info',
    });

    try {
      const chunks = chunkArray(entities, 100);

      for (let i = 0; i < chunks.length; i++) {
        await this.processChunk(chunks[i], tenantId, integrationId, entityType, syncId, siteId);

        Logger.log({
          module: 'EntityProcessor',
          context: 'processJob',
          message: `Processed chunk ${i + 1}/${chunks.length}`,
          level: 'trace',
        });
      }

      this.metrics.endStage('processor');

      const m = this.metrics.getMetrics();
      Logger.log({
        module: 'EntityProcessor',
        context: 'processJob',
        message: `Completed: ${m.entities_created} created, ${m.entities_updated} updated, ${m.entities_unchanged} unchanged`,
        level: 'info',
      });

      // Trigger linking stage
      await this.triggerLinking(
        integrationId,
        integrationDbId,
        tenantId,
        syncId,
        syncJobId,
        siteId,
        startedAt,
        entityType,
      );
    } catch (error) {
      this.metrics.trackError(error as Error, job.attemptsMade);
      this.metrics.endStage('processor');
      Logger.log({
        module: 'EntityProcessor',
        context: 'processJob',
        message: `Failed: ${error}`,
        level: 'error',
      });
      throw error;
    }
  }

  private async processChunk(
    entities: RawEntity[],
    tenantId: number,
    integrationId: IntegrationId,
    entityType: string,
    syncId: string,
    siteId?: number,
  ): Promise<void> {
    const supabase = getSupabase();
    const now = new Date().toISOString();

    // Fetch existing entities by external_id
    const externalIds = entities.map((e) => e.externalId);

    this.metrics.trackQuery();
    const { data: existing } = await supabase
      .from('entities')
      .select('id, external_id, data_hash')
      .eq('tenant_id', tenantId)
      .eq('integration_id', integrationId)
      .eq('entity_type', entityType)
      .in('external_id', externalIds);

    const existingMap = new Map((existing || []).map((e) => [e.external_id, e]));

    const toCreate: any[] = [];
    const toUpdate: { id: number; data_hash: string; raw_data: any; display_name: string | null; last_seen_at: string; sync_id: string; updated_at: string }[] = [];
    const toTouch: number[] = [];

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
        toUpdate.push({
          id: ex.id,
          data_hash: dataHash,
          raw_data: entity.rawData,
          display_name: displayName,
          last_seen_at: now,
          sync_id: syncId,
          updated_at: now,
        });
      } else {
        toTouch.push(ex.id);
      }
    }

    // CREATE
    if (toCreate.length > 0) {
      this.metrics.trackUpsert();
      const { error } = await supabase.from('entities').insert(toCreate);
      if (error) throw new Error(`Insert entities failed: ${error.message}`);
      this.metrics.trackEntityCreated(toCreate.length);

      Logger.log({
        module: 'EntityProcessor',
        context: 'processChunk',
        message: `Created ${toCreate.length} entities`,
        level: 'trace',
      });
    }

    // UPDATE (changed data)
    for (const row of toUpdate) {
      this.metrics.trackUpsert();
      const { id, ...updates } = row;
      await supabase.from('entities').update(updates).eq('id', id);
    }
    if (toUpdate.length > 0) {
      this.metrics.trackEntityUpdated(toUpdate.length);
      Logger.log({
        module: 'EntityProcessor',
        context: 'processChunk',
        message: `Updated ${toUpdate.length} entities`,
        level: 'trace',
      });
    }

    // TOUCH (unchanged, just bump last_seen_at)
    if (toTouch.length > 0) {
      this.metrics.trackUpsert();
      await supabase
        .from('entities')
        .update({ last_seen_at: now, sync_id: syncId, updated_at: now })
        .in('id', toTouch);
      this.metrics.trackEntityUnchanged(toTouch.length);

      Logger.log({
        module: 'EntityProcessor',
        context: 'processChunk',
        message: `Touched ${toTouch.length} unchanged entities`,
        level: 'trace',
      });
    }
  }

  private async triggerLinking(
    integrationId: IntegrationId,
    integrationDbId: string,
    tenantId: number,
    syncId: string,
    syncJobId: number,
    siteId?: number,
    startedAt?: number,
    entityType?: string,
  ): Promise<void> {
    const queueName = QueueNames.link(integrationId);

    await queueManager.addJob(
      queueName,
      {
        tenantId,
        integrationId,
        integrationDbId,
        syncId,
        syncJobId,
        siteId,
        entityType,
        startedAt,
        metrics: this.metrics.toJSON(),
      },
      { priority: 5 },
    );

    Logger.log({
      module: 'EntityProcessor',
      context: 'triggerLinking',
      message: `Triggered linking for ${integrationId}`,
      level: 'info',
    });
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
