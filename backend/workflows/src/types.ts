import { Json } from "@workspace/shared/types/schema";

export type PinKind = "input" | "output";
export type Cardinality = "single" | "array";
export type NodeCategory = "param" | "source" | "transform" | "sink";

export type PinDefinition = {
  key: string;
  kind: PinKind;
  dataType: string;
  cardinality: Cardinality;
  optional?: boolean;
};

export type ParamSchemaItem = {
  key: string;
  label: string;
  dataType: string;
  cardinality: Cardinality;
  required: boolean;
};

export type GraphNode = {
  id: string;
  ref: string;
  category: NodeCategory;
  params: Record<string, unknown>;
};

export type EdgeDefinition = {
  id: string;
  sourceNodeId: string;
  sourcePinKey: string;
  targetNodeId: string;
  targetPinKey: string;
};

export type WorkflowGraph = {
  nodes: GraphNode[];
  edges: EdgeDefinition[];
};

export type RunContext = {
  run_id: string;
  tenant_id: string;
  triggered_by: string;
  triggered_by_user: string | null;
  seed: Record<string, unknown>;
  node_outputs: Record<string, Record<string, unknown>>;
};

export type NodeOutput = {
  [pinKey: string]: unknown;
  _metrics?: Record<string, unknown>;
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

export type NodeRunResult = {
  nodeId: string;
  status: "completed" | "failed" | "skipped";
  error?: string;
  category: NodeCategory;
};

export type NodeSpec = {
  ref: string;
  label: string;
  description: string;
  category: NodeCategory;
  integration: string | null;
  isGeneric: boolean;
  pins: PinDefinition[];
  paramSchema: ParamSchemaItem[];
  affectedEntitiesPin?: string;
  execute: (
    input: Record<string, unknown>,
    ctx: RunContext,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
};

export type RunSeed = {
  scope_type: "entity_ids" | "site_ids" | "link_ids" | "all";
  entity_ids?: string[];
  entity_type?: string;
  site_ids?: string[];
  link_ids?: string[];
  params: Json;
};

export type WorkflowRunJobPayload = {
  run_id: string;
  priority?: number;
};

export type SchedulerJobPayload = {
  tick_at: string;
};
