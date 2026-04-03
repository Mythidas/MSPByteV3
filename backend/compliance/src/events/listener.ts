import { QueueEvents, Queue, Job } from "bullmq";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { redis } from "../redis";
import { complianceEvalQueue } from "../queues";
import { JobOptions } from "@workspace/shared/config/job-options";
import { DataReadyEvent } from "@workspace/shared/types/jobs/event";
import { CoreQueueNames } from "@workspace/shared/config/queue-names";

const MODULE = "compliance";
const CONTEXT = "listener";

export type Listener = { close(): Promise<void> };

export function startListener(): Listener {
  const connection = redis;

  const queueEvents = new QueueEvents(CoreQueueNames.IngestRealtime, {
    connection,
  });
  const realtimeQueue = new Queue<DataReadyEvent>(
    CoreQueueNames.IngestRealtime,
    {
      connection,
    },
  );

  queueEvents.on("added", (e) => {
    void queueEventCallback({ ...e, realtimeQueue });
    return;
  });

  Logger.info({
    module: MODULE,
    context: CONTEXT,
    message: `listening on ${CoreQueueNames.IngestRealtime}`,
  });

  return {
    close: async () => {
      await realtimeQueue.close();
      await queueEvents.close();
    },
  };
}

const queueEventCallback = async ({
  jobId,
  name,
  realtimeQueue,
}: {
  jobId: string;
  name: string;
  realtimeQueue: Queue<
    DataReadyEvent,
    unknown,
    string,
    DataReadyEvent,
    unknown,
    string
  >;
}) => {
  if (name !== "data_ready") return;

  try {
    const job = await Job.fromId<DataReadyEvent>(realtimeQueue, jobId);
    if (!job) return;

    const event = job.data;
    const { tenantId, linkId } = event;

    const dedupKey = `compliance-eval|${tenantId}|${linkId ?? "tenant"}`;

    await complianceEvalQueue.add(
      "eval",
      { tenantId, linkId },
      { ...JobOptions.complianceEval, jobId: dedupKey },
    );

    Logger.trace({
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

  return;
};
