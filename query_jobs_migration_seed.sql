-- =============================================================================
-- Query Jobs Migration Seed
-- Migrates all legacy query_jobs to the task automation workflow system.
--
-- Run this after task_automation.sql and task_automation_seed.sql.
-- All UUIDs are stable — safe to re-run (ON CONFLICT DO NOTHING).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ALERT DEFINITIONS
-- -----------------------------------------------------------------------------

INSERT INTO alert_definitions (id, name, severity, description, tenant_id) VALUES
  -- Microsoft 365 MFA Coverage
  ('a1000001-0000-4000-a000-000000000001', 'mfa-not-enforced',     'critical', 'User has no MFA enforcement',                                   NULL),
  ('a1000001-0000-4000-a000-000000000002', 'mfa-partial-enforced', 'high',     'User has partial MFA enforcement (not covered by any CA policy)', NULL),

  -- Microsoft 365 Stale Users
  ('a1000001-0000-4000-a000-000000000003', 'stale-user',           'medium',   'User account has not signed in recently',                        NULL),

  -- Microsoft 365 License Waste
  ('a1000001-0000-4000-a000-000000000004', 'license-waste',        'high',     'Disabled user account has active license assignments',           NULL),

  -- Microsoft 365 Direct Send
  ('a1000001-0000-4000-a000-000000000005', 'direct-send-open',     'high',     'Exchange Online DirectSend is open — unauthenticated external mail accepted', NULL),

  -- Sophos Tamper Protection
  ('a1000001-0000-4000-a000-000000000006', 'tamper-disabled',      'high',     'Sophos endpoint has Tamper Protection disabled',                 NULL),

  -- Sophos Offline Devices
  ('a1000001-0000-4000-a000-000000000007', 'sophos-device-offline','medium',   'Sophos endpoint has been offline for an extended period',        NULL),

  -- Sophos Empty Sites
  ('a1000001-0000-4000-a000-000000000008', 'sophos-site-empty',    'low',      'Sophos site has no managed endpoints',                           NULL),

  -- DattoRMM Offline Devices
  ('a1000001-0000-4000-a000-000000000009', 'datto-device-offline', 'medium',   'DattoRMM endpoint has been offline for an extended period',      NULL),

  -- DattoRMM Empty Sites
  ('a1000001-0000-4000-a000-000000000010', 'datto-site-empty',     'low',      'DattoRMM site has no managed endpoints',                         NULL)
ON CONFLICT (id) DO NOTHING;


-- -----------------------------------------------------------------------------
-- QUERIES
-- integration_id + module + function must match LIVE_QUERY_REGISTRY paths
-- -----------------------------------------------------------------------------

INSERT INTO queries (id, name, integration_id, module, function, tenant_id, params, output_format) VALUES
  ('b1000001-0000-4000-b000-000000000001', 'MFA Coverage Analysis',       'microsoft-365', 'mfa',        'coverage',         NULL, '{}', 'table'),
  ('b1000001-0000-4000-b000-000000000002', 'Stale Users Analysis',        'microsoft-365', 'identities', 'stale',            NULL, '{}', 'table'),
  ('b1000001-0000-4000-b000-000000000003', 'License Waste Analysis',      'microsoft-365', 'licenses',   'waste',            NULL, '{}', 'table'),
  ('b1000001-0000-4000-b000-000000000004', 'Direct Send Analysis',        'microsoft-365', 'exchange',   'direct-send',      NULL, '{}', 'table'),
  ('b1000001-0000-4000-b000-000000000005', 'Tamper Protection Analysis',  'sophos-partner','endpoints',  'tamper-protection', NULL, '{}', 'table'),
  ('b1000001-0000-4000-b000-000000000006', 'Sophos Offline Devices',      'sophos-partner','endpoints',  'offline',           NULL, '{}', 'table'),
  ('b1000001-0000-4000-b000-000000000007', 'Sophos Empty Sites',          'sophos-partner','sites',      'empty',             NULL, '{}', 'table'),
  ('b1000001-0000-4000-b000-000000000008', 'DattoRMM Offline Devices',   'dattormm',      'endpoints',  'offline',           NULL, '{}', 'table'),
  ('b1000001-0000-4000-b000-000000000009', 'DattoRMM Empty Sites',       'dattormm',      'sites',      'empty',             NULL, '{}', 'table')
