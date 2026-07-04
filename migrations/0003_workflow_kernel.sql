PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workflow_definitions (
  id TEXT PRIMARY KEY,
  workflow_key TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  workspace TEXT NOT NULL CHECK (workspace IN ('candidate', 'employer', 'platform')),
  description TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  steps_json TEXT NOT NULL DEFAULT '[]',
  required_bindings_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workflow_key, version)
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  definition_id TEXT NOT NULL REFERENCES workflow_definitions(id) ON DELETE RESTRICT,
  workflow_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN (
      'pending',
      'running',
      'waiting_for_approval',
      'blocked',
      'completed',
      'failed',
      'canceled'
    )
  ),
  current_step TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 9),
  input_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  error_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT,
  completed_at TEXT,
  failed_at TEXT,
  last_event_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workflow_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  run_id TEXT REFERENCES workflow_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'system', 'integration', 'policy')),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS consent_receipts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  workflow_run_id TEXT REFERENCES workflow_runs(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  scope_json TEXT NOT NULL DEFAULT '{}',
  preview_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revoked', 'expired')),
  expires_at TEXT,
  approved_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automation_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  policy_key TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('review_only', 'copilot', 'guarded_autopilot')),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  daily_limit INTEGER NOT NULL DEFAULT 0 CHECK (daily_limit >= 0),
  requires_consent INTEGER NOT NULL DEFAULT 1 CHECK (requires_consent IN (0, 1)),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  rules_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, policy_key)
);

CREATE TABLE IF NOT EXISTS integration_accounts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  account_label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('not_connected', 'connected', 'needs_reauth', 'disabled')),
  scopes_json TEXT NOT NULL DEFAULT '[]',
  token_reference TEXT,
  expires_at TEXT,
  last_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, provider, account_label)
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_run_id TEXT REFERENCES workflow_runs(id) ON DELETE SET NULL,
  destination TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'delivered', 'failed', 'blocked')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TEXT,
  last_error TEXT,
  request_json TEXT NOT NULL DEFAULT '{}',
  response_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workflow_definitions_key
  ON workflow_definitions(workflow_key, active);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_tenant_state
  ON workflow_runs(tenant_id, state, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_subject
  ON workflow_runs(tenant_id, subject_type, subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_events_run_created
  ON workflow_events(run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_events_tenant_created
  ON workflow_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_consent_receipts_tenant_status
  ON consent_receipts(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_policies_tenant
  ON automation_policies(tenant_id, enabled, policy_key);

CREATE INDEX IF NOT EXISTS idx_integration_accounts_tenant_provider
  ON integration_accounts(tenant_id, provider, status);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant_status
  ON webhook_deliveries(tenant_id, status, next_attempt_at);
