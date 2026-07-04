PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS job_syndication_posts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT NOT NULL,
  employment_type TEXT NOT NULL CHECK (employment_type IN ('contract', 'full_time', 'part_time', 'temporary')),
  description TEXT NOT NULL,
  salary_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('blocked', 'draft', 'queued', 'published')),
  google_jobs_payload_json TEXT NOT NULL DEFAULT '{}',
  partner_payload_json TEXT NOT NULL DEFAULT '{}',
  validation_errors_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_syndication_deliveries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES job_syndication_posts(id) ON DELETE CASCADE,
  destination TEXT NOT NULL CHECK (destination IN ('google_jobs_markup', 'partner_network', 'workflowfy_digest')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('blocked', 'delivered', 'failed', 'queued')),
  request_json TEXT NOT NULL DEFAULT '{}',
  response_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_job_syndication_posts_tenant_created
  ON job_syndication_posts(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_syndication_posts_tenant_status
  ON job_syndication_posts(tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_syndication_deliveries_post
  ON job_syndication_deliveries(post_id, created_at DESC);
