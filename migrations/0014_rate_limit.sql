PRAGMA foreign_keys = ON;

-- Fixed-window rate limiting. One row per (bucket_key, window_start); the count
-- is incremented per request and compared against the endpoint's limit. Rows
-- from expired windows are pruned opportunistically by the limiter.
CREATE TABLE IF NOT EXISTS rate_limit_hits (
  bucket_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_window
  ON rate_limit_hits (window_start);
