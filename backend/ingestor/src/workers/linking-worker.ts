import type { Job } from "bullmq";
import type { JobContext, JobResult } from "@workspace/core/types/job";
import { QueueNames } from "@workspace/core/config/queue-names";
import { Logger } from "@workspace/core/lib/utils/logger";
import { BaseWorker, type JobPayload } from "./base-worker";

export class LinkingWorker extends BaseWorker {
  constructor() {
    super(QueueNames.IngestLinking, 5);
    Logger.info({ module: "ingestor", context: "LinkingWorker", message: `listening on ${QueueNames.IngestLinking}` });
  }

  async process(job: Job<JobPayload>, ctx: JobContext): Promise<JobResult> {
    // TODO Phase 3 — implement junction table population per integration
    Logger.trace({ module: "ingestor", context: "LinkingWorker", message: "stub run", meta: { integrationId: ctx.integrationId, ingestType: ctx.ingestType, tenantId: ctx.tenantId } });
    return { success: true, recordCount: 0 };
  }
}
