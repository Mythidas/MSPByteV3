import { JobOptions } from "@workspace/core/config/job-options";
import { IngestTrigger } from "@workspace/core/types/ingest";
import { Logger } from "@workspace/core/lib/utils/logger";
import { supabase } from "../lib/supabase";
import {
  ingestRealtimeQueue,
  ingestScheduledQueue,
  ingestBulkQueue,
} from "../queues";
import type { PlannerEntry } from "./enumerate";
import type { JobPayload } from "../workers/base-worker";
import type { Queue } from "bullmq";

function selectQueue(priority: number): Queue {
  if (priority <= 3) return ingestRealtimeQueue;
  if (priority <= 6) return ingestScheduledQueue;
  return ingestBulkQueue;
}

export async function enqueue(entries: PlannerEntry[]): Promise<number> {
  let count = 0;

  for (const entry of entries) {
    const scopePart = entry.siteId ?? entry.linkId ?? "tenant";
    const bullmqJobId = `${entry.tenantId}|${entry.integrationId}|${entry.ingestType}|${scopePart}`;

    // Insert into ingest_jobs and get back the DB UUID
    const { data: inserted, error } = await supabase
      .from("ingest_jobs")
      .insert({
        ingest_id: bullmqJobId,
        bullmq_job_id: bullmqJobId,
        tenant_id: entry.tenantId,
        integration_id: entry.integrationId,
        ingest_type: entry.ingestType,
        site_id: entry.siteId ?? null,
        link_id: entry.linkId ?? null,
        status: "pending",
        trigger: IngestTrigger.Scheduled,
        priority: entry.priority,
      })
      .select("id")
      .single();

    if (error) {
      Logger.error({ module: "ingestor", context: "planner:enqueue", message: `failed to insert job ${bullmqJobId}: ${error.message}` });
      continue;
    }

    const jobPayload: JobPayload = {
      tenantId: entry.tenantId,
      integrationId: entry.integrationId,
      ingestType: entry.ingestType,
      siteId: entry.siteId,
      linkId: entry.linkId,
      trigger: IngestTrigger.Scheduled,
      jobId: inserted.id,
    };

    const queue = selectQueue(entry.priority);

    try {
      await queue.add(entry.ingestType, jobPayload, {
        ...JobOptions.ingest,
        jobId: bullmqJobId,
      });
      count++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Logger.error({ module: "ingestor", context: "planner:enqueue", message: `failed to add BullMQ job ${bullmqJobId}: ${message}` });
    }
  }

  return count;
}
