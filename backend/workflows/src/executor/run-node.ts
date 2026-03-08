import { Logger } from '@workspace/shared/lib/utils/logger';
import { ExecutorError } from '../errors.js';
import { getSupabase } from '../supabase.js';
import { resolveInputs } from './resolve.js';
import type { Json } from '@workspace/shared/types/schema';
import type { GraphNode, NodeSpec, WorkflowGraph, RunContext, NodeRunResult } from '../types.js';

export async function runNode(
  node: GraphNode,
  nodeSpec: NodeSpec,
  graph: WorkflowGraph,
  ctx: RunContext,
): Promise<NodeRunResult> {
  const supabase = getSupabase();
  const now = new Date();

  // 1. Insert pending row
  const { data: insertedRow, error: insertError } = await supabase
    .from('task_run_nodes')
    .insert({
      run_id: ctx.run_id,
      tenant_id: ctx.tenant_id,
      node_id: node.id,
      node_ref: node.ref,
      node_label: nodeSpec.label,
      category: node.category,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertError) {
    throw new ExecutorError(`Failed to insert task_run_nodes row: ${insertError.message}`, node.id);
  }

  const rowId: string = insertedRow.id;

  // 2. Update to running
  await supabase.from('task_run_nodes').update({
    status: 'running',
    started_at: now.toISOString(),
  }).eq('id', rowId);

  // 3. Param shortcut (executor pre-resolves params; no execute needed)
  if (node.category === 'param') {
    await supabase.from('task_run_nodes').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      duration_ms: 0,
      metrics: {},
    }).eq('id', rowId);

    return { nodeId: node.id, status: 'completed', category: node.category };
  }

  try {
    // 4. Resolve inputs
    const resolvedInputs = resolveInputs(node, nodeSpec, graph, ctx);

    // 5. Execute
    Logger.info({
      module: 'workflows',
      context: 'executor:run-node',
      message: `executing node ${node.id} (${node.ref})`,
    });
    const rawOutput = await nodeSpec.execute(resolvedInputs, ctx);

    // 6. Extract _metrics, strip from output
    const metrics = (rawOutput._metrics ?? {}) as Json;
    const output: Record<string, unknown> = { ...rawOutput };
    delete output._metrics;

    // 7. Store output in context
    ctx.node_outputs[node.id] = output;

    // 8. Resolve affected entities
    let affectedEntityIds: string[] = [];
    if (nodeSpec.affectedEntitiesPin) {
      const entities = output[nodeSpec.affectedEntitiesPin];
      if (Array.isArray(entities)) {
        affectedEntityIds = entities
          .map((e: unknown) => (e && typeof e === 'object' && 'id' in e ? (e as any).id : null))
          .filter(Boolean);
      }
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - now.getTime();

    // 9. Update row to completed
    await supabase.from('task_run_nodes').update({
      status: 'completed',
      completed_at: completedAt.toISOString(),
      duration_ms: durationMs,
      metrics,
      affected_entity_ids: affectedEntityIds,
    }).eq('id', rowId);

    return { nodeId: node.id, status: 'completed', category: node.category };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - now.getTime();

    await supabase.from('task_run_nodes').update({
      status: 'failed',
      completed_at: completedAt.toISOString(),
      duration_ms: durationMs,
      error: errorMessage,
    }).eq('id', rowId);

    throw new ExecutorError(
      `Node ${node.id} (${node.ref}) failed: ${errorMessage}`,
      node.id,
      err,
    );
  }
}
