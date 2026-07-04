PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS application_pipeline_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  role_title TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  state TEXT NOT NULL CHECK (
    state IN (
      'discovered',
      'packet_review',
      'applied',
      'employer_review',
      'recruiter_screen',
      'interview',
      'offer',
      'closed',
      'archived'
    )
  ),
  employer_update_status TEXT NOT NULL CHECK (
    employer_update_status IN ('current', 'due_soon', 'overdue', 'not_required')
  ),
  employer_response_due_at TEXT,
  last_candidate_action_at TEXT,
  last_employer_action_at TEXT,
  salary_min_cents INTEGER,
  salary_max_cents INTEGER,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  notes_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pipeline_stage_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  pipeline_item_id TEXT NOT NULL REFERENCES application_pipeline_items(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('candidate', 'employer', 'system', 'policy')),
  from_state TEXT,
  to_state TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pipeline_follow_up_tasks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pipeline_item_id TEXT NOT NULL REFERENCES application_pipeline_items(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK (
    task_type IN ('candidate_reminder', 'employer_status_request', 'fallback_search', 'interview_prep', 'salary_review')
  ),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'sent', 'dismissed', 'blocked')),
  due_at TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email_draft', 'in_app', 'calendar', 'none')),
  draft_text TEXT NOT NULL,
  consent_required INTEGER NOT NULL DEFAULT 1 CHECK (consent_required IN (0, 1)),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pipeline_response_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  policy_key TEXT NOT NULL,
  stage TEXT NOT NULL,
  employer_sla_days INTEGER NOT NULL CHECK (employer_sla_days BETWEEN 1 AND 45),
  candidate_follow_up_days INTEGER NOT NULL CHECK (candidate_follow_up_days BETWEEN 1 AND 45),
  fallback_search_days INTEGER NOT NULL CHECK (fallback_search_days BETWEEN 1 AND 60),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, policy_key, stage)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_items_tenant_state
  ON application_pipeline_items(tenant_id, state, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_items_due
  ON application_pipeline_items(tenant_id, employer_update_status, employer_response_due_at);

CREATE INDEX IF NOT EXISTS idx_pipeline_events_item
  ON pipeline_stage_events(pipeline_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_followups_tenant_status
  ON pipeline_follow_up_tasks(tenant_id, status, due_at);

CREATE INDEX IF NOT EXISTS idx_pipeline_followups_item
  ON pipeline_follow_up_tasks(pipeline_item_id, status, due_at);

CREATE INDEX IF NOT EXISTS idx_pipeline_policies_tenant_stage
  ON pipeline_response_policies(tenant_id, stage, active);
