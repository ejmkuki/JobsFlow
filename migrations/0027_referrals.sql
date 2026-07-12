-- Phase F #4: candidate refers a role to a friend, with attribution. A code
-- is scoped to one candidate tenant + one job (a candidate shares a specific
-- role, not a blanket "refer anyone to anything" link).
CREATE TABLE IF NOT EXISTS referral_codes (
  code TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_referral_codes_tenant ON referral_codes(tenant_id, created_at DESC);

-- Nullable, SET NULL — losing the referrer's tenant should never take the
-- application itself down with it.
ALTER TABLE job_applications ADD COLUMN referred_by_tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL;
