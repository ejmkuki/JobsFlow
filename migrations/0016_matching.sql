-- Phase 3: honest matching.
-- Server-computed match score + rationale on each application, and a place to
-- store the candidate's resume text (source of truth for matching).

-- Candidate resume text, one row per candidate tenant. Separate from the legacy
-- candidate_profiles table (which is keyed by id and holds preference data).
CREATE TABLE IF NOT EXISTS candidate_resume_profiles (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  headline TEXT NOT NULL DEFAULT '',
  resume_text TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Match metadata on each application. readiness_score keeps holding the numeric
-- score, but it is now server-computed (never client-supplied).
ALTER TABLE job_applications ADD COLUMN match_method TEXT NOT NULL DEFAULT 'unscored';
ALTER TABLE job_applications ADD COLUMN match_rationale TEXT NOT NULL DEFAULT '';
