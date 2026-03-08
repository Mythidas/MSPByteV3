import { ExecutorError } from '../errors.js';
import type { GraphNode, NodeSpec, WorkflowGraph, RunContext } from '../types.js';

export function resolveInputs(
  node: GraphNode,
  nodeSpec: NodeSpec,
  graph: WorkflowGraph,
  ctx: RunContext,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const pin of nodeSpec.pins) {
    if (pin.kind !== 'input') continue;

    const edge = graph.edges.find(
      (e) => e.targetNodeId === node.id && e.targetPinKey === pin.key,
    );

    if (!edge) {
      if (pin.optional) continue;
      throw new ExecutorError(
        `Node ${node.id}: required input pin "${pin.key}" has no connected edge`,
        node.id,
      );
    }

    const sourceOutput = ctx.node_outputs[edge.sourceNodeId];
    if (!sourceOutput) {
      throw new ExecutorError(
        `Node ${node.id}: source node "${edge.sourceNodeId}" has no output in context`,
        node.id,
      );
    }

    if (!(edge.sourcePinKey in sourceOutput)) {
      throw new ExecutorError(
        `Node ${node.id}: source node "${edge.sourceNodeId}" output missing pin "${edge.sourcePinKey}"`,
        node.id,
      );
    }

    resolved[pin.key] = sourceOutput[edge.sourcePinKey];
  }

  // Merge node params as additional inputs
  for (const [key, value] of Object.entries(node.params)) {
    if (!(key in resolved)) {
      resolved[key] = value;
    }
  }

  return resolved;
}
