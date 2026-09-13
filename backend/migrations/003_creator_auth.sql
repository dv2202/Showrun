ALTER TABLE users
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS password_hash text;

CREATE TABLE IF NOT EXISTS oauth_accounts (
  provider text NOT NULL CHECK (provider IN ('github', 'google')),
  provider_account_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_account_id)
);

CREATE INDEX IF NOT EXISTS oauth_accounts_user_idx
  ON oauth_accounts(user_id);

CREATE TABLE IF NOT EXISTS creator_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creator_sessions_user_idx
  ON creator_sessions(user_id);

CREATE INDEX IF NOT EXISTS creator_sessions_expiry_idx
  ON creator_sessions(expires_at);

ALTER TABLE showcases DROP CONSTRAINT IF EXISTS showcases_mode_check;
ALTER TABLE showcases
  ADD CONSTRAINT showcases_mode_check
  CHECK (mode IN ('selected_routes', 'full_application'));
