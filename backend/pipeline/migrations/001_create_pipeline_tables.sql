-- Pipeline Migration: Create entity pipeline tables
-- Run this in Supabase SQL Editor or via supabase db push

-- Enable pg_trgm extension for display_name search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- entities — the backbone
-- ============================================================================
CREATE TABLE entities (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     int NOT NULL REFERENCES tenants(id),
  integration_id text NOT NULL,
  site_id       int REFERENCES sites(id) ON DELETE SET NULL,
  entity_type   text NOT NULL,
  external_id   text NOT NULL,
  display_name  text,
  raw_data      jsonb NOT NULL,
  data_hash     text NOT NULL,
  state         text NOT NULL DEFAULT 'normal',
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  sync_id       uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE(tenant_id, integration_id, entity_type, external_id)
);

CREATE INDEX idx_entities_tenant_type ON entities(tenant_id, entity_type);
CREATE INDEX idx_entities_tenant_integration ON entities(tenant_id, integration_id);
CREATE INDEX idx_entities_site ON entities(site_id) WHERE site_id IS NOT NULL;
CREATE INDEX idx_entities_state ON entities(tenant_id, state) WHERE state != 'normal';
CREATE INDEX idx_entities_display_name ON entities USING gin(display_name gin_trgm_ops);

-- ============================================================================
-- entity_tags — filterable labels on entities
-- ============================================================================
CREATE TABLE entity_tags (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id   bigint NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  tag         text NOT NULL,
  category    text,
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE(entity_id, tag)
);

CREATE INDEX idx_entity_tags_tag ON entity_tags(tag);
CREATE INDEX idx_entity_tags_entity ON entity_tags(entity_id);
CREATE INDEX idx_entity_tags_category ON entity_tags(category) WHERE category IS NOT NULL;

-- ============================================================================
-- entity_alerts — actionable issues with suppression
-- ============================================================================
CREATE TABLE entity_alerts (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       int NOT NULL REFERENCES tenants(id),
  entity_id       bigint NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  integration_id  text NOT NULL,
  site_id         int REFERENCES sites(id) ON DELETE SET NULL,
  alert_type      text NOT NULL,
  severity        text NOT NULL,
  message         text NOT NULL,
  fingerprint     text NOT NULL,
  metadata        jsonb,
  status          text NOT NULL DEFAULT 'active',
  suppressed_by   text REFERENCES users(id),
  suppressed_at   timestamptz,
  resolved_at     timestamptz,
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  sync_id         uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE(fingerprint)
);

CREATE INDEX idx_entity_alerts_tenant_status ON entity_alerts(tenant_id, status);
CREATE INDEX idx_entity_alerts_entity ON entity_alerts(entity_id);
CREATE INDEX idx_entity_alerts_site ON entity_alerts(site_id) WHERE site_id IS NOT NULL;
CREATE INDEX idx_entity_alerts_severity ON entity_alerts(tenant_id, severity) WHERE status = 'active';

-- ============================================================================
-- entity_relationships — links between entities
-- ============================================================================
CREATE TABLE entity_relationships (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id          int NOT NULL REFERENCES tenants(id),
  integration_id     text NOT NULL,
  parent_entity_id   bigint NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  child_entity_id    bigint NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relationship_type  text NOT NULL,
  metadata           jsonb,
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  sync_id            uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  UNIQUE(parent_entity_id, child_entity_id, relationship_type)
);

CREATE INDEX idx_entity_rel_parent ON entity_relationships(parent_entity_id);
CREATE INDEX idx_entity_rel_child ON entity_relationships(child_entity_id);
CREATE INDEX idx_entity_rel_type ON entity_relationships(relationship_type);

-- ============================================================================
-- sync_jobs — frontend ↔ pipeline bridge
-- ============================================================================
CREATE TABLE sync_jobs (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       int NOT NULL REFERENCES tenants(id),
  integration_id  text NOT NULL,
  entity_type     text,
  site_id         int REFERENCES sites(id) ON DELETE SET NULL,

  status          text NOT NULL DEFAULT 'pending',
  priority        int NOT NULL DEFAULT 5,

  bullmq_job_id   text,

  trigger         text NOT NULL DEFAULT 'manual',
  scheduled_for   timestamptz,

  sync_id         uuid NOT NULL DEFAULT gen_random_uuid(),
  started_at      timestamptz,
  completed_at    timestamptz,

  metrics         jsonb,
  error           text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_jobs_pending ON sync_jobs(status, scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_sync_jobs_tenant ON sync_jobs(tenant_id, created_at DESC);
CREATE INDEX idx_sync_jobs_integration ON sync_jobs(integration_id, status);

-- ============================================================================
-- Row Level Security
-- ============================================================================
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;

-- Service role bypass (pipeline uses service key)
CREATE POLICY "Service role full access" ON entities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON entity_tags FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON entity_alerts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON entity_relationships FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON sync_jobs FOR ALL USING (true) WITH CHECK (true);

-- Tenant-scoped read for authenticated users
CREATE POLICY "Tenant read entities" ON entities FOR SELECT
  USING (tenant_id = (current_setting('app.tenant_id', true))::int);

CREATE POLICY "Tenant read entity_tags" ON entity_tags FOR SELECT
  USING (entity_id IN (SELECT id FROM entities WHERE tenant_id = (current_setting('app.tenant_id', true))::int));

CREATE POLICY "Tenant read entity_alerts" ON entity_alerts FOR SELECT
  USING (tenant_id = (current_setting('app.tenant_id', true))::int);

CREATE POLICY "Tenant read entity_relationships" ON entity_relationships FOR SELECT
  USING (tenant_id = (current_setting('app.tenant_id', true))::int);

CREATE POLICY "Tenant read sync_jobs" ON sync_jobs FOR SELECT
  USING (tenant_id = (current_setting('app.tenant_id', true))::int);

-- Tenant-scoped insert for sync_jobs (manual triggers from frontend)
CREATE POLICY "Tenant insert sync_jobs" ON sync_jobs FOR INSERT
  WITH CHECK (tenant_id = (current_setting('app.tenant_id', true))::int);

-- Tenant-scoped update for entity_alerts (suppression from frontend)
CREATE POLICY "Tenant update entity_alerts" ON entity_alerts FOR UPDATE
  USING (tenant_id = (current_setting('app.tenant_id', true))::int)
  WITH CHECK (tenant_id = (current_setting('app.tenant_id', true))::int);
