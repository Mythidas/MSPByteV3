export type ScopeType = 'all_sites' | 'site_ids' | 'entity_ids' | 'filter';
export type StageType = 'query' | 'action' | 'alert' | 'tag' | 'filter' | 'ticket' | 'display';
export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'partial';
export type StageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type OnError = 'fail' | 'skip' | 'continue';
export type TriggeredBy = 'schedule' | 'manual' | 'api';

export type DisplaySectionType = 'entity_list' | 'stat' | 'summary_text';

export interface DisplaySection {
  type: DisplaySectionType;
  label?: string;
  source?: string;
  aggregate?: 'count';
  template?: string;
}

export interface DisplayNodeConfig {
  sections: DisplaySection[];
}

export interface WorkflowStageNode {
  id: string;
  label: string;
  type: StageType;
  integration: string | null;
  ref: string;
  params: Record<string, unknown>;
  input_map: Record<string, { from: string }>;
  template?: string;
  on_error: OnError;
  alert_config?: AlertNodeConfig;
  tag_config?: TagNodeConfig;
  filter_config?: FilterNodeConfig;
  display_config?: DisplayNodeConfig;
}

export interface RunContext {
  run_id: string;
  tenant_id: string;
  triggered_by: TriggeredBy;
  triggered_by_user?: string;
  seed: {
    scope_type: ScopeType;
    entity_ids?: string[];
    site_ids?: string[];
    entity_type?: string;
    params?: Record<string, unknown>;
  };
  stage_outputs: Record<string, unknown>;
  entity_log: Record<string, EntityLogEntry>;
}

export interface EntityLogEntry {
  entity_id: string;
  entity_type: string;
  integration: string;
  display_name: string | null;
  site_id: string | null;
  connection_id: string | null;
  raw_data: Record<string, unknown>;
  actions_applied: string[];
  stage_node_ids: string[];
}

// Alert node types
export interface AlertNodeConfig {
  alert_definition_id: string;
  mode: 'create' | 'resolve' | 'create_or_resolve';
  target_type: 'entity' | 'site' | 'connection';
  message_template?: string;
  severity_override?: string;
  metadata?: Record<string, unknown>;
}

export interface AlertNodeInputs {
  target_ids: string[];
  resolve_target_ids?: string[];
}

export interface AlertStageResult {
  created: string[];
  resolved: string[];
  created_alert_ids: string[];
  resolved_alert_ids: string[];
  skipped: string[];
}

// Tag node types
export interface TagNodeConfig {
  tag_definition_id: string;
  mode: 'apply' | 'remove' | 'apply_or_remove';
  target_type: 'entity' | 'site' | 'connection';
  source?: string;
}

export interface TagNodeInputs {
  target_ids: string[];
  remove_target_ids?: string[];
}

export interface TagStageResult {
  applied: string[];
  removed: string[];
  skipped: string[];
}

// Filter node types
export type Row = Record<string, unknown>;

export interface FilterNodeConfig {
  source_field: string;
  rules: FilterRule[];
  match_mode: 'all' | 'any';
}

export interface FilterRule {
  field: string;
  operator: 'eq' | 'neq' | 'in' | 'nin' | 'gt' | 'lt' | 'exists' | 'not_exists';
  value?: unknown;
}

export interface FilterNodeOutput {
  in: Row[];
  out: Row[];
  in_ids: string[];
  out_ids: string[];
}

// Query definition types
export interface QueryOutputSchema {
  [key: string]: {
    type: 'array' | 'object' | 'string' | 'number' | 'object';
    item_schema?: Record<string, 'string' | 'number' | 'boolean' | 'array' | 'object'>;
    description?: string;
  };
}

export interface QueryDefinition {
  key: string;
  integration: string;
  label: string;
  description: string;
  inputs: Record<string, InputSchema>;
  outputs: Record<string, OutputSchema>;
  output_schema?: QueryOutputSchema;
  source: 'db' | 'live';
  entityOutputKey?: string;
  execute: (ctx: RunContext, inputs: Record<string, unknown>) => Promise<unknown>;
}

export interface ActionDefinition {
  key: string;
  integration: string;
  label: string;
  description: string;
  inputs: Record<string, InputSchema>;
  outputs: Record<string, OutputSchema>;
  affectsEntities: boolean;
  execute: (ctx: RunContext, inputs: Record<string, unknown>) => Promise<ActionResult>;
}

export interface ActionResult {
  succeeded: string[];
  failed: string[];
  output: unknown;
}

export interface TicketTemplate {
  key: string;
  subject: string;
  body: TemplateSection[];
}

export type TemplateSection =
  | { type: 'static_text'; content: string }
  | { type: 'entity_table'; source: string; columns: string[]; heading?: string }
  | { type: 'action_summary'; heading?: string }
  | { type: 'query_output'; source: string; heading?: string };

export interface InputSchema {
  type: 'string' | 'array' | 'boolean' | 'number';
  items?: string;
  optional?: boolean;
  description?: string;
}

export interface OutputSchema {
  type: 'string' | 'array' | 'object' | 'number';
  description?: string;
}

export interface TaskRunRow {
  id: string;
  task_id: string | null;
  tenant_id: string;
  triggered_by: TriggeredBy;
  triggered_by_user: string | null;
  workflow_snapshot: WorkflowStageNode[];
  resolved_scope: RunContext['seed'];
  seed_params: Record<string, unknown>;
  entity_log: Record<string, EntityLogEntry> | null;
  status: RunStatus;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
}

export interface TaskRunJobData {
  runId: string;
}
