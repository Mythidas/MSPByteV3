import { QueueEvents, Queue, Job } from "bullmq";
import { QueueNames } from "@workspace/core/config/queue-names";
import { JobOptions } from "@workspace/core/config/job-options";
import { Logger } from "@workspace/shared/lib/utils/logger";
import type { DataReadyEvent } from "@workspace/core/types/event";
import { redis } from "../redis";
import { complianceEvalQueue } from "../queues";

const MODULE = "compliance";
const CONTEXT = "listener";

export type Listener = { close(): Promise<void> };

export function startListener(): Listener {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connection = redis as any;

  const queueEvents = new QueueEvents(QueueNames.IngestRealtime, {
    connection,
  });
  const realtimeQueue = new Queue(QueueNames.IngestRealtime, { connection });

  queueEvents.on("added", async ({ jobId, name }) => {
    if (name !== "data_ready") return;

    try {
      const job = await Job.fromId(realtimeQueue, jobId);
      if (!job) return;

      const event = job.data as DataReadyEvent;
      const { tenantId, linkId } = event;

      const dedupKey = `compliance-eval|${tenantId}|${linkId ?? "tenant"}`;

      await complianceEvalQueue.add(
        "eval",
        { tenantId, linkId },
        { ...JobOptions.complianceEval, jobId: dedupKey },
      );

      Logger.info({
        module: MODULE,
        context: CONTEXT,
        message: `enqueued compliance:eval for tenant ${tenantId} link ${linkId ?? "(tenant)"}`,
        meta: { dedupKey },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Logger.error({
        module: MODULE,
        context: CONTEXT,
        message: `failed to enqueue: ${message}`,
      });
    }
  });

  Logger.info({
    module: MODULE,
    context: CONTEXT,
    message: `listening on ${QueueNames.IngestRealtime}`,
  });

  return {
    close: async () => {
      await realtimeQueue.close();
      await queueEvents.close();
    },
  };
}
