PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS prescreening_agents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_title TEXT NOT NULL,
  company TEXT NOT NULL,
  criteria_json TEXT NOT NULL DEFAULT '{}',
  knockout_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'paused')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prescreening_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES prescreening_agents(id) ON DELETE CASCADE,
  candidate_alias TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('disqualified', 'needs_review', 'qualified')),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  decision_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prescreening_messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES prescreening_sessions(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('agent', 'candidate', 'system')),
  message_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prescreening_decisions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES prescreening_sessions(id) ON DELETE CASCADE,
  minimum_criteria_json TEXT NOT NULL DEFAULT '[]',
  risks_json TEXT NOT NULL DEFAULT '[]',
  recommendation TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prescreening_agents_tenant_created
  ON prescreening_agents(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prescreening_sessions_tenant_created
  ON prescreening_sessions(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prescreening_messages_session
  ON prescreening_messages(session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_prescreening_decisions_session
  ON prescreening_decisions(session_id, created_at DESC);
