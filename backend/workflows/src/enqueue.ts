import workflowRunQueue from './queues/workflow-run.js';

export async function enqueueRun(runId: string, priority?: number): Promise<void> {
  await workflowRunQueue.add(
    'workflow-run',
    { run_id: runId, priority },
    { priority }
  );
}
