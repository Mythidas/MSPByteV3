-- Task Automation Built-in Definitions Seed
-- Run AFTER task_automation.sql in Supabase dashboard SQL editor.
-- Inserts platform-wide definitions (tenant_id = NULL).
-- TaskReconciler will auto-create per-tenant tasks rows referencing these.
--
-- Idempotent: uses ON CONFLICT DO NOTHING.
-- Fixed UUIDs allow safe re-runs and cross-environment consistency.

-- ============================================================
-- TAMPER PROTECTION CHECK (sophos-partner)
--
-- Replaces TamperProtectionJob.
-- For each Sophos endpoint where tamperProtectionEnabled = false:
--   - Fire a 'high' alert per entity
--   - Apply 'tamper-disabled' tag per entity
-- ============================================================

-- 1. Alert definition
INSERT INTO alert_definitions (id, tenant_id, name, severity, description)
VALUES (
  'aaaaaaaa-0001-0000-0000-000000000000',
  NULL,
  'tamper-protection-disabled',
  'high',
  'Tamper Protection is disabled on this device'
)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- 2. Tag definition
INSERT INTO tag_definitions (id, tenant_id, name, category, description)
VALUES (
  'bbbbbbbb-0001-0000-0000-000000000000',
  NULL,
  'tamper-disabled',
  'status',
  'Device has tamper protection disabled'
)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- 3. Query: all Sophos endpoints (table output = array of entity rows)
INSERT INTO queries (id, tenant_id, name, integration_id, module, function, output_format, params)
VALUES (
  'cccccccc-0001-0000-0000-000000000000',
  NULL,
  'Sophos Partner – All Endpoints',
  'sophos-partner',
  'endpoints',
  'list',
  'table',
  '{}'::jsonb
)
ON CONFLICT DO NOTHING;

-- 4. Workflow: single query stage + per-entity alert + per-entity tag
INSERT INTO workflows (id, tenant_id, name, integration_id, is_built_in, stages, alert_rules, tag_rules)
VALUES (
  'dddddddd-0001-0000-0000-000000000000',
  NULL,
  'Sophos – Tamper Protection Check',
  'sophos-partner',
  true,
  '[{"id":"stage-0","type":"query","operation":"cccccccc-0001-0000-0000-000000000000","depends_on":[]}]'::jsonb,
  '[{
    "alert_definition_id": "aaaaaaaa-0001-0000-0000-000000000000",
    "stage_ref": 0,
    "condition": {"field": "raw_data.tamperProtectionEnabled", "operator": "eq", "value": false},
    "apply_to_each_entity": true,
    "entity_id_field": "id",
    "message_template": "Device \"{{display_name}}\" has Tamper Protection Disabled"
  }]'::jsonb,
  '[{
    "tag_definition_id": "bbbbbbbb-0001-0000-0000-000000000000",
    "stage_ref": 0,
    "condition": {"field": "raw_data.tamperProtectionEnabled", "operator": "eq", "value": false},
    "apply_to_entity_field": "id"
  }]'::jsonb
)
ON CONFLICT DO NOTHING;


-- ============================================================
-- MFA POLICY COVERAGE (microsoft-365)
--
-- Replaces MFACoverageJob.
-- Uses LIVE_QUERY_REGISTRY handler (microsoft-365/mfa/coverage) which
-- returns augmented identity rows with mfa_state: 'none' | 'partial'.
-- Empty output = all users covered, no alerts fired.
-- Two alert rules: one for 'none' (critical), one for 'partial' (high).
-- ============================================================

-- 1. Alert definition: no MFA policy at all (critical)
INSERT INTO alert_definitions (id, tenant_id, name, severity, description)
VALUES (
  'aaaaaaaa-0002-0000-0000-000000000000',
  NULL,
  'mfa-not-enforced',
  'critical',
  'No MFA Conditional Access Policy exists for this user'
)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- 2. Alert definition: MFA policies exist but user not covered (high)
INSERT INTO alert_definitions (id, tenant_id, name, severity, description)
VALUES (
  'aaaaaaaa-0003-0000-0000-000000000000',
  NULL,
  'mfa-partial-enforced',
  'high',
  'MFA policies exist but this user is not covered'
)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- 3. Query: live query via LIVE_QUERY_REGISTRY (module='mfa' not in ENTITY_TYPE_MAP)
INSERT INTO queries (id, tenant_id, name, integration_id, module, function, output_format)
VALUES (
  'cccccccc-0002-0000-0000-000000000000',
  NULL,
  'M365 – MFA Coverage Analysis',
  'microsoft-365',
  'mfa',
  'coverage',
  'table'
)
ON CONFLICT DO NOTHING;

-- 4. Workflow: two per-entity alert rules distinguishing none vs partial coverage
INSERT INTO workflows (id, tenant_id, name, integration_id, is_built_in, stages, alert_rules, tag_rules)
VALUES (
  'dddddddd-0002-0000-0000-000000000000',
  NULL,
  'M365 – MFA Policy Coverage',
  'microsoft-365',
  true,
  '[{"id":"stage-0","type":"query","operation":"cccccccc-0002-0000-0000-000000000000","depends_on":[]}]'::jsonb,
  '[
    {
      "alert_definition_id": "aaaaaaaa-0002-0000-0000-000000000000",
      "stage_ref": 0,
      "condition": {"field": "mfa_state", "operator": "eq", "value": "none"},
      "apply_to_each_entity": true,
      "entity_id_field": "id",
      "message_template": "\"{{display_name}}\" has no MFA policy enforced"
    },
    {
      "alert_definition_id": "aaaaaaaa-0003-0000-0000-000000000000",
      "stage_ref": 0,
      "condition": {"field": "mfa_state", "operator": "eq", "value": "partial"},
      "apply_to_each_entity": true,
      "entity_id_field": "id",
      "message_template": "\"{{display_name}}\" is not covered by any MFA Conditional Access Policy"
    }
  ]'::jsonb,
  '[]'::jsonb
)
ON CONFLICT DO NOTHING;
