PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS achievement_profiles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_alias TEXT NOT NULL,
  source_label TEXT NOT NULL,
  summary TEXT NOT NULL,
  profile_score INTEGER NOT NULL CHECK (profile_score BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review_ready', 'verified')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS achievement_profile_cards (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES achievement_profiles(id) ON DELETE CASCADE,
  card_type TEXT NOT NULL CHECK (card_type IN ('credential', 'leadership', 'metric', 'project')),
  title TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  metrics_json TEXT NOT NULL DEFAULT '[]',
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'rejected', 'verified')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS credential_verifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES achievement_profiles(id) ON DELETE CASCADE,
  card_id TEXT REFERENCES achievement_profile_cards(id) ON DELETE SET NULL,
  credential_label TEXT NOT NULL,
  issuer TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rejected', 'verified')),
  evidence_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_achievement_profiles_tenant_created
  ON achievement_profiles(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_achievement_cards_profile
  ON achievement_profile_cards(profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credential_verifications_profile
  ON credential_verifications(profile_id, created_at DESC);
