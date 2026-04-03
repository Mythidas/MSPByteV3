import { Worker, type Job } from "bullmq";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { evaluateLink, evaluateTenant } from "../evaluator";
import { redis } from "../redis";
import { CoreQueueNames } from "@workspace/shared/config/queue-names";

const MODULE = "compliance";
const CONTEXT = "compliance-worker";

export type ComplianceJobPayload = { tenantId: string; linkId?: string };

export class ComplianceWorker {
  private worker: Worker<ComplianceJobPayload, unknown, string>;

  constructor() {
    this.worker = new Worker<ComplianceJobPayload, unknown, string>(
      CoreQueueNames.ComplianceEval,
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
      message: `listening on ${CoreQueueNames.ComplianceEval}`,
    });
  }

  private async process(job: Job<ComplianceJobPayload>): Promise<void> {
    const { tenantId, linkId } = job.data;
    try {
      if (linkId) {
        await evaluateLink(tenantId, linkId);
      } else {
        await evaluateTenant(tenantId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Logger.error({
        module: MODULE,
        context: CONTEXT,
        message: `job ${job.id} error: ${message}`,
      });
    }
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}
