-- =============================================================================
-- Ad-Hoc Task Support Migration
-- Adds is_adhoc, priority, params_override columns to tasks.
-- Replaces the UNIQUE(workflow_id, tenant_id) constraint with a partial
-- unique index that only enforces uniqueness for scheduled (non-adhoc) tasks,
-- allowing multiple quick-run ad-hoc executions of the same workflow per tenant.
-- =============================================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS is_adhoc       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS params_override jsonb  NOT NULL DEFAULT '{}';

-- Drop the existing named unique constraint
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_workflow_tenant_unique;

-- Partial unique index: only one scheduled task per workflow per tenant
-- Ad-hoc tasks (is_adhoc = true) are excluded and can be created freely
CREATE UNIQUE INDEX IF NOT EXISTS tasks_workflow_tenant_scheduled_unique
  ON tasks (workflow_id, tenant_id)
  WHERE is_adhoc = false;
