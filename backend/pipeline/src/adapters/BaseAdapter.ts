import { getSupabase } from '../supabase.js';
import { Logger } from '../lib/logger.js';
import { PipelineTracker } from '../lib/tracker.js';
import type { IntegrationId } from '../config.js';
import type { AdapterFetchResult, RawEntity, SyncJobData } from '../types.js';
import Encryption from '@workspace/shared/lib/utils/encryption.js';

/**
 * BaseAdapter - Abstract base class for all integration adapters.
 * No BullMQ — just a pure fetch service called by SyncWorker.
 * Handles pagination internally via fetchAll().
 */
export abstract class BaseAdapter {
  readonly integrationId: IntegrationId;

  constructor(integrationId: IntegrationId) {
    this.integrationId = integrationId;
  }

  /**
   * Loops pagination internally, returns all entities across all pages.
   */
  async fetchAll(jobData: SyncJobData, tracker: PipelineTracker): Promise<RawEntity[]> {
    const allEntities: RawEntity[] = [];
    let cursor: string | undefined;
    let batch = 0;

    do {
      tracker.trackApiCall();
      const result = await tracker.trackSpan(`adapter:fetch_page:${batch}`, async () => {
        return this.fetchData(jobData, tracker, cursor, batch);
      });
      allEntities.push(...result.entities);
      batch++;

      Logger.log({
        module: 'BaseAdapter',
        context: 'fetchAll',
        message: `Batch ${batch}: fetched ${result.entities.length} ${jobData.entityType} entities`,
        level: 'trace',
      });

      cursor = result.pagination?.hasMore ? result.pagination.cursor : undefined;
    } while (cursor);

    Logger.log({
      module: 'BaseAdapter',
      context: 'fetchAll',
      message: `Total: ${allEntities.length} ${jobData.entityType} entities fetched`,
      level: 'info',
    });

    return allEntities;
  }

  /**
   * Concrete adapters implement this to fetch a single page of data.
   */
  protected abstract fetchData(
    jobData: SyncJobData,
    tracker: PipelineTracker,
    cursor?: string,
    batchNumber?: number
  ): Promise<AdapterFetchResult>;

  /**
   * Load integration credentials/config from the integrations table.
   */
  protected async getIntegrationConfig(
    integrationDbId: string,
    decryptKeys: string[],
    tracker: PipelineTracker
  ): Promise<any> {
    return tracker.trackSpan('adapter:get_config', async () => {
      const supabase = getSupabase();
      tracker.trackQuery();

      const { data, error } = await supabase
        .from('integrations')
        .select('config')
        .eq('id', integrationDbId)
        .single();

      if (error || !data || !data.config) {
        throw new Error(`Integration config not found: ${integrationDbId}`);
      }

      for (const key of decryptKeys) {
        (data.config as any)[key] = await Encryption.decrypt(
          (data.config as any)[key],
          process.env.ENCRYPTION_KEY!
        );
      }

      return data.config;
    });
  }
}
