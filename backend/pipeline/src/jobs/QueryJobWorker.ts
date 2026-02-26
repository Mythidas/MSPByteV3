import type { Job } from 'bullmq';
import { queueManager, QueueNames } from '../lib/queue.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import type { QueryJobData } from './types.js';
import type { QueryJobRunner } from './QueryJobRunner.js';

/**
 * QueryJobWorker — BullMQ worker for query.{integrationId} queue.
 * Concurrency 1 per integration. Delegates entirely to QueryJobRunner.
 * Replaces AnalysisWorker.
 */
export class QueryJobWorker {
  private integrationId: string;
  private runner: QueryJobRunner;
  private started = false;

  constructor(integrationId: string, runner: QueryJobRunner) {
    this.integrationId = integrationId;
    this.runner = runner;
  }

  start(): void {
    if (this.started) return;

    const queueName = QueueNames.query(this.integrationId);
    queueManager.createWorker<QueryJobData>(queueName, this.handleJob.bind(this), {
      concurrency: 1,
    });

    this.started = true;
    Logger.info({
      module: 'QueryJobWorker',
      context: 'start',
      message: `Query job worker started for ${this.integrationId}`,
    });
  }

  private async handleJob(job: Job<QueryJobData>): Promise<void> {
    const { queryJobId, tenantId, connectionId, siteId } = job.data;

    Logger.info({
      module: 'QueryJobWorker',
      context: 'handleJob',
      message: `Running query job ${queryJobId} (tenant ${tenantId})`,
    });

    try {
      await this.runner.run(queryJobId, tenantId, connectionId, siteId);
    } catch (error) {
      Logger.error({
        module: 'QueryJobWorker',
        context: 'handleJob',
        message: `Query job ${queryJobId} failed: ${(error as Error).message}`,
      });
      throw error;
    }
  }
}
