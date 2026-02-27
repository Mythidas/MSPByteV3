import type { Job } from 'bullmq';
import { queueManager } from '../lib/queue.js';
import { getSupabase } from '../supabase.js';
import { Logger } from '@workspace/shared/lib/utils/logger';
import type { TaskPipelineEngine } from './TaskPipelineEngine.js';
import type { TaskJobData, TaskRow, WorkflowRow } from './types.js';

const QUEUE_NAME = 'tasks';

/**
 * TaskWorker
 *
 * BullMQ worker for the 'tasks' queue.
 * Loads the task + workflow rows and delegates to TaskPipelineEngine.
 * On final failure (all attempts exhausted): marks history as 'dead' and
 * disables the task to prevent infinite retry loops.
 */
export class TaskWorker {
  private engine: TaskPipelineEngine;
  private started = false;

  constructor(engine: TaskPipelineEngine) {
    this.engine = engine;
  }

  start(): void {
    if (this.started) return;

    queueManager.createWorker<TaskJobData>(QUEUE_NAME, this.handleJob.bind(this), {
      concurrency: 5,
    });

    this.started = true;
    Logger.info({
      module: 'TaskWorker',
      context: 'start',
      message: 'Task worker started',
    });
  }

  private async handleJob(job: Job<TaskJobData>): Promise<void> {
    const { taskId, tenantId, historyId } = job.data;

    Logger.info({
      module: 'TaskWorker',
      context: 'handleJob',
      message: `Processing task ${taskId} (history: ${historyId}, attempt ${job.attemptsMade + 1})`,
    });

    const supabase = getSupabase();

    try {
      // Load task row
      const { data: taskData, error: taskErr } = await (supabase.from('tasks' as any) as any)
        .select('*')
        .eq('id', taskId)
        .single();

      if (taskErr || !taskData) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const task = taskData as TaskRow;

      // Load workflow row
      const { data: workflowData, error: workflowErr } = await (
        supabase.from('workflows' as any) as any
      )
        .select('*')
        .eq('id', task.workflow_id)
        .single();

      if (workflowErr || !workflowData) {
        throw new Error(`Workflow not found: ${task.workflow_id}`);
      }

      const workflow = workflowData as WorkflowRow;

      // Execute the pipeline
      await this.engine.execute(task, workflow, historyId);
    } catch (error) {
      const isLastAttempt = this.isLastAttempt(job);

      if (isLastAttempt) {
        Logger.error({
          module: 'TaskWorker',
          context: 'handleJob',
          message: `Task ${taskId} exhausted all retry attempts — marking as dead`,
        });

        // Mark history as dead
        await (supabase.from('task_history' as any) as any)
          .update({
            status: 'dead',
            completed_at: new Date().toISOString(),
            error: (error as Error).message,
          })
          .eq('id', historyId);

        // Disable the task to stop further scheduling
        await (supabase.from('tasks' as any) as any)
          .update({ enabled: false, updated_at: new Date().toISOString() })
          .eq('id', taskId);
      }

      throw error; // re-throw so BullMQ handles retry logic
    }
  }

  /**
   * Detect whether this is the final attempt for the job.
   * BullMQ uses 0-based attemptsMade; opts.attempts is the total allowed.
   */
  private isLastAttempt(job: Job<TaskJobData>): boolean {
    const maxAttempts = job.opts?.attempts ?? 1;
    return job.attemptsMade >= maxAttempts - 1;
  }
}
