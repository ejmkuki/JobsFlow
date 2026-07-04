PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS skill_taxonomy_nodes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  skill_key TEXT NOT NULL,
  label TEXT NOT NULL,
  parent_key TEXT,
  related_skills_json TEXT NOT NULL DEFAULT '[]',
  vector_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, skill_key)
);

CREATE TABLE IF NOT EXISTS employer_role_requirements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_title TEXT NOT NULL,
  company TEXT NOT NULL,
  required_skills_json TEXT NOT NULL DEFAULT '[]',
  adjacent_skills_json TEXT NOT NULL DEFAULT '[]',
  minimum_signals_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS candidate_skill_profiles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_alias TEXT NOT NULL,
  skills_json TEXT NOT NULL DEFAULT '[]',
  achievements_json TEXT NOT NULL DEFAULT '[]',
  vector_documents_json TEXT NOT NULL DEFAULT '[]',
  visibility TEXT NOT NULL DEFAULT 'internal_review' CHECK (visibility IN ('internal_review', 'shortlist_ready', 'archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS semantic_match_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_requirement_id TEXT NOT NULL REFERENCES employer_role_requirements(id) ON DELETE CASCADE,
  candidate_profile_id TEXT NOT NULL REFERENCES candidate_skill_profiles(id) ON DELETE CASCADE,
  match_score INTEGER NOT NULL CHECK (match_score BETWEEN 0 AND 100),
  matched_skills_json TEXT NOT NULL DEFAULT '[]',
  adjacent_matches_json TEXT NOT NULL DEFAULT '[]',
  gaps_json TEXT NOT NULL DEFAULT '[]',
  explanation_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_skill_taxonomy_tenant_skill
  ON skill_taxonomy_nodes(tenant_id, skill_key);

CREATE INDEX IF NOT EXISTS idx_role_requirements_tenant_created
  ON employer_role_requirements(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_skill_profiles_tenant_created
  ON candidate_skill_profiles(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_semantic_match_runs_tenant_created
  ON semantic_match_runs(tenant_id, created_at DESC);
