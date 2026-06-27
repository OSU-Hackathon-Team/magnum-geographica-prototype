-- Permission restructure migration
-- 1. Tighten votes.user_id to NOT NULL (anonymous votes rejected at route layer)
-- 2. Add FK constraints from author columns to users(id)

-- Remove any lingering NULL user_id votes (should not exist, but safety first)
DELETE FROM votes WHERE user_id IS NULL;

-- Make votes.user_id NOT NULL
ALTER TABLE votes ALTER COLUMN user_id SET NOT NULL;

-- Add FK constraints from author/creator columns to users(id)
-- These are nullable (except votes.user_id) because IP users have no user row.

ALTER TABLE systems
  ADD CONSTRAINT fk_systems_created_by_user
  FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE trails
  ADD CONSTRAINT fk_trails_created_by_user
  FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE features
  ADD CONSTRAINT fk_features_created_by_user
  FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE presets
  ADD CONSTRAINT fk_presets_created_by
  FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE revisions
  ADD CONSTRAINT fk_revisions_author
  FOREIGN KEY (author_id) REFERENCES users(id);

ALTER TABLE votes
  ADD CONSTRAINT fk_votes_user
  FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE gps_traces
  ADD CONSTRAINT fk_gps_traces_user
  FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE trace_segment_votes
  ADD CONSTRAINT fk_trace_segment_votes_user
  FOREIGN KEY (user_id) REFERENCES users(id);
