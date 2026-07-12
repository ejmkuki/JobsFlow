-- Phase D #2: structured interview scorecards. A template defines weighted
-- criteria (tenant-wide default, or overridden per job); each interviewer
-- files one submission per application, and submissions aggregate into a
-- weighted score + recommendation tally.
CREATE TABLE IF NOT EXISTS scorecard_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  criteria TEXT NOT NULL DEFAULT '[]',
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scorecard_templates_tenant ON scorecard_templates(tenant_id, job_id);

CREATE TABLE IF NOT EXISTS scorecard_submissions (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES scorecard_templates(id) ON DELETE CASCADE,
  interviewer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scores TEXT NOT NULL DEFAULT '{}',
  recommendation TEXT NOT NULL CHECK (recommendation IN ('strong_yes', 'yes', 'no', 'strong_no')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (application_id, interviewer_user_id)
);
CREATE INDEX IF NOT EXISTS idx_scorecard_submissions_application ON scorecard_submissions(application_id, created_at ASC);
