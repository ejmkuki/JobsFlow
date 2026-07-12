-- Phase D #3: minimum viable interview scheduling — the employer proposes
-- a handful of time slots, the candidate picks one, both sides get an .ics.
CREATE TABLE IF NOT EXISTS interview_proposals (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  employer_tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  candidate_tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  proposed_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slots TEXT NOT NULL DEFAULT '[]',
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  confirmed_start TEXT,
  confirmed_end TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_interview_proposals_application ON interview_proposals(application_id, created_at DESC);
