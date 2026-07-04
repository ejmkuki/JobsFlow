PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ats_connections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('greenhouse', 'lever', 'workday')),
  account_label TEXT NOT NULL,
  oauth_status TEXT NOT NULL DEFAULT 'disconnected' CHECK (oauth_status IN ('connected', 'disconnected', 'needs_reauth')),
  scopes_json TEXT NOT NULL DEFAULT '[]',
  token_reference TEXT,
  last_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, provider)
);

CREATE TABLE IF NOT EXISTS ats_sync_mappings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES ats_connections(id) ON DELETE CASCADE,
  local_entity TEXT NOT NULL,
  remote_entity TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('bidirectional', 'inbound', 'outbound')),
  field_map_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ats_sync_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES ats_connections(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('bidirectional', 'inbound', 'outbound')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('blocked', 'completed', 'failed', 'queued')),
  started_at TEXT,
  completed_at TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ats_sync_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sync_run_id TEXT NOT NULL REFERENCES ats_sync_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  local_record_ref TEXT NOT NULL,
  remote_record_ref TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('blocked', 'mapped', 'skipped', 'synced')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ats_connections_tenant_provider
  ON ats_connections(tenant_id, provider);

CREATE INDEX IF NOT EXISTS idx_ats_sync_mappings_connection
  ON ats_sync_mappings(connection_id, active);

CREATE INDEX IF NOT EXISTS idx_ats_sync_runs_tenant_created
  ON ats_sync_runs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ats_sync_events_run
  ON ats_sync_events(sync_run_id, created_at DESC);
