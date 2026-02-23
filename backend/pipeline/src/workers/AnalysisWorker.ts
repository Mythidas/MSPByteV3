import type { Job } from 'bullmq';
import { queueManager, QueueNames } from '../lib/queue.js';
import { PipelineTracker } from '../lib/tracker.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import { createSyncContext } from '../context.js';
import type { AnalysisJobData } from '../types.js';
import type { AnalysisOrchestrator } from '../analyzers/AnalysisOrchestrator.js';
import { IntegrationId } from '@workspace/shared/config/integrations.js';

/**
 * AnalysisWorker - Dedicated worker that runs analysis ONCE after all
 * entity types for an integration have finished syncing.
 * Concurrency 1 per integration to avoid duplicate analysis runs.
 */
export class AnalysisWorker {
  private integrationId: IntegrationId;
  private orchestrator: AnalysisOrchestrator;
  private started = false;

  constructor(integrationId: IntegrationId, orchestrator: AnalysisOrchestrator) {
    this.integrationId = integrationId;
    this.orchestrator = orchestrator;
  }

  start(): void {
    if (this.started) return;

    const queueName = QueueNames.analysis(this.integrationId);
    queueManager.createWorker<AnalysisJobData>(queueName, this.handleJob.bind(this), {
      concurrency: 1,
    });

    this.started = true;
    Logger.info({
      module: 'AnalysisWorker',
      context: 'start',
      message: `Analysis worker started for ${this.integrationId}`,
    });
  }

  private async handleJob(job: Job<AnalysisJobData>): Promise<void> {
    const { tenantId, integrationId, integrationDbId, syncId } = job.data;
    const tracker = new PipelineTracker();

    Logger.info({
      module: 'AnalysisWorker',
      context: 'handleJob',
      message: `Starting analysis for ${integrationId} (tenant ${tenantId})`,
    });

    // Create a fresh SyncContext for analysis (no processedEntities needed)
    const ctx = createSyncContext({
      tenantId,
      integrationId,
      integrationDbId,
      entityType: 'analysis',
      syncId,
    });

    try {
      await tracker.trackSpan('stage:analysis', async () => {
        return this.orchestrator.analyze(ctx, tracker);
      });

      Logger.info({
        module: 'AnalysisWorker',
        context: 'handleJob',
        message: `Analysis completed for ${integrationId}`,
      });
    } catch (error) {
      Logger.error({
        module: 'AnalysisWorker',
        context: 'handleJob',
        message: `Analysis failed for ${integrationId}: ${(error as Error).message}`,
      });
      throw error;
    }
  }
}
