import { getSupabase } from '../supabase.js';
import { Logger } from '../lib/logger.js';
import { MetricsCollector } from '../lib/metrics.js';
import type { IntegrationId } from '../config.js';
import type { AdapterFetchResult, RawEntity, SyncJobData } from '../types.js';

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
  async fetchAll(jobData: SyncJobData, metrics: MetricsCollector): Promise<RawEntity[]> {
    const allEntities: RawEntity[] = [];
    let cursor: string | undefined;
    let batch = 0;

    do {
      metrics.trackApiCall();
      const result = await this.fetchData(jobData, metrics, cursor, batch++);
      allEntities.push(...result.entities);

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
    metrics: MetricsCollector,
    cursor?: string,
    batchNumber?: number,
  ): Promise<AdapterFetchResult>;

  /**
   * Load integration credentials/config from the integrations table.
   */
  protected async getIntegrationConfig(
    integrationDbId: string,
    metrics: MetricsCollector,
  ): Promise<any> {
    const supabase = getSupabase();
    metrics.trackQuery();

    const { data, error } = await supabase
      .from('integrations')
      .select('config')
      .eq('id', integrationDbId)
      .single();

    if (error || !data) {
      throw new Error(`Integration config not found: ${integrationDbId}`);
    }

    return data.config;
  }
}
