-- Phase C: filtered job browse, bookmarking, saved-search alerts.

-- Supports the structured browse filters (workplace/employment type) added
-- to GET /api/jobs alongside the existing status+created_at scan.
CREATE INDEX IF NOT EXISTS idx_jobs_open_filters ON jobs(status, workplace_type, employment_type, created_at DESC);

-- Bookmark a job without applying yet.
CREATE TABLE IF NOT EXISTS saved_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_saved_jobs_tenant ON saved_jobs(tenant_id, created_at DESC);

-- A candidate's saved search criteria, re-run periodically (see
-- functions/api/saved-search-alerts.ts) to email/notify about new matching
-- postings since the last check.
CREATE TABLE IF NOT EXISTS saved_searches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  query TEXT NOT NULL DEFAULT '',
  workplace_type TEXT,
  employment_type TEXT,
  salary_min_cents INTEGER,
  last_checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_saved_searches_tenant ON saved_searches(tenant_id, created_at DESC);
