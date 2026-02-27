-- Task Automation System Migration
-- Run in Supabase dashboard SQL editor
-- Coexists with existing query_jobs/sync_jobs — old tables are not dropped.

-- ============================================================
-- alert_definitions
-- Platform-wide or tenant-scoped alert types
-- (tenant_id IS NULL = MSP-managed, visible to all tenants)
-- ============================================================
CREATE TABLE IF NOT EXISTS alert_definitions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = platform-wide
  name        text        NOT NULL,
  severity    text        NOT NULL DEFAULT 'medium',
  description text,
  color       text,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

-- ============================================================
-- tag_definitions
-- Platform-wide or tenant-scoped tag types
-- ============================================================
CREATE TABLE IF NOT EXISTS tag_definitions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = platform-wide
  name        text        NOT NULL,
  category    text,
  description text,
  color       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

-- ============================================================
-- queries
-- Reusable query definitions (DB entities or live API)
-- tenant_id IS NULL = MSP-managed (platform-wide), usable by all tenants
-- ============================================================
CREATE TABLE IF NOT EXISTS queries (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = platform-wide
  name          text        NOT NULL,
  description   text,
  integration_id text       NOT NULL,  -- e.g. 'dattormm', 'microsoft-365'
  module        text        NOT NULL,  -- e.g. 'devices', 'identities'
  function      text        NOT NULL,  -- 'list' | 'filter' | 'count' | 'exists' | 'find'
  scope         jsonb       NOT NULL DEFAULT '{}',  -- { level: 'tenant'|'site'|'device' }
  params        jsonb       NOT NULL DEFAULT '{}',  -- filter conditions
  output_format text        NOT NULL DEFAULT 'table',  -- 'table'|'list'|'scalar'|'boolean'
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- actions
-- Reusable action definitions (always live API)
-- tenant_id IS NULL = MSP-managed (platform-wide)
-- ============================================================
CREATE TABLE IF NOT EXISTS actions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = platform-wide
  name          text        NOT NULL,
  description   text,
  integration_id text       NOT NULL,
  module        text        NOT NULL,  -- e.g. 'tickets', 'variables'
  function      text        NOT NULL,  -- e.g. 'create', 'set', 'update'
  scope         jsonb       NOT NULL DEFAULT '{}',
  params        jsonb       NOT NULL DEFAULT '{}',  -- static parameters
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- workflows
-- Ordered pipeline of stages with alert/tag rules
-- tenant_id IS NULL = MSP-managed (platform-wide)
-- is_built_in = true → TaskReconciler auto-creates per-tenant tasks
-- integration_id → used by TaskReconciler to find tenants with this integration
--
-- stages: [{
--   id: string, type: 'query'|'action', operation: uuid,
--   depends_on: string[], condition?: { field, operator, value, stage_ref }
-- }]
-- alert_rules: [{
--   alert_definition_id: uuid, stage_ref: number,
--   condition: { field, operator, value }, message_template?: string,
--   apply_to_each_entity?: boolean,  -- iterate array output, one alert per entity
--   entity_id_field?: string         -- dot-path to entity UUID in each row (e.g. "id")
-- }]
-- tag_rules: [{
--   tag_definition_id: uuid, stage_ref: number,
--   condition: { field, operator, value }, apply_to_entity_field?: string
-- }]
-- ============================================================
CREATE TABLE IF NOT EXISTS workflows (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = platform-wide
  name           text        NOT NULL,
  description    text,
  integration_id text        NOT NULL DEFAULT '',  -- for TaskReconciler tenant matching
  is_built_in    boolean     NOT NULL DEFAULT false,  -- true = auto-schedule per tenant
  stages         jsonb       NOT NULL DEFAULT '[]',
  alert_rules    jsonb       NOT NULL DEFAULT '[]',
  tag_rules      jsonb       NOT NULL DEFAULT '[]',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- tasks
-- Scheduled executions of a workflow, one per tenant
-- scope: { level: 'tenant'|'site'|'device', site_id?: uuid, entity_id?: uuid }
-- schedule: { type: 'one_shot'|'recurring', cron?: string }
-- retry_config: { max_attempts: 3, initial_delay_ms: 2000, backoff_type: 'exponential'|'fixed' }
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  enabled      boolean     NOT NULL DEFAULT true,
  workflow_id  uuid        NOT NULL REFERENCES workflows(id) ON DELETE RESTRICT,
  scope        jsonb       NOT NULL DEFAULT '{}',
  schedule     jsonb       NOT NULL DEFAULT '{}',
  retry_config jsonb       NOT NULL DEFAULT '{"max_attempts":3,"initial_delay_ms":2000,"backoff_type":"exponential"}',
  next_run_at  timestamptz NOT NULL,
  last_run_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_workflow_tenant_unique UNIQUE (workflow_id, tenant_id)
);

-- ============================================================
-- task_history
-- Execution records per task run
-- status: 'pending'|'running'|'completed'|'failed'|'dead'
-- stage_results: [{ stage_id, status, output, error, duration_ms, skipped }]
-- alerts_triggered: [{ alert_definition_id, message }]
-- tags_applied: [{ tag_definition_id }]
-- ============================================================
CREATE TABLE IF NOT EXISTS task_history (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          uuid        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tenant_id        uuid        NOT NULL,
  scope            jsonb       NOT NULL DEFAULT '{}',
  status           text        NOT NULL DEFAULT 'pending',
  stage_results    jsonb       NOT NULL DEFAULT '[]',
  alerts_triggered jsonb       NOT NULL DEFAULT '[]',
  tags_applied     jsonb       NOT NULL DEFAULT '[]',
  started_at       timestamptz,
  completed_at     timestamptz,
  error            text,
  duration_ms      integer
);

-- ============================================================
-- Alter existing tables (backwards-compatible, nullable)
-- Legacy alerts/tags leave these columns null.
-- Task automation alerts/tags populate them to link back to definitions.
-- ============================================================
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS alert_definition_id uuid
    REFERENCES alert_definitions(id) ON DELETE SET NULL;

ALTER TABLE tags
  ADD COLUMN IF NOT EXISTS tag_definition_id uuid
    REFERENCES tag_definitions(id) ON DELETE SET NULL;

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_id
  ON tasks(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tasks_next_run_at
  ON tasks(next_run_at) WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_task_history_task_id
  ON task_history(task_id);

CREATE INDEX IF NOT EXISTS idx_task_history_tenant_id
  ON task_history(tenant_id);

CREATE INDEX IF NOT EXISTS idx_task_history_status
  ON task_history(status);

CREATE INDEX IF NOT EXISTS idx_queries_tenant_id
  ON queries(tenant_id);

CREATE INDEX IF NOT EXISTS idx_actions_tenant_id
  ON actions(tenant_id);

CREATE INDEX IF NOT EXISTS idx_workflows_tenant_id
  ON workflows(tenant_id);

CREATE INDEX IF NOT EXISTS idx_alert_definitions_tenant_id
  ON alert_definitions(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tag_definitions_tenant_id
  ON tag_definitions(tenant_id);

CREATE INDEX IF NOT EXISTS idx_alerts_alert_definition_id
  ON alerts(alert_definition_id) WHERE alert_definition_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tags_tag_definition_id
  ON tags(tag_definition_id) WHERE tag_definition_id IS NOT NULL;
