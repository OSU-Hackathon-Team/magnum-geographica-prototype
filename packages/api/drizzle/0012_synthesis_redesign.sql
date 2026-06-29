-- Phase 10: Synthesis Redesign & Canonical Segments
--
-- 1. Rename trail tier 'elevated' → 'frozen'
-- 2. Add new columns to trail_segments
-- 3. Create trace_annotations table
-- 4. Create synthesis_jobs table
-- 5. Add segments_emitted to synthesis_runs

-- 1. Drop old CHECK constraint and re-add with 'frozen'
ALTER TABLE trails DROP CONSTRAINT IF EXISTS trails_tier_check;
ALTER TABLE trails
  ADD CONSTRAINT trails_tier_check
  CHECK (tier IN ('premium', 'frozen', 'synthesized'));

-- Update existing rows
UPDATE trails SET tier = 'frozen' WHERE tier = 'elevated';

-- 2. Add new columns to trail_segments
ALTER TABLE trail_segments
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'synthesis'
    CHECK (source IN ('synthesis', 'editor'));

ALTER TABLE trail_segments
  ADD COLUMN IF NOT EXISTS consensus DOUBLE PRECISION;

ALTER TABLE trail_segments
  ADD COLUMN IF NOT EXISTS last_synthesized_at TIMESTAMPTZ;

ALTER TABLE trail_segments
  ADD COLUMN IF NOT EXISTS is_pseudo_trail BOOLEAN NOT NULL DEFAULT false;

-- 3. Create trace_annotations table
CREATE TABLE IF NOT EXISTS trace_annotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trace_id UUID NOT NULL REFERENCES gps_traces(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    value TEXT,
    point GEOMETRY(Point, 4326) NOT NULL,
    trace_index INTEGER NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    user_id UUID REFERENCES users(id),
    contributor_name TEXT NOT NULL DEFAULT 'anonymous',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trace_annotations_trace
  ON trace_annotations(trace_id, trace_index);

CREATE INDEX IF NOT EXISTS idx_trace_annotations_point
  ON trace_annotations USING GIST (point);

-- 4. Create synthesis_jobs table
CREATE TABLE IF NOT EXISTS synthesis_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_id UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    scope TEXT NOT NULL DEFAULT 'incremental',
    trigger_trace_id UUID REFERENCES gps_traces(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error TEXT,
    trails_updated INTEGER NOT NULL DEFAULT 0,
    segments_emitted INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_synthesis_jobs_pending
  ON synthesis_jobs(status, created_at);

-- 5. Add segments_emitted to synthesis_runs
ALTER TABLE synthesis_runs
  ADD COLUMN IF NOT EXISTS segments_emitted INTEGER NOT NULL DEFAULT 0;
