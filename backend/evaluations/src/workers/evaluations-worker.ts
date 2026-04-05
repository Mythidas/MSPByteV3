import { Worker, type Job } from "bullmq";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { evaluateLink } from "../evaluator";
import { redis } from "../redis";
import { CoreQueueNames } from "@workspace/shared/config/queue-names";

const MODULE = "evaluations";
const CONTEXT = "evaluations-worker";

export type EvaluationsJobPayload = {
  tenantId: string;
  linkId?: string;
  integrationId: string;
};

export class EvaluationsWorker {
  private worker: Worker<EvaluationsJobPayload, unknown, string>;

  constructor() {
    this.worker = new Worker<EvaluationsJobPayload, unknown, string>(
      CoreQueueNames.EvaluationsRun,
      (job) => this.process(job),
      {
        connection: redis,
        concurrency: 5,
      },
    );

    this.worker.on("failed", (job, err) => {
      Logger.error({
        module: MODULE,
        context: CONTEXT,
        message: `job ${job?.id} failed: ${err.message}`,
      });
    });

    this.worker.on("error", (err) => {
      Logger.error({ module: MODULE, context: CONTEXT, message: err.message });
    });

    Logger.info({
      module: MODULE,
      context: CONTEXT,
      message: `listening on ${CoreQueueNames.EvaluationsRun}`,
    });
  }

  private async process(job: Job<EvaluationsJobPayload>): Promise<void> {
    const { tenantId, linkId, integrationId } = job.data;

    if (!linkId) {
      Logger.warn({
        module: MODULE,
        context: CONTEXT,
        message: `job ${job.id} has no linkId — tenant-level evaluation not yet implemented`,
        meta: { tenantId, integrationId },
      });
      return;
    }

    await evaluateLink(tenantId, linkId, integrationId);
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}