ON CONFLICT (id) DO NOTHING;


-- -----------------------------------------------------------------------------
-- WORKFLOWS
-- is_built_in=true, tenant_id IS NULL → TaskReconciler seeds per-tenant tasks
-- integration_id drives which tenants receive the task
-- -----------------------------------------------------------------------------

-- Microsoft 365: MFA Coverage
INSERT INTO workflows (id, name, integration_id, is_built_in, tenant_id, stages, alert_rules, tag_rules) VALUES (
  'c1000001-0000-4000-c000-000000000001',
  'Microsoft 365: MFA Coverage',
  'microsoft-365',
  true, NULL,
  '[{"id":"stage-0","type":"query","operation":"b1000001-0000-4000-b000-000000000001","depends_on":[]}]',
  '[{"alert_definition_id":"a1000001-0000-4000-a000-000000000001","stage_ref":0,"apply_to_each_entity":true,"entity_id_field":"id","condition":{"field":"mfa_state","operator":"eq","value":"none"},"message_template":"User {{display_name}} has no MFA enforcement"},{"alert_definition_id":"a1000001-0000-4000-a000-000000000002","stage_ref":0,"apply_to_each_entity":true,"entity_id_field":"id","condition":{"field":"mfa_state","operator":"eq","value":"partial"},"message_template":"User {{display_name}} has partial MFA enforcement"}]',
  '[]'
) ON CONFLICT (id) DO NOTHING;

-- Microsoft 365: Stale Users
INSERT INTO workflows (id, name, integration_id, is_built_in, tenant_id, stages, alert_rules, tag_rules) VALUES (
  'c1000001-0000-4000-c000-000000000002',
  'Microsoft 365: Stale Users',
  'microsoft-365',
  true, NULL,
  '[{"id":"stage-0","type":"query","operation":"b1000001-0000-4000-b000-000000000002","depends_on":[]}]',
  '[{"alert_definition_id":"a1000001-0000-4000-a000-000000000003","stage_ref":0,"apply_to_each_entity":true,"entity_id_field":"id","condition":{"field":"days_inactive","operator":"exists"},"message_template":"User {{display_name}} has not signed in for {{days_inactive}} days"}]',
  '[]'
) ON CONFLICT (id) DO NOTHING;

-- Microsoft 365: License Waste
INSERT INTO workflows (id, name, integration_id, is_built_in, tenant_id, stages, alert_rules, tag_rules) VALUES (
  'c1000001-0000-4000-c000-000000000003',
  'Microsoft 365: License Waste',
  'microsoft-365',
  true, NULL,
  '[{"id":"stage-0","type":"query","operation":"b1000001-0000-4000-b000-000000000003","depends_on":[]}]',
  '[{"alert_definition_id":"a1000001-0000-4000-a000-000000000004","stage_ref":0,"apply_to_each_entity":true,"entity_id_field":"id","condition":{"field":"license_count","operator":"exists"},"message_template":"Disabled user {{display_name}} has {{license_count}} license(s) assigned"}]',
  '[]'
) ON CONFLICT (id) DO NOTHING;

-- Microsoft 365: Direct Send
INSERT INTO workflows (id, name, integration_id, is_built_in, tenant_id, stages, alert_rules, tag_rules) VALUES (
  'c1000001-0000-4000-c000-000000000004',
  'Microsoft 365: Direct Send',
  'microsoft-365',
  true, NULL,
  '[{"id":"stage-0","type":"query","operation":"b1000001-0000-4000-b000-000000000004","depends_on":[]}]',
  '[{"alert_definition_id":"a1000001-0000-4000-a000-000000000005","stage_ref":0,"apply_to_each_entity":true,"entity_id_field":"id","condition":{"field":"id","operator":"exists"},"message_template":"Exchange config {{display_name}} has DirectSend open"}]',
  '[]'
) ON CONFLICT (id) DO NOTHING;

