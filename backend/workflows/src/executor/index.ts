import { Logger } from '@workspace/shared/lib/utils/logger';
import { ExecutorError } from '../errors.js';
import { getNode } from '../registry/registry.js';
import { getSupabase } from '../supabase.js';
import type { GraphNode, NodeRunResult, RunContext, WorkflowGraph } from '../types.js';
import { finalizeRun } from './finalize.js';
import { runNode } from './run-node.js';
import { topologicalSort } from './sort.js';
import { validateForExecution } from './validate.js';

function getDownstreamNodeIds(nodeId: string, graph: WorkflowGraph): string[] {
  const downstream: string[] = [];
  const queue = [nodeId];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of graph.edges) {
      if (edge.sourceNodeId === current && !seen.has(edge.targetNodeId)) {
        seen.add(edge.targetNodeId);
        downstream.push(edge.targetNodeId);
        queue.push(edge.targetNodeId);
      }
    }
  }

  return downstream;
}

export async function executeRun(runId: string): Promise<void> {
  const supabase = getSupabase();
  const startedAt = new Date();

  // 1. Fetch task_run row
  const { data: run, error: fetchError } = await supabase
    .from('task_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (fetchError || !run) {
    throw new ExecutorError(`task_run not found: ${runId}`, undefined, fetchError);
  }

  // 2. Mark running
  await supabase
    .from('task_runs')
    .update({
      status: 'running',
      started_at: startedAt.toISOString(),
    })
    .eq('id', runId);

  // 3. Parse workflow_snapshot
  const graph = run.workflow_snapshot as any as WorkflowGraph;

  // 4. Validate
  const validation = validateForExecution(graph);
  if (!validation.valid) {
    Logger.error({
      module: 'workflows',
      context: 'executor',
      message: `run ${runId} failed validation`,
      meta: { errors: validation.errors },
    });
    await supabase
      .from('task_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        duration_ms: new Date().getTime() - startedAt.getTime(),
        error: validation.errors.join('; '),
      })
      .eq('id', runId);
    return;
  }

  // 5. Build RunContext
  const ctx: RunContext = {
    run_id: runId,
    tenant_id: run.tenant_id,
    triggered_by: run.triggered_by,
    triggered_by_user: run.triggered_by_user ?? null,
    seed: (run.seed as Record<string, unknown>) ?? {},
    node_outputs: {},
  };

  // 6. Pre-resolve param nodes
  const seed = ctx.seed as { params?: Record<string, unknown> };
  for (const node of graph.nodes) {
    if (node.category === 'param') {
      const paramKey = node.params.paramKey as string | undefined;
      ctx.node_outputs[node.id] = {
        value: paramKey != null ? (seed.params?.[paramKey] ?? null) : null,
      };
    }
  }

  // 7. Topological sort
  const orderedIds = topologicalSort(graph);

  // 8. Execute nodes in order
  const results: NodeRunResult[] = [];
  const skippedIds = new Set<string>();

  for (const nodeId of orderedIds) {
    const node = graph.nodes.find((n) => n.id === nodeId) as GraphNode;

    // Param nodes are pre-resolved — no DB row
    if (node.category === 'param') continue;

    // Skipped node
    if (skippedIds.has(nodeId)) {
      const nodeSpec = getNode(node.ref);
      await supabase.from('task_run_nodes').insert({
        tenant_id: ctx.tenant_id,
        run_id: runId,
        node_id: nodeId,
        node_ref: node.ref,
        node_label: nodeSpec.label,
        status: 'skipped',
        category: node.category,
      });
      results.push({ nodeId, status: 'skipped', category: node.category });
      continue;
    }

    try {
      const nodeSpec = getNode(node.ref);
      const result = await runNode(node, nodeSpec, graph, ctx);
      results.push(result);

      Logger.info({
        module: 'workflows',
        context: 'executor',
        message: `node ${nodeId} (${node.ref}) completed`,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      results.push({ nodeId, status: 'failed', error: errorMessage, category: node.category });

      Logger.error({
        module: 'workflows',
        context: 'executor',
        message: `node ${nodeId} (${node.ref}) failed`,
        meta: { err },
      });

      // BFS downstream skips only for source/transform failures
      if (node.category === 'source' || node.category === 'transform') {
        for (const downstreamId of getDownstreamNodeIds(nodeId, graph)) {
          skippedIds.add(downstreamId);
        }
      }
    }
  }

  // 9. Finalize
  await finalizeRun(runId, results, startedAt);

  Logger.info({
    module: 'workflows',
    context: 'executor',
    message: `run ${runId} finalized`,
    meta: { results: results.length },
  });
}
