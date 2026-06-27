-- 0010_trail_provenance.sql
-- Add provenance columns and tier CHECK constraint to trails.
ALTER TABLE trails
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS source_date DATE,
  ADD COLUMN IF NOT EXISTS external_url TEXT,
  ADD COLUMN IF NOT EXISTS last_synthesized_at TIMESTAMPTZ;

-- Add a CHECK constraint on tier to enforce only valid values at the DB level.
ALTER TABLE trails
  DROP CONSTRAINT IF EXISTS trails_tier_check;
ALTER TABLE trails
  ADD CONSTRAINT trails_tier_check CHECK (tier IN ('premium', 'elevated', 'synthesized'));
