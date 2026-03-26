-- Migration: Move m365_roles from vendors to definitions
-- Run this AFTER seeding definitions.m365_roles via packages/scripts/src/seeds/m365-roles.ts
--
-- This migration:
--   1. Re-points m365_identity_roles.role_id FK → definitions.m365_roles
--   2. Re-points m365_policy_roles.role_id FK → definitions.m365_roles
--   3. Rebuilds m365_roles_view from definitions
--   4. Drops vendors.m365_roles
--   5. Cleans up stale ingest_jobs for m365-roles

-- 1. Re-point m365_identity_roles.role_id → definitions.m365_roles
ALTER TABLE vendors.m365_identity_roles
  DROP CONSTRAINT m365_identity_roles_role_id_fkey,
  ADD CONSTRAINT m365_identity_roles_role_id_fkey
    FOREIGN KEY (role_id) REFERENCES definitions.m365_roles(id) ON DELETE CASCADE;

-- 2. Re-point m365_policy_roles.role_id → definitions.m365_roles
ALTER TABLE vendors.m365_policy_roles
  DROP CONSTRAINT m365_policy_roles_role_id_fkey,
  ADD CONSTRAINT m365_policy_roles_role_id_fkey
    FOREIGN KEY (role_id) REFERENCES definitions.m365_roles(id) ON DELETE CASCADE;

-- 3. Rebuild m365_roles_view from definitions
CREATE OR REPLACE VIEW views.m365_roles_view AS
SELECT
  dr.id,
  dr.name,
  dr.description,
  dr.template_id,
  stats.link_id,
  stats.tenant_id,
  il.name AS link_name,
  stats.member_count
FROM (
  SELECT role_id, link_id, tenant_id, COUNT(*) AS member_count
  FROM vendors.m365_identity_roles
  GROUP BY role_id, link_id, tenant_id
) stats
JOIN definitions.m365_roles dr ON dr.id = stats.role_id
JOIN integration_links il ON il.id = stats.link_id;

-- 4. Drop the per-tenant roles table (CASCADE removes any remaining FKs)
DROP TABLE IF EXISTS vendors.m365_roles CASCADE;

-- 5. Clean up stale ingest_jobs for m365-roles
DELETE FROM ingest_jobs WHERE ingest_type = 'm365-roles';