-- Sophos Partner: Tamper Protection
INSERT INTO workflows (id, name, integration_id, is_built_in, tenant_id, stages, alert_rules, tag_rules) VALUES (
  'c1000001-0000-4000-c000-000000000005',
  'Sophos: Tamper Protection',
  'sophos-partner',
  true, NULL,
  '[{"id":"stage-0","type":"query","operation":"b1000001-0000-4000-b000-000000000005","depends_on":[]}]',
  '[{"alert_definition_id":"a1000001-0000-4000-a000-000000000006","stage_ref":0,"apply_to_each_entity":true,"entity_id_field":"id","condition":{"field":"id","operator":"exists"},"message_template":"Device {{display_name}} has Tamper Protection disabled"}]',
  '[]'
) ON CONFLICT (id) DO NOTHING;

-- Sophos Partner: Offline Devices
INSERT INTO workflows (id, name, integration_id, is_built_in, tenant_id, stages, alert_rules, tag_rules) VALUES (
  'c1000001-0000-4000-c000-000000000006',
  'Sophos: Offline Devices',
  'sophos-partner',
  true, NULL,
  '[{"id":"stage-0","type":"query","operation":"b1000001-0000-4000-b000-000000000006","depends_on":[]}]',
  '[{"alert_definition_id":"a1000001-0000-4000-a000-000000000007","stage_ref":0,"apply_to_each_entity":true,"entity_id_field":"id","condition":{"field":"days_offline","operator":"exists"},"message_template":"Device {{display_name}} has been offline for {{days_offline}} days"}]',
  '[]'
) ON CONFLICT (id) DO NOTHING;

-- Sophos Partner: Empty Sites
INSERT INTO workflows (id, name, integration_id, is_built_in, tenant_id, stages, alert_rules, tag_rules) VALUES (
  'c1000001-0000-4000-c000-000000000007',
  'Sophos: Empty Sites',
  'sophos-partner',
  true, NULL,
  '[{"id":"stage-0","type":"query","operation":"b1000001-0000-4000-b000-000000000007","depends_on":[]}]',
  '[{"alert_definition_id":"a1000001-0000-4000-a000-000000000008","stage_ref":0,"apply_to_each_entity":true,"entity_id_field":"id","condition":{"field":"id","operator":"exists"},"message_template":"Site {{display_name}} has no managed endpoints"}]',
  '[]'
) ON CONFLICT (id) DO NOTHING;

-- DattoRMM: Offline Devices
INSERT INTO workflows (id, name, integration_id, is_built_in, tenant_id, stages, alert_rules, tag_rules) VALUES (
  'c1000001-0000-4000-c000-000000000008',
  'DattoRMM: Offline Devices',
  'dattormm',
  true, NULL,
  '[{"id":"stage-0","type":"query","operation":"b1000001-0000-4000-b000-000000000008","depends_on":[]}]',
  '[{"alert_definition_id":"a1000001-0000-4000-a000-000000000009","stage_ref":0,"apply_to_each_entity":true,"entity_id_field":"id","condition":{"field":"days_offline","operator":"exists"},"message_template":"Device {{display_name}} has been offline for {{days_offline}} days"}]',
  '[]'
) ON CONFLICT (id) DO NOTHING;

-- DattoRMM: Empty Sites
INSERT INTO workflows (id, name, integration_id, is_built_in, tenant_id, stages, alert_rules, tag_rules) VALUES (
  'c1000001-0000-4000-c000-000000000009',
  'DattoRMM: Empty Sites',
  'dattormm',
  true, NULL,
  '[{"id":"stage-0","type":"query","operation":"b1000001-0000-4000-b000-000000000009","depends_on":[]}]',
  '[{"alert_definition_id":"a1000001-0000-4000-a000-000000000010","stage_ref":0,"apply_to_each_entity":true,"entity_id_field":"id","condition":{"field":"id","operator":"exists"},"message_template":"Site {{display_name}} has no managed endpoints"}]',
  '[]'
) ON CONFLICT (id) DO NOTHING;
