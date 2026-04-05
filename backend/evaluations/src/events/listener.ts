import { QueueEvents, Queue, Job } from "bullmq";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { redis } from "../redis";
import { evaluationsRunQueue } from "../queues";
import { JobOptions } from "@workspace/shared/config/job-options";
import type { DataReadyEvent } from "@workspace/shared/types/jobs/event";
import { CoreQueueNames } from "@workspace/shared/config/queue-names";
import { getTypeMap } from "@workspace/shared/config/integrations/integrations";
import { checkRegistry } from "../checks/registry";

const MODULE = "evaluations";
const CONTEXT = "listener";

// Static reverse map: ingestType → integrationId, built from shared config
const ingestTypeToIntegrationId = new Map(
  [...getTypeMap().values()].map((entry) => [entry.ingestType, entry.integration]),
);

export type Listener = { close(): Promise<void> };

export function startListener(): Listener {
  const queueEvents = new QueueEvents(CoreQueueNames.IngestRealtime, { connection: redis });
  const realtimeQueue = new Queue<DataReadyEvent>(CoreQueueNames.IngestRealtime, {
    connection: redis,
  });

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
  realtimeQueue: Queue<DataReadyEvent, unknown, string, DataReadyEvent, unknown, string>;
}) => {
  if (name !== "data_ready") return;

  try {
    const job = await Job.fromId<DataReadyEvent>(realtimeQueue, jobId);
    if (!job) return;

    const { tenantId, linkId, ingestType } = job.data;

    const integrationId = ingestTypeToIntegrationId.get(ingestType);
    if (!integrationId || !checkRegistry.has(integrationId)) return;

    const dedupKey = `evaluations-run|${tenantId}|${linkId ?? "tenant"}|${integrationId}`;

    await evaluationsRunQueue.add(
      "evaluate",
      { tenantId, linkId, integrationId },
      { ...JobOptions.evaluationsRun, jobId: dedupKey },
    );

    Logger.trace({
      module: MODULE,
      context: CONTEXT,
      message: `enqueued evaluation for tenant ${tenantId} link ${linkId ?? "(tenant)"} integration ${integrationId}`,
      meta: { dedupKey },
    });
  } catch (err) {
    Logger.error({
      module: MODULE,
      context: CONTEXT,
      message: `failed to enqueue: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return;
};
