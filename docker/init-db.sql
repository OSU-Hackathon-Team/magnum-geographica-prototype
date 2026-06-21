-- Magnum database initialization
-- Run by docker-entrypoint-initdb.d on first postgres boot

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- FTS indexes are created in Drizzle migrations (Phase 2+).
