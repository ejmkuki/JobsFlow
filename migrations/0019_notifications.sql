-- In-app notification center (bell icon + unread count), the free-tier
-- baseline delivery channel — email (functions/_email.ts, Resend) is the
-- always-on channel for the same events. One row per event per recipient
-- tenant; read_at NULL means unread.
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link_path TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_created ON notifications(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_unread ON notifications(tenant_id, read_at);

-- Tracks whether the employer has already been notified that this specific
-- application's SLA clock is overdue, so the periodic SLA check (see
-- functions/api/sla-check.ts) never sends the same breach notification
-- twice. Cleared whenever the SLA clock resets (advance, reapply).
ALTER TABLE job_applications ADD COLUMN sla_breach_notified_at TEXT;
