CREATE TABLE IF NOT EXISTS trial_downloads (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  user_email TEXT NOT NULL,
  source_url TEXT NOT NULL,
  format_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
  object_key TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trial_downloads_status_created_at_idx
  ON trial_downloads (status, created_at);
