import { getNode } from '../registry/registry.js';
import type { WorkflowGraph, ValidationResult } from '../types.js';

export function validateForExecution(graph: WorkflowGraph): ValidationResult {
  const errors: string[] = [];
  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  // 1. Node refs exist in registry
  for (const node of graph.nodes) {
    try {
      getNode(node.ref);
    } catch {
      errors.push(`Node ${node.id}: unknown ref "${node.ref}"`);
    }
  }

  for (const edge of graph.edges) {
    // 2. Edge node refs exist in graph
    if (!nodeIds.has(edge.sourceNodeId)) {
      errors.push(`Edge ${edge.id}: unknown sourceNodeId "${edge.sourceNodeId}"`);
    }
    if (!nodeIds.has(edge.targetNodeId)) {
      errors.push(`Edge ${edge.id}: unknown targetNodeId "${edge.targetNodeId}"`);
    }

    // 3. Edge pin refs exist on specs
    const sourceNode = graph.nodes.find((n) => n.id === edge.sourceNodeId);
    const targetNode = graph.nodes.find((n) => n.id === edge.targetNodeId);

    if (sourceNode) {
      try {
        const spec = getNode(sourceNode.ref);
        const pin = spec.pins.find((p) => p.key === edge.sourcePinKey && p.kind === 'output');
        if (!pin) {
          errors.push(
            `Edge ${edge.id}: "${edge.sourcePinKey}" is not an output pin on "${sourceNode.ref}"`,
          );
        }
      } catch {
        // already reported in check 1
      }
    }

    if (targetNode) {
      try {
        const spec = getNode(targetNode.ref);
        const pin = spec.pins.find((p) => p.key === edge.targetPinKey && p.kind === 'input');
        if (!pin) {
          errors.push(
            `Edge ${edge.id}: "${edge.targetPinKey}" is not an input pin on "${targetNode.ref}"`,
          );
        }
      } catch {
        // already reported in check 1
      }
    }
  }

  // 4. No multi-input: each targetNodeId:targetPinKey combo must appear at most once
  const inputCounts = new Map<string, number>();
  for (const edge of graph.edges) {
    const key = `${edge.targetNodeId}:${edge.targetPinKey}`;
    inputCounts.set(key, (inputCounts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of inputCounts) {
    if (count > 1) {
      errors.push(`Pin ${key} has ${count} incoming edges (max 1)`);
    }
  }

  // 5. Required input pins connected
  const connectedInputs = new Set(graph.edges.map((e) => `${e.targetNodeId}:${e.targetPinKey}`));
  for (const node of graph.nodes) {
    if (node.category === 'param') continue;
    try {
      const spec = getNode(node.ref);
      for (const pin of spec.pins) {
        if (pin.kind !== 'input' || pin.optional) continue;
        if (!connectedInputs.has(`${node.id}:${pin.key}`)) {
          errors.push(`Node ${node.id} (${node.ref}): required input pin "${pin.key}" not connected`);
        }
      }
    } catch {
      // already reported
    }
  }

  // 6. No cycles: DFS
  const adjList = new Map<string, string[]>();
  for (const node of graph.nodes) adjList.set(node.id, []);
  for (const edge of graph.edges) {
    adjList.get(edge.sourceNodeId)?.push(edge.targetNodeId);
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();

  function dfs(nodeId: string): boolean {
    if (visiting.has(nodeId)) return true; // cycle
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const neighbor of adjList.get(nodeId) ?? []) {
      if (dfs(neighbor)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  }

  for (const node of graph.nodes) {
    if (!visited.has(node.id) && dfs(node.id)) {
      errors.push(`Graph contains a cycle involving node "${node.id}"`);
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}
