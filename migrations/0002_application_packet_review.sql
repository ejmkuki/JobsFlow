PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS application_packets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_role TEXT NOT NULL,
  target_company TEXT NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN (
      'draft',
      'evidence_review',
      'candidate_approval_required',
      'approved',
      'blocked',
      'closed'
    )
  ),
  readiness_score INTEGER NOT NULL CHECK (readiness_score BETWEEN 0 AND 100),
  skill_coverage_score INTEGER NOT NULL CHECK (skill_coverage_score BETWEEN 0 AND 100),
  proof_strength TEXT NOT NULL CHECK (proof_strength IN ('light', 'moderate', 'strong')),
  salary_floor_cents INTEGER NOT NULL DEFAULT 0,
  salary_min_cents INTEGER,
  salary_max_cents INTEGER,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  gaps_json TEXT NOT NULL DEFAULT '[]',
  safeguards_json TEXT NOT NULL DEFAULT '[]',
  required_reviews_json TEXT NOT NULL DEFAULT '[]',
  external_action_blocked INTEGER NOT NULL DEFAULT 1 CHECK (external_action_blocked IN (0, 1)),
  external_action_block_reason TEXT NOT NULL DEFAULT 'prototype_external_actions_disabled',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS review_gates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  packet_id TEXT NOT NULL REFERENCES application_packets(id) ON DELETE CASCADE,
  gate_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'blocked', 'dismissed')),
  reason TEXT NOT NULL,
  required_action TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS state_transitions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  reason TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_application_packets_tenant_created
  ON application_packets(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_application_packets_tenant_state
  ON application_packets(tenant_id, state, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_gates_packet_status
  ON review_gates(packet_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_state_transitions_subject
  ON state_transitions(subject_type, subject_id, created_at DESC);
