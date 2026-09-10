CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS showcases (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text NOT NULL,
  target_url text NOT NULL,
  mode text NOT NULL DEFAULT 'selected_routes' CHECK (mode IN ('selected_routes')),
  routes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(routes) = 'array'),
  state text NOT NULL CHECK (state IN ('CREATED', 'PREPARING', 'ACTIVE', 'AUTHENTICATION_EXPIRED', 'ERROR')),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS authentication_configs (
  id uuid PRIMARY KEY,
  showcase_id uuid NOT NULL UNIQUE REFERENCES showcases(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('token', 'password', 'manual_session')),
  config jsonb NOT NULL,
  encrypted_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  showcase_id uuid NOT NULL UNIQUE REFERENCES showcases(id) ON DELETE CASCADE,
  encrypted_state text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS showcase_visits (
  id uuid PRIMARY KEY,
  showcase_id uuid NOT NULL REFERENCES showcases(id) ON DELETE CASCADE,
  status integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS showcase_visits_showcase_created_idx
  ON showcase_visits(showcase_id, created_at DESC);
