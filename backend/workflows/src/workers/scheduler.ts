import { Worker } from "bullmq";
import { Cron } from "croner";
import { Logger } from "@workspace/shared/lib/utils/logger";
import { getSupabase } from "../supabase.js";
import { getRedisConnection } from "../redis.js";
import { SCHEDULER_QUEUE } from "../queues/scheduler.js";
import workflowRunQueue from "../queues/workflow-run.js";
import type { RunSeed, SchedulerJobPayload } from "../types.js";
import { isJson } from "@workspace/shared/lib/utils/validators.js";
import { z } from "zod";

const ScopeSchema = z
  .object({
    type: z.enum(["entity_ids", "site_ids", "link_ids", "all"]).default("all"),
    site_ids: z.array(z.string()).default([]),
    link_ids: z.array(z.string()).default([]),
    entity_ids: z.array(z.string()).default([]),
  })
  .catch({ type: "all", site_ids: [], link_ids: [], entity_ids: [] });

const ScheduleSchema = z.object({ cron: z.string() }).catch({ cron: "" });

const processingTasks = new Set<string>();

async function checkDueTasks(): Promise<void> {
  const { data: tasks } = await getSupabase()
    .schema("public")
    .from("tasks")
    .select("*")
    .eq("enabled", true)
    .lte("next_run_at", new Date().toISOString());
  if (!tasks?.length) return;

  const due = tasks.filter((t) => !processingTasks.has(t.id));

  await Promise.all(
    due.map(async (task) => {
      const cron = ScheduleSchema.parse(task.schedule).cron;
      if (!cron) return;

      processingTasks.add(task.id);
      try {
        const { data: workflow } = await getSupabase()
          .schema("public")
          .from("workflows")
          .select("*")
          .eq("id", task.workflow_id)
          .single();
        if (!workflow)
          throw new Error(`workflow ${task.workflow_id} not found`);

        const scope = ScopeSchema.parse(task.scope);
        const seed: RunSeed = {
          scope_type: scope.type,
          site_ids: scope.site_ids,
          link_ids: scope.link_ids,
          entity_ids: scope.entity_ids,
          params: task.param_defaults ?? {},
        };

        const { data: runs, error: insertErr } = await getSupabase()
          .schema("public")
          .from("task_runs")
          .insert([
            {
              tenant_id: task.tenant_id,
              task_id: task.id,
              workflow_id: task.workflow_id,
              workflow_snapshot: workflow.graph,
              triggered_by: "schedule",
              seed: isJson(seed) ? seed : {},
              status: "pending",
            },
          ])
          .select();
        if (insertErr || !runs?.length)
          throw new Error(`failed to insert task_run: ${insertErr}`);

        await workflowRunQueue.add("workflow-run", {
          run_id: runs[0].id,
        });

        const next = new Cron(cron).nextRun();
        await getSupabase()
          .schema("public")
          .from("tasks")
          .update({
            last_run_at: new Date().toISOString(),
            next_run_at: next?.toISOString() ?? null,
          })
          .eq("id", task.id)
          .select()
          .single();
      } catch (err) {
        Logger.error({
          module: "workflows",
          context: "scheduler",
          message: `failed to enqueue task ${task.id}: ${err instanceof Error ? err.message : String(err)}`,
        });
      } finally {
        processingTasks.delete(task.id);
      }
    }),
  );

  Logger.info({
    module: "workflows",
    context: "scheduler",
    message: `enqueued ${due.length} runs`,
  });
}

const schedulerWorker = new Worker<SchedulerJobPayload, unknown, string>(
  SCHEDULER_QUEUE,
  async (job) => {
    Logger.info({
      module: "workflows",
      context: "worker:scheduler",
      message: `tick at ${job.data.tick_at}`,
    });
    await checkDueTasks();
    Logger.info({
      module: "workflows",
      context: "worker:scheduler",
      message: "tick complete",
    });
  },
  {
    connection: getRedisConnection(),
    concurrency: 1,
  },
);

schedulerWorker.on("failed", (job, err) => {
  Logger.error({
    module: "workflows",
    context: "worker:scheduler",
    message: `job failed: ${job?.id}`,
    meta: { err },
  });
});

schedulerWorker.on("error", (err) => {
  Logger.error({
    module: "workflows",
    context: "worker:scheduler",
    message: "worker error",
    meta: { err },
  });
});

export default schedulerWorker;
