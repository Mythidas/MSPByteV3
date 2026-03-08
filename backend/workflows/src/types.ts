export type PinKind = 'input' | 'output';
export type Cardinality = 'single' | 'array';
export type NodeCategory = 'param' | 'source' | 'transform' | 'sink';

export interface PinDefinition {
  key: string;
  kind: PinKind;
  dataType: string;
  cardinality: Cardinality;
  optional?: boolean;
}

export interface ParamSchemaItem {
  key: string;
  label: string;
  dataType: string;
  cardinality: Cardinality;
  required: boolean;
}

export interface GraphNode {
  id: string;
  ref: string;
  category: NodeCategory;
  params: Record<string, unknown>;
}

export interface EdgeDefinition {
  id: string;
  sourceNodeId: string;
  sourcePinKey: string;
  targetNodeId: string;
  targetPinKey: string;
}

export interface WorkflowGraph {
  nodes: GraphNode[];
  edges: EdgeDefinition[];
}

export interface RunContext {
  run_id: string;
  tenant_id: string;
  triggered_by: string;
  triggered_by_user: string | null;
  seed: Record<string, unknown>;
  node_outputs: Record<string, Record<string, unknown>>;
}

export interface NodeOutput {
  [pinKey: string]: unknown;
  _metrics?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface NodeRunResult {
  nodeId: string;
  status: 'completed' | 'failed' | 'skipped';
  error?: string;
  category: NodeCategory;
}

export interface NodeSpec {
  ref: string;
  label: string;
  description: string;
  category: NodeCategory;
  integration: string | null;
  isGeneric: boolean;
  pins: PinDefinition[];
  paramSchema: ParamSchemaItem[];
  affectedEntitiesPin?: string;
  execute: (input: Record<string, unknown>, ctx: RunContext) => Promise<Record<string, unknown>>;
}

export interface RunSeed {
  scope_type: 'entity_ids' | 'site_ids' | 'link_ids' | 'all';
  entity_ids?: string[];
  entity_type?: string;
  site_ids?: string[];
  link_ids?: string[];
  params: Record<string, unknown>;
}

export interface WorkflowRunJobPayload {
  run_id: string;
  priority?: number;
}

export interface SchedulerJobPayload {
  tick_at: string;
}
