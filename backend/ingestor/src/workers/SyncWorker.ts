import type { Job } from 'bullmq';
import { getSupabase } from '../supabase.js';
import { queueManager, QueueNames } from '../lib/queue.js';
import { PipelineTracker } from '../lib/tracker.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { JobScheduler } from '../scheduler/JobScheduler.js';
import type { IngestJobData, M365EntityType, IngestContext } from '../types.js';
import type { Microsoft365Adapter } from '../adapters/Microsoft365Adapter.js';
import type { M365Processor } from '../processors/M365Processor.js';
import type { Microsoft365Linker } from '../linkers/Microsoft365Linker.js';
import type { Microsoft365Enricher } from '../enrichers/Microsoft365Enricher.js';

/**
 * SyncWorker — orchestrates one (ingestType) lane: adapter → processor → prune → linker → enricher.
 */
export class SyncWorker {
  private ingestType: M365EntityType;
  private adapter: Microsoft365Adapter;
  private processor: M365Processor;
  private linker: Microsoft365Linker | null;
  private enricher: Microsoft365Enricher | null;
  private started = false;

  constructor(
    ingestType: M365EntityType,
    adapter: Microsoft365Adapter,
    processor: M365Processor,
    linker: Microsoft365Linker | null,
    enricher: Microsoft365Enricher | null = null
  ) {
    this.ingestType = ingestType;
    this.adapter = adapter;
    this.processor = processor;
    this.linker = linker;
    this.enricher = enricher;
  }

  start(): void {
    if (this.started) return;

    const queueName = QueueNames.ingest('microsoft-365', this.ingestType);

    queueManager.createWorker<IngestJobData>(queueName, this.handleJob.bind(this), {
      concurrency: 3,
    });

    this.started = true;
    Logger.info({
      module: 'SyncWorker',
      context: 'start',
      message: `Worker started for microsoft-365:${this.ingestType}`,
    });
  }

  private async handleJob(job: Job<IngestJobData>): Promise<void> {
    const { tenantId, ingestType, ingestId, jobId, linkId, siteId } = job.data;
    const tracker = new PipelineTracker();
    const supabase = getSupabase();

    Logger.info({
      module: 'SyncWorker',
      context: 'handleJob',
      message: `[${jobId}] Starting ingest for microsoft-365:${ingestType}`,
    });

    // Mark running
    await supabase
      .from('ingest_jobs')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', jobId);

    try {
      // 1. ADAPTER: fetch typed raw entities
      const rawEntities = await tracker.trackSpan('stage:adapter', async () => {
        return this.adapter.fetch(job.data, tracker);
      });

      Logger.info({
        module: 'SyncWorker',
        context: 'handleJob',
        message: `[${jobId}] Fetched ${rawEntities.length} raw entities`,
      });

      // Filter to only this ingestType (adapter may return multiple types for some runs)
      const filtered = rawEntities.filter((e) => e.type === ingestType);

      // 2. PROCESSOR: hash-based upsert → typed vendor table
      const processedRows = await tracker.trackSpan('stage:processor', async () => {
        return this.processor.process(filtered, ingestType, tenantId, ingestId, tracker);
      });

      // 3. PRUNE: delete stale rows
      const pruned = await tracker.trackSpan('stage:prune', async () => {
        return this.processor.pruneStale(processedRows, ingestType, tenantId, linkId, tracker);
      });

      if (pruned > 0) {
        Logger.info({
          module: 'SyncWorker',
          context: 'handleJob',
          message: `[${jobId}] Pruned ${pruned} stale ${ingestType} rows`,
        });
      }

      // 4. LINKER + ENRICHER: only for identity (after groups + roles are present)
      if (this.linker || this.enricher) {
        const ctx: IngestContext = {
          tenantId,
          ingestType,
          ingestId,
          jobId,
          linkId,
          siteId,
          processedRows,
        };

        if (this.linker) {
          await tracker.trackSpan('stage:linker', async () => {
            await this.linker!.linkAndReconcile(ctx, tracker);
          });
        }

        if (this.enricher) {
          await tracker.trackSpan('stage:enricher', async () => {
            await this.enricher!.enrichIdentities(ctx, tracker);
          });
        }
      }

      // 5. Mark completed + schedule next
      const completedAt = new Date().toISOString();
      await supabase
        .from('ingest_jobs')
        .update({
          status: 'completed',
          completed_at: completedAt,
          metrics: tracker.toJSON() as any,
          updated_at: completedAt,
        })
        .eq('id', jobId);

      await JobScheduler.scheduleNextIngest(
        tenantId,
        siteId,
        linkId,
        ingestType,
        job.data.tenantId ? 50 : 50 // default priority
      );

      Logger.info({
        module: 'SyncWorker',
        context: 'handleJob',
        message: `[${jobId}] Ingest completed for microsoft-365:${ingestType}`,
      });
    } catch (error) {
      tracker.trackError(error as Error, job.attemptsMade);

      try {
        await supabase
          .from('ingest_jobs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            metrics: tracker.toJSON() as any,
            error: (error as Error).message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);
      } catch (updateError) {
        Logger.error({
          module: 'SyncWorker',
          context: 'handleJob',
          message: `Failed to update ingest_job: ${updateError}`,
        });
      }

      Logger.error({
        module: 'SyncWorker',
        context: 'handleJob',
        message: `[${jobId}] Ingest failed for microsoft-365:${ingestType}: ${(error as Error).message}`,
      });

      throw error;
    }
  }
}
