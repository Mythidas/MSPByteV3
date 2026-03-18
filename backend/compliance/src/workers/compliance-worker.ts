import { Worker, type Job } from "bullmq";
import { QueueNames } from "@workspace/core/config/queue-names";
import { Logger } from "@workspace/core/lib/utils/logger";
import { evaluateLink, evaluateTenant } from "../evaluator";
import { redis } from "../redis";

const MODULE = "compliance";
const CONTEXT = "compliance-worker";

type ComplianceJobPayload = { tenantId: string; linkId?: string };

export class ComplianceWorker {
  private worker: Worker;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.worker = new Worker(QueueNames.ComplianceEval, (job) => this.process(job), {
      connection: redis as any,
      concurrency: 5,
    });

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

    Logger.info({ module: MODULE, context: CONTEXT, message: `listening on ${QueueNames.ComplianceEval}` });
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
      Logger.error({ module: MODULE, context: CONTEXT, message: `job ${job.id} error: ${message}` });
    }
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}
