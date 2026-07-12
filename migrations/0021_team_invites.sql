-- Phase D #1: multi-seat employer tenants. The users/tenants schema already
-- allows multiple user rows per tenant_id (no uniqueness constraint) — what's
-- missing is (a) an owner marker for permission checks, and (b) a way for a
-- second person to actually land in an existing tenant instead of always
-- getting a fresh one at sign-in (see functions/api/session.ts).

ALTER TABLE tenants ADD COLUMN owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

-- Backfill: for every tenant that already exists, its earliest-created user
-- is the de facto owner (this is exactly what "one signup = one tenant" has
-- meant until now).
UPDATE tenants SET owner_user_id = (
  SELECT id FROM users WHERE users.tenant_id = tenants.id ORDER BY users.created_at ASC LIMIT 1
) WHERE owner_user_id IS NULL;

-- Invites are matched purely by email at normal sign-in time (see
-- session.ts) — no separate accept-link token needed, since whatever auth
-- mode is active (Clerk SSO, Cloudflare Access, bootstrap) already proves
-- email ownership before a session is issued.
CREATE TABLE IF NOT EXISTS tenant_invites (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('recruiter', 'hiring_manager')),
  invited_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  accepted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tenant_invites_email_status ON tenant_invites(invited_email, status);
CREATE INDEX IF NOT EXISTS idx_tenant_invites_tenant ON tenant_invites(tenant_id, created_at DESC);
