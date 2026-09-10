ALTER TABLE showcases
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'selected_routes';

ALTER TABLE showcases
  ADD COLUMN IF NOT EXISTS routes jsonb NOT NULL DEFAULT '[]'::jsonb;

