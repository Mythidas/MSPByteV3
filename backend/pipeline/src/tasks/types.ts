// ============================================================================
// CONDITION EVALUATION
// ============================================================================

export interface Condition {
  field: string; // dot-notation path into output (e.g. "length", "0.state")
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'exists' | 'not_exists';
  value?: any;
  stage_ref?: number; // which stage's output to evaluate against (index in workflow.stages)
}

// ============================================================================
// WORKFLOW STAGE DEFINITION (stored as JSONB in workflows.stages)
// ============================================================================

export interface StageDefinition {
  id: string; // local stage identifier (e.g. "stage-0")
  type: 'query' | 'action';
  operation: string; // UUID of a row in `queries` or `actions`
  depends_on: string[]; // stage ids that must complete before this stage runs
  condition?: Condition & { stage_ref: number }; // skip this stage if condition is false
}

// ============================================================================
// ALERT / TAG RULES (stored as JSONB in workflows)
// ============================================================================

export interface AlertRule {
  alert_definition_id: string; // UUID of alert_definitions row
  stage_ref: number; // index into workflow.stages whose output to evaluate
  condition: Condition;
  message_template?: string; // supports {{field}} substitution from stage output
  apply_to_each_entity?: boolean; // if true: iterate array output, one alert per matching entity
  entity_id_field?: string; // dot-path to entity UUID in each row (e.g. "id")
}

export interface TagRule {
  tag_definition_id: string; // UUID of tag_definitions row
  stage_ref: number;
  condition: Condition;
  apply_to_entity_field?: string; // if set, tag entity at output[n][field] for each row
}

// ============================================================================
// STAGE RESULT (one entry in task_history.stage_results)
// ============================================================================

export interface StageResult {
  stage_id: string;
  status: 'completed' | 'failed' | 'skipped';
  output: any;
  error?: string;
  duration_ms: number;
  skipped: boolean;
}

// ============================================================================
// BULLMQ JOB PAYLOAD
// ============================================================================

export interface TaskJobData {
  taskId: string;
  tenantId: string;
  historyId: string; // pre-created task_history row
}

// ============================================================================
// SCOPE / SCHEDULE / RETRY CONFIG
// ============================================================================

export interface ScopeDefinition {
  level: 'tenant' | 'site' | 'connection' | 'device';
  site_id?: string;
  entity_id?: string;
  connection_id?: string;
}

export interface RetryConfig {
  max_attempts: number;
  initial_delay_ms: number;
  backoff_type: 'exponential' | 'fixed';
}

export interface ScheduleDefinition {
  type: 'one_shot' | 'recurring';
  cron?: string; // required when type = 'recurring'
}

// ============================================================================
// DATABASE ROW TYPES
// These are inline because the new tables are not yet in the generated schema.
// After running task_automation.sql and regenerating types, these can be replaced.
// ============================================================================

export interface TaskRow {
  id: string;
  tenant_id: string;
  name: string;
  enabled: boolean;
  workflow_id: string;
  scope: ScopeDefinition;
  schedule: ScheduleDefinition;
  retry_config: RetryConfig;
  next_run_at: string;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRow {
  id: string;
  tenant_id: string | null;
  name: string;
  description: string | null;
  integration_id: string;
  is_built_in: boolean;
  stages: StageDefinition[];
  alert_rules: AlertRule[];
  tag_rules: TagRule[];
  created_at: string;
  updated_at: string;
}

export interface QueryRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  integration_id: string;
  module: string;
  function: string;
  scope: Record<string, any>;
  params: Record<string, any>;
  output_format: string;
  created_at: string;
  updated_at: string;
}

export interface ActionRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  integration_id: string;
  module: string;
  function: string;
  scope: Record<string, any>;
  params: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface AlertDefinitionRow {
  id: string;
  tenant_id: string | null;
  name: string;
  severity: string;
  description: string | null;
  color: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface TagDefinitionRow {
  id: string;
  tenant_id: string | null;
  name: string;
  category: string | null;
  description: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}
