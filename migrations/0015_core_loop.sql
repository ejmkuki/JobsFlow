PRAGMA foreign_keys = ON;

-- Real employer job postings. This is the supply side of the marketplace: a
-- job is a first-class, tenant-owned entity that candidates can browse and
-- apply to.
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  employer_tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'Remote',
  employment_type TEXT NOT NULL DEFAULT 'full_time' CHECK (
    employment_type IN ('full_time', 'part_time', 'contract', 'internship')
  ),
  workplace_type TEXT NOT NULL DEFAULT 'remote' CHECK (
    workplace_type IN ('remote', 'hybrid', 'onsite')
  ),
  description TEXT NOT NULL DEFAULT '',
  required_skills TEXT NOT NULL DEFAULT '[]',
  salary_min_cents INTEGER,
  salary_max_cents INTEGER,
  salary_currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'paused', 'closed')),
  applicant_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The marketplace link: one row per candidate application to a job. Scoped to
-- BOTH the employer tenant (who reads applicants) and the candidate tenant (who
-- reads their own applications). The UNIQUE constraint enforces duplicate
-- prevention -- a candidate can apply to a given job only once.
CREATE TABLE IF NOT EXISTS job_applications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  employer_tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  candidate_tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  candidate_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  resume_artifact_id TEXT REFERENCES resume_artifacts(id) ON DELETE SET NULL,
  packet_id TEXT REFERENCES application_packets(id) ON DELETE SET NULL,
  cover_note TEXT NOT NULL DEFAULT '',
  readiness_score INTEGER NOT NULL DEFAULT 0 CHECK (readiness_score BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (
    status IN ('submitted', 'employer_review', 'screen', 'interview', 'offer', 'rejected', 'withdrawn')
  ),
  employer_sla_due_at TEXT,
  last_status_change_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (job_id, candidate_tenant_id)
);

-- Immutable stage-change trail for each application. Employer actions here are
-- what drive the anti-ghosting SLA -- no seeded data.
CREATE TABLE IF NOT EXISTS job_application_events (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('candidate', 'employer', 'system')),
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_employer ON jobs(employer_tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_apps_employer ON job_applications(employer_tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_apps_candidate ON job_applications(candidate_tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_apps_job ON job_applications(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_app_events_app ON job_application_events(application_id, created_at DESC);
