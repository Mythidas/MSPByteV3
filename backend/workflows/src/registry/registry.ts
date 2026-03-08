import type { NodeSpec } from '../types.js';

const registry = new Map<string, NodeSpec>();

export function registerNode(spec: NodeSpec): void {
  if (registry.has(spec.ref)) {
    throw new Error(`Node already registered: ${spec.ref}`);
  }
  registry.set(spec.ref, spec);
}

export function getNode(ref: string): NodeSpec {
  const spec = registry.get(ref);
  if (!spec) {
    throw new Error(`Node not found: ${ref}`);
  }
  return spec;
}

export function getAllNodes(): NodeSpec[] {
  return Array.from(registry.values());
}
