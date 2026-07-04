PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS salary_blueprints (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT NOT NULL,
  employment_type TEXT NOT NULL CHECK (employment_type IN ('contract', 'full_time', 'part_time', 'temporary')),
  source_type TEXT NOT NULL CHECK (source_type IN ('candidate_reported', 'contract_verified', 'employer_posted', 'platform_estimate')),
  verification_status TEXT NOT NULL CHECK (verification_status IN ('pending', 'verified', 'anonymized', 'rejected')),
  salary_min_cents INTEGER NOT NULL CHECK (salary_min_cents >= 0),
  salary_max_cents INTEGER NOT NULL CHECK (salary_max_cents >= salary_min_cents),
  currency TEXT NOT NULL DEFAULT 'USD',
  work_arrangement TEXT NOT NULL CHECK (work_arrangement IN ('hybrid', 'onsite', 'remote', 'unknown')),
  confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS culture_blueprints (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  signal_key TEXT NOT NULL,
  signal_label TEXT NOT NULL,
  sentiment TEXT NOT NULL CHECK (sentiment IN ('mixed', 'negative', 'positive')),
  evidence_json TEXT NOT NULL DEFAULT '[]',
  verification_count INTEGER NOT NULL DEFAULT 0 CHECK (verification_count >= 0),
  anonymity_floor_met INTEGER NOT NULL DEFAULT 0 CHECK (anonymity_floor_met IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transparency_reports (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_role TEXT NOT NULL,
  target_company TEXT NOT NULL,
  location TEXT NOT NULL,
  salary_percentile_json TEXT NOT NULL DEFAULT '{}',
  culture_summary_json TEXT NOT NULL DEFAULT '[]',
  risk_flags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_salary_blueprints_tenant_company
  ON salary_blueprints(tenant_id, company, role_title, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_culture_blueprints_tenant_company
  ON culture_blueprints(tenant_id, company, signal_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transparency_reports_tenant_created
  ON transparency_reports(tenant_id, created_at DESC);
