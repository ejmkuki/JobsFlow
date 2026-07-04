PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS resume_fact_sets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resume_artifact_id TEXT REFERENCES resume_artifacts(id) ON DELETE SET NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('artifact_metadata', 'manual_seed', 'pasted_text')),
  source_label TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  facts_json TEXT NOT NULL DEFAULT '{}',
  skills_json TEXT NOT NULL DEFAULT '[]',
  achievements_json TEXT NOT NULL DEFAULT '[]',
  metrics_json TEXT NOT NULL DEFAULT '[]',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_targets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  description_hash TEXT NOT NULL,
  description_excerpt TEXT NOT NULL,
  required_skills_json TEXT NOT NULL DEFAULT '[]',
  responsibilities_json TEXT NOT NULL DEFAULT '[]',
  seniority_signals_json TEXT NOT NULL DEFAULT '[]',
  compensation_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vector_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('analysis', 'job_target', 'resume_fact_set')),
  source_id TEXT NOT NULL,
  namespace TEXT NOT NULL,
  vector_key TEXT NOT NULL UNIQUE,
  text_hash TEXT NOT NULL,
  text_excerpt TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('embedded', 'failed', 'pending', 'skipped')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS resume_tailoring_analyses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resume_fact_set_id TEXT NOT NULL REFERENCES resume_fact_sets(id) ON DELETE CASCADE,
  job_target_id TEXT NOT NULL REFERENCES job_targets(id) ON DELETE CASCADE,
  workflow_run_id TEXT REFERENCES workflow_runs(id) ON DELETE SET NULL,
  readiness_score INTEGER NOT NULL CHECK (readiness_score BETWEEN 0 AND 100),
  skill_coverage_score INTEGER NOT NULL CHECK (skill_coverage_score BETWEEN 0 AND 100),
  semantic_overlap_score INTEGER NOT NULL CHECK (semantic_overlap_score BETWEEN 0 AND 100),
  proof_strength TEXT NOT NULL CHECK (proof_strength IN ('light', 'moderate', 'strong')),
  matched_skills_json TEXT NOT NULL DEFAULT '[]',
  missing_skills_json TEXT NOT NULL DEFAULT '[]',
  coachable_gaps_json TEXT NOT NULL DEFAULT '[]',
  evidence_json TEXT NOT NULL DEFAULT '[]',
  recommendations_json TEXT NOT NULL DEFAULT '[]',
  vector_documents_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_resume_fact_sets_tenant_created
  ON resume_fact_sets(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_resume_fact_sets_artifact
  ON resume_fact_sets(resume_artifact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_targets_tenant_created
  ON job_targets(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vector_documents_tenant_status
  ON vector_documents(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vector_documents_source
  ON vector_documents(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_resume_tailoring_tenant_created
  ON resume_tailoring_analyses(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_resume_tailoring_resume
  ON resume_tailoring_analyses(resume_fact_set_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_resume_tailoring_job
  ON resume_tailoring_analyses(job_target_id, created_at DESC);
