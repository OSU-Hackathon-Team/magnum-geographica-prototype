export const SCHEMA_VERSION = 1;

export const OFFLINE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS systems (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  external_url TEXT,
  boundary_wkb BLOB,
  min_lon REAL,
  max_lon REAL,
  min_lat REAL,
  max_lat REAL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trails (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  difficulty TEXT,
  length_meters REAL,
  elevation_gain_meters REAL,
  geometry_wkb BLOB,
  min_lon REAL,
  max_lon REAL,
  min_lat REAL,
  max_lat REAL,
  verified INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trail_systems (
  trail_id TEXT NOT NULL,
  system_id TEXT NOT NULL,
  PRIMARY KEY (trail_id, system_id)
);

CREATE TABLE IF NOT EXISTS trail_segments (
  id TEXT PRIMARY KEY,
  trail_id TEXT NOT NULL,
  name TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  surface_type TEXT,
  hazards TEXT NOT NULL DEFAULT '[]',
  is_road_connector INTEGER NOT NULL DEFAULT 0,
  steep_grade INTEGER NOT NULL DEFAULT 0,
  one_way INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  length_meters REAL,
  geometry_wkb BLOB,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS features (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type_tag TEXT NOT NULL,
  description TEXT,
  trail_id TEXT,
  system_id TEXT,
  lon REAL,
  lat REAL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wiki_pages (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content_md TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  UNIQUE (target_type, target_id)
);

CREATE TABLE IF NOT EXISTS revisions (
  id TEXT PRIMARY KEY,
  wiki_page_id TEXT NOT NULL,
  content_md TEXT NOT NULL,
  contributor_name TEXT NOT NULL DEFAULT 'anonymous',
  edit_summary TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS citations (
  id TEXT PRIMARY KEY,
  wiki_page_id TEXT NOT NULL,
  url TEXT,
  title TEXT NOT NULL,
  image_data BLOB,
  image_mime_type TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS downloaded_packs (
  system_id TEXT PRIMARY KEY,
  system_name TEXT NOT NULL,
  tile_size_bytes INTEGER NOT NULL DEFAULT 0,
  geojson_size_bytes INTEGER NOT NULL DEFAULT 0,
  wiki_size_bytes INTEGER NOT NULL DEFAULT 0,
  mbtiles_data BLOB,
  geojson_data BLOB,
  wiki_data TEXT,
  generated_at TEXT,
  last_synced TEXT
);

CREATE TABLE IF NOT EXISTS pending_contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  payload TEXT NOT NULL,
  contributor_name TEXT NOT NULL DEFAULT 'anonymous',
  created_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  server_id TEXT,
  conflict_revision_id TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  name,
  type,
  description,
  content='',
  tokenize='porter unicode61'
);

CREATE INDEX IF NOT EXISTS idx_offline_systems_slug ON systems(slug);
CREATE INDEX IF NOT EXISTS idx_offline_trails_slug ON trails(slug);
CREATE INDEX IF NOT EXISTS idx_offline_segments_trail ON trail_segments(trail_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_offline_features_trail ON features(trail_id);
CREATE INDEX IF NOT EXISTS idx_offline_features_system ON features(system_id);
CREATE INDEX IF NOT EXISTS idx_offline_wiki_target ON wiki_pages(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_offline_revisions_page ON revisions(wiki_page_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offline_pending_status ON pending_contributions(sync_status);
`;
