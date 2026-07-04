PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS passive_sourcing_cards (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anonymous_handle TEXT NOT NULL,
  headline TEXT NOT NULL,
  target_roles_json TEXT NOT NULL DEFAULT '[]',
  masked_skills_json TEXT NOT NULL DEFAULT '[]',
  masked_achievements_json TEXT NOT NULL DEFAULT '[]',
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'recruiter_marketplace', 'paused')),
  contact_release_status TEXT NOT NULL DEFAULT 'locked' CHECK (contact_release_status IN ('locked', 'pending', 'approved')),
  current_employer_masked INTEGER NOT NULL DEFAULT 1 CHECK (current_employer_masked IN (0, 1)),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recruiter_card_broadcasts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES passive_sourcing_cards(id) ON DELETE CASCADE,
  recruiter_tenant_id TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('internal_marketplace', 'partner_network', 'talent_digest')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('blocked', 'queued', 'reviewed', 'sent')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  contact_redactions_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contact_release_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES passive_sourcing_cards(id) ON DELETE CASCADE,
  requester_name TEXT NOT NULL,
  requester_company TEXT NOT NULL,
  requester_email_hash TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('approved', 'denied', 'pending')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_passive_cards_tenant_updated
  ON passive_sourcing_cards(tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_passive_broadcasts_card_created
  ON recruiter_card_broadcasts(card_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_release_card_status
  ON contact_release_requests(card_id, status, created_at DESC);
