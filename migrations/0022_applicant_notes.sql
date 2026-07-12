-- Phase D #4: internal team notes on an applicant (never visible to the
-- candidate) with @mention support.
CREATE TABLE IF NOT EXISTS applicant_notes (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  mentioned_user_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_applicant_notes_application ON applicant_notes(application_id, created_at ASC);
