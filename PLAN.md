# Magnum — Wikipedia for Trails

> A React Native (mobile + web) app for browsing, editing, and annotating trail maps.
> Offline-first on mobile. Self-hostable via Docker. FOSS map stack.

---

## 1. Vision

A community-edited atlas of trails. Every trail has a wiki page covering conditions, hazards, access rules, and seasonal notes. Systems (parks, forests, city networks) organize trails hierarchically. Users annotate the map with landmarks and segment metadata. Everything works offline — download a region, hike with no signal, edit and contribute, sync when back online.

**Not** a general street map. Only trails (with road connectors marked as such). No private property.

---

## 2. Scope

### 2.1 Included

- Natural-surface trails, paved paths, trail connectors along roads (marked explicitly)
- Landmarks / Features: trailheads, shelters, water sources, scenic points, signage
- Systems: parks, forests, preserves, city trail networks (with boundary polygons)
- Wiki pages: practical, trail-specific info (conditions, hazards, access, fees, seasonal notes)
- Annotations on the map (features, segment metadata overrides)
- Offline mode: pre-download regions, work offline, sync contributions later

### 2.2 Excluded

- General streets / urban navigation
- Private residences or personal markers
- Long-form history or general encyclopedic content (link to Wikipedia instead)
- Copy-pasted content from external sources

---

## 3. Data Model — System Tiers

```
Super-System (0)  ← conceptual grouping (e.g., "Ohio Erie Trail")
    │
System (1)        ← park, forest, preserve, city network (has boundary geometry)
    │
Sub-System (1.b)  ← optional; trailhead grouping within a System
    │
Trail (2)         ← one continuous route (has line geometry)
    │
Trail Segment (2) ← subdivision of a Trail with metadata overrides (has line geometry)
    │
Feature (3)       ← point of interest (trailhead, shelter, etc.)
```

### Rules

- A child can belong to multiple parents (e.g., Trail in multiple Systems)
- Don't skip tiers (no Trail directly under Super-System)
- Sub-Systems are optional — omit if no clear local grouping exists
- Super-Systems: mark as "Unofficial" if self-organized or ethically questionable
- Segments are **first-class** objects with their own geometry
- Features must be observable from public land

---

## 4. Content Guidelines — Wiki Pages

### Purpose

Provide practical, trail-specific information. Focus on what it's like to **experience and maintain** the trail.

### Include

- Trail conditions, common hazards, access rules
- Seasonal notes, closures, restrictions
- Parking, entry fees, permit requirements
- Links to official pages or external references
- Water availability, shade coverage, difficulty notes

### Avoid

- Long-form history or regional info (belongs on Wikipedia)
- Copying content from Wikipedia or external sources
- Personal trip reports or opinions
- Redundant restatements of what Wikipedia already covers

### Citations

- Official website is preferred
- Images of signs or rule boards are acceptable
- Link to detailed Wikipedia article rather than restating it

---

## 5. Architecture

### 5.1 Monorepo Layout

```
magnum/
  packages/
    app/              # Expo (React Native + React Native Web)
    api/              # Bun + Hono (TypeScript)
    shared/           # Types, validation schemas, API client, constants
    map/              # OpenLayers abstraction (shared web + mobile bridge)
  docker/
    docker-compose.yml
    api.Dockerfile
    martin.conf
  PLAN.md
  package.json        # root workspace
  turbo.json
```

### 5.2 Tech Stack

| Layer      | Choice                                          | Rationale                                |
| ---------- | ----------------------------------------------- | ---------------------------------------- |
| Mobile     | Expo SDK 52+, React Native 0.76+                | Managed workflow, OTA updates            |
| Web        | React Native Web (via Expo)                     | Single codebase, feature parity          |
| State      | Zustand                                         | Minimal, works on RN + web identically   |
| Nav        | expo-router (file-based)                        | Shared navigation between web + mobile   |
| Maps       | OpenLayers 10                                   | FOSS, mature, vector tile support        |
| Tiles      | OpenMapTiles schema, Martin tile server         | FOSS, PostGIS-backed, MBTiles export     |
| Offline DB | op-sqlite (Android), expo-sqlite (web fallback) | Fast SQLite bindings                     |
| Backend    | Bun + Hono 4                                    | Fast, TypeScript-native, easy Docker     |
| ORM        | Drizzle ORM                                     | Type-safe, good PostGIS support          |
| DB         | PostgreSQL 16 + PostGIS 3                       | Spatial queries, proven                  |
| Media      | BYTEA in PG (MVP) → MinIO (later)               | Simple first, scalable later             |
| Auth       | None for MVP; JWT later                         | Anonymous contributor_name string in MVP |
| Monorepo   | Turborepo                                       | Fast caching, parallel builds            |
| Docker     | Single docker-compose.yml                       | Self-hostable by anyone                  |

### 5.3 FOSS Commitment

- No Mapbox dependency. OpenLayers + OpenMapTiles + Martin.
- No proprietary tile services. Self-hosted or free tile sources.
- MIT or AGPL license (TBD).

---

## 6. Database Schema (PostgreSQL 16 + PostGIS 3)

### 6.1 DDL

```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========== SYSTEM TIERS ==========

CREATE TABLE super_systems (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    official BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    external_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE systems (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    boundary GEOMETRY(MultiPolygon, 4326),
    ownership_source TEXT,
    source_date DATE,
    description TEXT,
    external_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE system_super_systems (
    system_id UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    super_system_id UUID NOT NULL REFERENCES super_systems(id) ON DELETE CASCADE,
    PRIMARY KEY (system_id, super_system_id)
);

CREATE TABLE sub_systems (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    system_id UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    geometry GEOMETRY(MultiPolygon, 4326),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== TRAILS & SEGMENTS ==========

CREATE TABLE trails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    geometry GEOMETRY(MultiLineString, 4326),
    description TEXT,
    difficulty TEXT CHECK (difficulty IN ('easy', 'moderate', 'hard', 'expert')),
    length_meters DOUBLE PRECISION,
    elevation_gain_meters DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE trail_systems (
    trail_id UUID NOT NULL REFERENCES trails(id) ON DELETE CASCADE,
    system_id UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    PRIMARY KEY (trail_id, system_id)
);

CREATE TABLE trail_sub_systems (
    trail_id UUID NOT NULL REFERENCES trails(id) ON DELETE CASCADE,
    sub_system_id UUID NOT NULL REFERENCES sub_systems(id) ON DELETE CASCADE,
    PRIMARY KEY (trail_id, sub_system_id)
);

CREATE TABLE trail_segments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trail_id UUID NOT NULL REFERENCES trails(id) ON DELETE CASCADE,
    name TEXT,
    geometry GEOMETRY(MultiLineString, 4326) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    surface_type TEXT CHECK (surface_type IN ('natural', 'gravel', 'paved', 'boardwalk', 'road_connector')),
    hazards TEXT[],
    is_road_connector BOOLEAN NOT NULL DEFAULT false,
    steep_grade BOOLEAN NOT NULL DEFAULT false,
    one_way BOOLEAN NOT NULL DEFAULT false,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== FEATURES / LANDMARKS ==========

CREATE TABLE features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    type_tag TEXT NOT NULL CHECK (type_tag IN (
        'trailhead', 'shelter', 'water_source', 'scenic_point',
        'restroom', 'parking', 'campground', 'bridge', 'tunnel',
        'sign', 'intersection', 'other'
    )),
    point GEOMETRY(Point, 4326) NOT NULL,
    trail_id UUID REFERENCES trails(id) ON DELETE SET NULL,
    system_id UUID REFERENCES systems(id) ON DELETE SET NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== WIKI PAGES ==========

CREATE TABLE wiki_pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_type TEXT NOT NULL CHECK (target_type IN (
        'super_system', 'system', 'sub_system', 'trail', 'feature'
    )),
    target_id UUID NOT NULL,
    title TEXT NOT NULL,
    content_md TEXT NOT NULL DEFAULT '',
    rendered_html TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (target_type, target_id)
);

-- ========== CITATIONS ==========

CREATE TABLE citations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wiki_page_id UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
    url TEXT,
    title TEXT NOT NULL,
    image_data BYTEA,  -- for photos of signs / rule boards
    image_mime_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== REVISIONS (EDIT HISTORY) ==========

CREATE TABLE revisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wiki_page_id UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
    content_md TEXT NOT NULL,
    contributor_name TEXT NOT NULL DEFAULT 'anonymous',
    author_id UUID,  -- nullable FK for future users table
    edit_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== MEDIA (PHOTOS ATTACHED TO FEATURES/TRAILS/SYSTEMS) ==========

CREATE TABLE media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    feature_id UUID REFERENCES features(id) ON DELETE CASCADE,
    trail_id UUID REFERENCES trails(id) ON DELETE CASCADE,
    system_id UUID REFERENCES systems(id) ON DELETE CASCADE,
    data BYTEA NOT NULL,
    mime_type TEXT NOT NULL,
    caption TEXT,
    width INTEGER,
    height INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (feature_id IS NOT NULL)::int +
        (trail_id IS NOT NULL)::int +
        (system_id IS NOT NULL)::int = 1
    )
);

-- ========== OFFLINE PACKS (SERVER-SIDE METADATA) ==========

CREATE TABLE offline_packs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    system_id UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    mbtiles_data BYTEA,    -- pre-generated MBTiles for this system
    geojson_data BYTEA,    -- trails + segments + features as GeoJSON
    wiki_data JSONB,       -- all wiki pages + revisions for this system
    tile_size_bytes BIGINT,
    geojson_size_bytes BIGINT,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== FUTURE: USERS & ATTESTATIONS (Phase 6+) ==========

-- CREATE TABLE users (
--     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--     username TEXT NOT NULL UNIQUE,
--     email TEXT NOT NULL UNIQUE,
--     password_hash TEXT NOT NULL,
--     role TEXT NOT NULL DEFAULT 'contributor' CHECK (role IN ('contributor', 'admin', 'banned')),
--     trust_score DOUBLE PRECISION NOT NULL DEFAULT 0,
--     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
-- );

-- CREATE TABLE attestations_strong (
--     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--     trail_id UUID NOT NULL REFERENCES trails(id) ON DELETE CASCADE,
--     user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--     gps_track GEOMETRY(LineString, 4326) NOT NULL,
--     recorded_at TIMESTAMPTZ NOT NULL,
--     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
-- );

-- CREATE TABLE attestations_weak (
--     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--     trail_id UUID NOT NULL REFERENCES trails(id) ON DELETE CASCADE,
--     user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--     vote BOOLEAN NOT NULL,  -- true = thumbs up, false = thumbs down
--     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
--     UNIQUE (trail_id, user_id)
-- );

-- ========== INDEXES ==========

CREATE INDEX idx_systems_boundary ON systems USING GIST (boundary);
CREATE INDEX idx_trails_geometry ON trails USING GIST (geometry);
CREATE INDEX idx_segments_geometry ON trail_segments USING GIST (geometry);
CREATE INDEX idx_features_point ON features USING GIST (point);
CREATE INDEX idx_features_trail ON features(trail_id);
CREATE INDEX idx_features_system ON features(system_id);
CREATE INDEX idx_wiki_pages_target ON wiki_pages(target_type, target_id);
CREATE INDEX idx_revisions_page ON revisions(wiki_page_id, created_at DESC);
CREATE INDEX idx_media_feature ON media(feature_id);
CREATE INDEX idx_media_trail ON media(trail_id);
CREATE INDEX idx_media_system ON media(system_id);
CREATE INDEX idx_segments_trail ON trail_segments(trail_id, sort_order);
```

### 6.2 SQLite (Offline) Schema

Mirrors the above, minus PostGIS types (WKB blobs instead). Subset of tables:

```
systems, subsystems, trails, trail_segments, features,
wiki_pages, revisions (only for local targets), media,
pending_contributions (local queue), downloaded_packs
```

`pending_contributions` schema:

```sql
CREATE TABLE pending_contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,     -- 'wiki_page', 'feature', 'trail_segment', etc.
    entity_id TEXT,                -- null for creates, UUID for updates
    action TEXT NOT NULL,          -- 'create', 'update', 'delete'
    payload JSON NOT NULL,         -- full serialized change
    contributor_name TEXT NOT NULL,
    created_at TEXT NOT NULL,      -- ISO 8601
    sync_status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'syncing', 'conflict'
    server_id TEXT,                -- assigned after sync
    conflict_revision_id TEXT      -- if server had newer revision
);
```

---

## 7. Map Strategy

### 7.1 Library: OpenLayers 10

- FOSS, BSD-2-Clause license
- Works in browser (used directly in web app)
- Works in WebView (used in mobile app via postMessage bridge)

### 7.2 Architecture

```
packages/map/
  src/
    MapContainer.tsx        # Platform router
    MapContainer.web.tsx    # Direct OpenLayers
    MapContainer.native.tsx # WebView + postMessage bridge
    shared/
      styles.ts             # Shared layer styles (colors, widths)
      config.ts             # Base map config, tile URLs
      controls.ts           # Zoom, layer toggle, attribution
```

Both platforms share `shared/` — trail styling, feature icons, layer definitions are written once.

### 7.3 Tile Stack

| Layer                      | Source                                                  |
| -------------------------- | ------------------------------------------------------- |
| Base map (terrain/streets) | OpenMapTiles public instance (free tier) or self-hosted |
| Hillshade / satellite      | Optional overlay (self-hosted or public)                |
| Trail overlays             | Martin tile server from PostGIS (vector tiles)          |
| System boundaries          | Martin tile server                                      |
| Features / landmarks       | GeoJSON layer (fetched per-viewport)                    |

### 7.4 OpenLayers Bridge (Mobile)

WebView runs a tiny HTML page that loads OpenLayers. The React Native layer communicates via:

```
RN → WebView:     injectJavaScript(`window.olBridge.${method}(${JSON.stringify(args)})`)
WebView → RN:     window.ReactNativeWebView.postMessage(JSON.stringify(event))
```

Event types: `mapClick`, `mapLongPress`, `moveEnd`, `featureSelect`, `featureTap`.

---

## 8. Offline Strategy (Android)

### 8.1 User Experience

The offline status must be **front and center**, not hidden:

- **Status indicator**: A persistent badge in the header bar:
  - 🟢 Green dot + "Online" — connected
  - 🟡 Yellow dot + "Offline (3 pending changes)" — offline with unsynced edits
  - 🔴 Red dot + "Offline (no data)" — offline, no downloaded region covers current view
  - ⚪ Grey dot + "Syncing..." — actively uploading
- **Storage manager**: Settings screen shows downloaded systems, per-system size, total usage (X / 500MB), delete button
- **Download prompt**: When viewing a System without data, show a banner: "You're offline and haven't downloaded this area. Download 42MB to browse it?"

### 8.2 Download Mechanism

1. User navigates to a System detail page
2. "Download for Offline" button (available online only)
3. Server endpoint generates a pack:
   - **MBTiles** for this System's bounding box (zooms 10-14, full detail)
   - **MBTiles** for surrounding 50km (zooms 5-9, reduced detail)
   - **GeoJSON** of all trails, segments, features in this System
   - **Wiki JSON** of all wiki pages, revisions, citations
4. Client downloads ~4 files, stores in SQLite
5. Storage manager tracks total size (hard cap: 500MB, soft warn at 400MB)

### 8.3 MBTiles Generation

Martin (Rust tile server) serves tiles from PostGIS. An API endpoint:

```
POST /api/offline-packs/generate/:system_id
  1. Query system boundary
  2. Fire martin tile requests for zoom range + bounds
  3. Pack into SQLite MBTiles file (standard spec)
  4. Return as download
```

OpenLayers reads MBTiles natively on mobile (via WebView → SQLite plugin bridge).

### 8.4 Sync Engine

**Upload (local → server):**

1. App checks connectivity on foreground
2. If online + pending queue non-empty → POST `/api/sync/contributions` with array of changes
3. Each change includes `base_revision_id` (the revision the edit was based on)
4. Server checks: if `base_revision_id` matches current head → apply edit, assign server ID
5. If mismatch → return conflict (`409 Conflict`, includes current head content)
6. Client stores `conflict_revision_id`, surfaces conflict to user
7. User resolves conflict manually (view diff → keep mine / keep theirs / merge)

**Download (server → local):**

- On reconnect, client sends `last_synced_timestamp`
- Server returns diff of changes since then for all downloaded systems
- Client applies updates locally

### 8.5 Offline-Only Features

| Feature               | Online | Offline                                       |
| --------------------- | ------ | --------------------------------------------- |
| Browse map            | Yes    | Yes (MBTiles)                                 |
| View trails/systems   | Yes    | Yes                                           |
| Read wiki pages       | Yes    | Yes                                           |
| Edit wiki pages       | Yes    | Yes (queued)                                  |
| Add features          | Yes    | Yes (queued)                                  |
| Attach photos         | Yes    | Yes (queued, stored as base64 in SQLite)      |
| Search                | Yes    | Yes (SQLite FTS)                              |
| View revision history | Yes    | Partial (local + server history, no full log) |
| Admin actions         | Yes    | No                                            |

---

## 9. API Design (Hono + Bun)

### 9.1 Phase 0 — Scaffold

| Method | Path               | Description                                    |
| ------ | ------------------ | ---------------------------------------------- |
| `GET`  | `/api/health`      | Server health check                            |
| `GET`  | `/api/systems`     | List systems (paginated)                       |
| `GET`  | `/api/systems/:id` | System detail with boundary GeoJSON            |
| `GET`  | `/api/trails`      | List trails (paginated, filterable)            |
| `GET`  | `/api/trails/:id`  | Trail detail with geometry GeoJSON             |
| `POST` | `/api/seed`        | Dev-only: seed Ohio test data from OSM extract |

### 9.2 Phase 1 — Map & Browse

| Method | Path                         | Description                                       |
| ------ | ---------------------------- | ------------------------------------------------- |
| `GET`  | `/api/systems/:id/trails`    | Trails in a system                                |
| `GET`  | `/api/systems/:id/features`  | Features in a system                              |
| `GET`  | `/api/trails/:id/segments`   | Segments of a trail (ordered)                     |
| `GET`  | `/api/trails/:id/features`   | Features on a trail                               |
| `GET`  | `/api/search?q=&type=`       | Full-text search across systems, trails, features |
| `GET`  | `/api/tiles/{z}/{x}/{y}.pbf` | Proxy to Martin tile server                       |

### 9.3 Phase 2 — Wiki Pages

| Method   | Path                                      | Description                                          |
| -------- | ----------------------------------------- | ---------------------------------------------------- |
| `GET`    | `/api/wiki-pages?target_type=&target_id=` | Get wiki page for target                             |
| `POST`   | `/api/wiki-pages`                         | Create wiki page                                     |
| `PUT`    | `/api/wiki-pages/:id`                     | Update wiki page (creates revision)                  |
| `GET`    | `/api/wiki-pages/:id/revisions`           | Revision history (paginated)                         |
| `GET`    | `/api/wiki-pages/:id/revisions/:rev_id`   | Specific revision content                            |
| `POST`   | `/api/wiki-pages/:id/revert`              | Revert to a specific revision (creates new revision) |
| `POST`   | `/api/citations`                          | Add citation to wiki page                            |
| `DELETE` | `/api/citations/:id`                      | Remove citation                                      |
| `GET`    | `/api/revisions/recent`                   | Recent edits across all targets (admin preview)      |

### 9.4 Phase 3 — Offline

| Method | Path                                     | Description                             |
| ------ | ---------------------------------------- | --------------------------------------- |
| `GET`  | `/api/offline-packs/:system_id/info`     | Size estimate, last generated timestamp |
| `POST` | `/api/offline-packs/generate/:system_id` | Generate (or return cached) pack        |
| `GET`  | `/api/offline-packs/:system_id/download` | Download pack file                      |
| `POST` | `/api/sync/contributions`                | Bulk upload pending offline changes     |
| `GET`  | `/api/sync/updates?since=`               | Get changes since timestamp             |

### 9.5 Phase 4 — Features & Media

| Method   | Path                | Description                                     |
| -------- | ------------------- | ----------------------------------------------- |
| `POST`   | `/api/features`     | Create feature                                  |
| `PUT`    | `/api/features/:id` | Update feature                                  |
| `DELETE` | `/api/features/:id` | Delete feature                                  |
| `POST`   | `/api/media`        | Upload media (attached to feature/trail/system) |
| `GET`    | `/api/media/:id`    | Download media file                             |
| `DELETE` | `/api/media/:id`    | Delete media                                    |

### 9.6 Phase 5 — Segments

| Method   | Path                               | Description                          |
| -------- | ---------------------------------- | ------------------------------------ |
| `POST`   | `/api/trails/:id/segments`         | Create segment                       |
| `PUT`    | `/api/segments/:id`                | Update segment metadata              |
| `DELETE` | `/api/segments/:id`                | Delete segment                       |
| `POST`   | `/api/trails/:id/segments/reorder` | Reorder segments (pass array of IDs) |
| `POST`   | `/api/trails/:id/segments/split`   | Split segment at a point             |
| `POST`   | `/api/trails/:id/segments/merge`   | Merge two adjacent segments          |

### 9.7 Phase 6 — Auth & Admin

| Method   | Path                              | Description                                |
| -------- | --------------------------------- | ------------------------------------------ |
| `POST`   | `/api/auth/register`              | Create account                             |
| `POST`   | `/api/auth/login`                 | Login, get JWT                             |
| `GET`    | `/api/auth/me`                    | Current user info                          |
| `GET`    | `/api/admin/revisions`            | Recent revisions (paginated, with filters) |
| `POST`   | `/api/admin/revisions/:id/revert` | Admin revert                               |
| `DELETE` | `/api/admin/wiki-pages/:id`       | Admin delete wiki page                     |
| `DELETE` | `/api/admin/features/:id`         | Admin delete feature                       |
| `POST`   | `/api/admin/users/:id/ban`        | Ban user                                   |
| `GET`    | `/api/users/:id`                  | Public user profile                        |
| `GET`    | `/api/users/:id/contributions`    | User's revisions                           |

### 9.8 Phase 9 — Attestations

| Method | Path                           | Description                           |
| ------ | ------------------------------ | ------------------------------------- |
| `POST` | `/api/attestations/strong`     | Upload GPS track (strong attestation) |
| `POST` | `/api/attestations/weak`       | Thumbs up/down (weak attestation)     |
| `GET`  | `/api/trails/:id/attestations` | Attestation stats for trail           |
| `GET`  | `/api/users/:id/trust-score`   | User trust score                      |

---

## 10. Component Tree

### 10.1 App Shell

```
App (expo-router)
├── _layout.tsx              # Root layout: providers, theme, status bar
├── (tabs)/
│   ├── _layout.tsx          # Tab navigator
│   ├── explore.tsx          # Map + search (home screen)
│   ├── systems.tsx          # System list
│   ├── trails.tsx           # Trail list / search
│   └── profile.tsx          # Downloads, pending changes, settings
├── system/
│   └── [slug].tsx           # System detail (map, wiki, trail list)
├── trail/
│   └── [slug].tsx           # Trail detail (map, wiki, segments, features)
├── segment/
│   └── [id].tsx             # Segment detail / editor
├── feature/
│   └── [id].tsx             # Feature detail (photo, wiki)
├── wiki/
│   ├── [targetType]/
│   │   └── [targetId].tsx   # Wiki page view
│   └── edit/
│       └── [targetType]/
│           └── [targetId].tsx  # Wiki page editor
├── admin/                   # (Phase 6)
│   ├── _layout.tsx
│   ├── dashboard.tsx
│   ├── revisions.tsx
│   └── users.tsx
└── settings.tsx             # Storage manager, about
```

### 10.2 Key Shared Components

```
packages/app/src/components/
├── map/
│   ├── MapView.tsx              # Platform-routed map (uses packages/map)
│   ├── MapControls.tsx          # Zoom, layers, locate-me
│   ├── TrailOverlay.tsx         # Trail line styling
│   ├── SegmentOverlay.tsx       # Segment color coding
│   ├── FeatureMarker.tsx        # POI icons
│   └── SystemBoundary.tsx       # System polygon
├── wiki/
│   ├── WikiPageView.tsx         # Rendered MD + citations + revision count
│   ├── WikiPageEditor.tsx       # Markdown textarea + citation form
│   ├── CitationForm.tsx         # URL + image upload
│   └── RevisionHistory.tsx      # List of past revisions
├── trail/
│   ├── TrailCard.tsx            # List item (name, difficulty, length)
│   ├── TrailDetailHeader.tsx    # Stats bar (distance, elevation, difficulty)
│   ├── SegmentList.tsx          # Ordered segment list
│   └── SegmentEditor.tsx        # Segment metadata form
├── system/
│   ├── SystemCard.tsx           # List item
│   └── SystemHeader.tsx         # Name, description, boundary preview
├── feature/
│   ├── FeatureCard.tsx          # List item
│   ├── FeatureForm.tsx          # Create/edit form
│   └── FeatureTypeIcon.tsx      # Icon by type_tag
├── offline/
│   ├── StatusIndicator.tsx      # Green/yellow/red/grey dot + text
│   ├── DownloadButton.tsx       # "Download for Offline" + progress
│   ├── StorageManager.tsx       # List of downloads, sizes, delete
│   └── PendingQueue.tsx         # List of unsynced changes
├── media/
│   ├── MediaGallery.tsx         # Photo grid
│   ├── MediaUploader.tsx        # Camera / gallery picker
│   └── ImageViewer.tsx          # Full-screen image
└── ui/
    ├── Button.tsx
    ├── Badge.tsx
    ├── Card.tsx
    ├── SearchBar.tsx
    ├── DifficultyBadge.tsx
    └── SegmentTypeBadge.tsx
```

---

## 11. Phased Plan — Detailed

### Phase 0: Foundation (Weeks 1-2) — Completed

**Status:** Implemented. Monorepo with workspaces, Docker Compose stack (Postgres/Martin/API), Drizzle schema + migrations, seeded API skeleton, shared types/Zod package, and Expo app shell with tab navigation.

---

### Phase 1: Map & Trail Browsing (Weeks 3-5) — Completed

**Status:** Implemented. OpenLayers web map plus native WebView bridge, Martin vector tiles for trails/systems, full System → Trail → Segment drill-down browsing, and Postgres full-text search end-to-end.

---

### Phase 2: Wiki Pages (Weeks 6-7) — Completed

**Status:** Implemented. Markdown wiki view/edit with live preview, full revision history with revert, URL + image citations, and wiki tabs integrated into System/Trail/Feature detail pages.

---

### Phase 3: Offline Mode (Weeks 8-11) — Completed

**Status:** Implemented. SQLite mirror with FTS5 search, offline pack download with MBTiles, connectivity-aware map rendering, offline browsing/editing with a pending contribution queue, sync upload/download with conflict resolution, a storage manager, and a reactive status indicator.

---

### Phase 4: Features & Media (Weeks 12-13) — Completed

**Status:** Implemented. Feature CRUD via map long-press with typed markers, media upload (camera/gallery) with resize, full-screen image gallery, and offline-queued feature/media editing.

---

### Phase 5: Segments & Advanced Trail Editing (Weeks 14-15) — Completed

**Status:** Implemented. First-class segment create/edit with surface/hazard metadata, geometry split/merge/reorder tools, distinct segment visualization with hazard icons, and segment-overrides-trail metadata inheritance.

---

### Phase 6: User Accounts & Moderation (Weeks 16-18) — Completed

**Status:** Implemented. JWT auth (register/login with refresh tokens, SecureStore), author tracking on revisions, admin dashboard with revision feed/diff/revert and user management/ban, and API rate limiting.

---

### Phase 7: Web Parity & Polish (Weeks 19-20) — Completed

**Status:** Implemented. Web build exports all routes with responsive layouts, base-layer switcher, admin polish, lazy-loaded routes, and accessibility/performance pass.

---

### Phase 8: iOS Support (Week 21)

**Goal:** App runs on iOS.

#### Tasks

- Add iOS build target in Expo
- Test on iOS Simulator
- Fix camera/gallery permissions (Info.plist)
- Fix WebView bridge (WKWebView quirks)
- Test offline mode (SQLite works? op-sqlite has iOS support)
- Test all features end-to-end
- Submit to TestFlight (if desired)

#### Deliverables

- iOS build works
- All features parity with Android

---

### Phase 9: Attestation System — Superseded

**Status:** Superseded by the UI Redux (see §21) and the recording UX redesign (see §22). The original "GPS verifies a trail" attestation model is replaced by a tiered trail-trust model: GPS traces now _create and maintain_ synthesized trails (with wiki-style segment→trail marking and downvote-weighting), and karma/voting drives trust rather than attestation quorums. The existing `users.trust_score` field is reused as the karma total. The `ATTESTATION_*` constants in `packages/shared/src/constants.ts` are retained only until §21 lands. The recording-side UX (the focus of this phase) was redesigned in §22 to make the Record tab a first-class home-screen entry point with a kill-safe SQLite mirror.

---

## 12. Self-Hosting

### Docker Compose (single file)

```yaml
# docker-compose.yml
# Brings up the full stack. Only Docker required.
# Customize: DATABASE_PASSWORD, ADMIN_SECRET, CORS_ORIGINS

services:
  postgres:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: magnum
      POSTGRES_USER: magnum
      POSTGRES_PASSWORD: ${DB_PASSWORD:-changeme}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U magnum"]
      interval: 5s
      retries: 5

  martin:
    image: maplibre/martin:latest
    environment:
      DATABASE_URL: postgres://magnum:${DB_PASSWORD:-changeme}@postgres:5432/magnum
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "127.0.0.1:3001:3000"

  api:
    build:
      context: .
      dockerfile: docker/api.Dockerfile
    environment:
      DATABASE_URL: postgres://magnum:${DB_PASSWORD:-changeme}@postgres:5432/magnum
      MARTIN_URL: http://martin:3000
      ADMIN_SECRET: ${ADMIN_SECRET:-dev-secret-change-me}
      CORS_ORIGINS: ${CORS_ORIGINS:-http://localhost:8081}
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "3000:3000"

volumes:
  pgdata:
```

### API Dockerfile

```dockerfile
# docker/api.Dockerfile
FROM oven/bun:1-alpine
WORKDIR /app
COPY packages/api/package.json packages/api/bun.lock ./
RUN bun install --frozen-lockfile
COPY packages/api/ ./
COPY packages/shared/ ../shared/
RUN bun run build
EXPOSE 3000
CMD ["bun", "run", "start"]
```

### Hosting notes

- Single `docker compose up -d` on any VPS
- Reverse proxy (nginx/Caddy) recommended for SSL
- Postgres volume persists data across restarts
- Backup: `pg_dump` the Postgres volume
- ~2GB RAM minimum (Postgres + PostGIS + Martin + API)
- MBTiles can grow large; consider separate volume for generated packs

### Android Build

```bash
# Prerequisites
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk  # Gradle 8.10.2 needs Java 21

# First-time setup
cd packages/app
npx expo prebuild --platform android --clean

# Build and install on emulator
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk
npx expo run:android

# Or just build the APK
cd packages/app/android
./gradlew app:assembleDebug -x lint -x test -PreactNativeArchitectures=x86_64
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Metro dev server (for debug builds without embedded bundle)
npx expo start --no-dev  # Bundler serves on port 8081
adb reverse tcp:8081 tcp:8081  # Forward emulator -> host

# Production release (embeds JS bundle)
npx expo export --platform android  # Builds JS bundle into dist/
npx expo run:android --variant release
```

Known issues:

- Expo autolinker may generate `expo.core.ExpoModulesPackage` import instead of `expo.modules.ExpoModulesPackage`. Root cause: the `expo` package's Android module sets its Gradle `namespace` to `expo.core` (for BuildConfig/R-class), but the actual `ExpoModulesPackage` class is in package `expo.modules`. `expo-modules-autolinking` derives the import from the namespace when no explicit `packageImportPath` is provided. The expo package's own `react-native.config.js` would correct this, but only when `useExpoModules` is detected at the monorepo root (this project's `settings.gradle` lives under `packages/app/`). Fix: `packages/app/react-native.config.js` pins `dependencies.expo.platforms.android.packageImportPath` to `import expo.modules.ExpoModulesPackage;`. This survives `bun install` and `expo prebuild --clean` (unlike a wrapper class in `node_modules`).
- Gradle needs Java 21 (OpenJDK 26+ not supported).
- If you start an emulator via the back_background tool, leave OUT the timeout param. This way the default timeout of 'infinity' is chosen

---

## 13. Data Sources & Ingestion

### OSM Extract Pipeline

```bash
# scripts/ingest-osm.sh
# 1. Download region extract
wget https://download.geofabrik.de/north-america/us/ohio-latest.osm.pbf

# 2. Import with osm2pgsql (filtered to trails)
osm2pgsql \
  --database magnum \
  --create \
  --style scripts/osm2pgsql.style \
  --output flex \
  --slim \
  ohio-latest.osm.pbf

# 3. Map OSM tags to our trail schema (custom Lua flex script)
# scripts/osm2pgsql.lua maps:
#   highway=path|footway|track|cycleway|bridleway → trails
#   leisure=park|boundary=protected_area → systems
```

### Initial Regions

1. Ohio (test region, manageable size)
2. Expand to full US (via Geofabrik extracts)
3. User-contributed trails (drawn in-app) for unmapped areas

---

## 14. Testing Strategy

### 14.1 Test Pyramid

| Layer                 | Tool                         | What                                               | Priority |
| --------------------- | ---------------------------- | -------------------------------------------------- | -------- |
| API unit tests        | Bun test                     | Hono route handlers, Drizzle queries               | High     |
| API integration       | Bun test + Testcontainers    | Seed DB → test endpoints                           | High     |
| Shared validation     | Bun test                     | Zod schemas, API client, constants                 | High     |
| App components        | React Native Testing Library | UI components in isolation                         | Medium   |
| Map (web)             | Playwright                   | OpenLayers renders, layer toggles, clicks → events | Medium   |
| App E2E (web-parity)  | Playwright                   | Full user flows via RNW (existing)                 | Medium   |
| App E2E (mobile-only) | **Detox** (Android)          | Offline, sync, camera, GPS, WebView map            | High     |
| Offline sync logic    | Bun test                     | SyncService, conflict resolution, queue logic      | High     |

### 14.2 Feature-Parity Rule

When a feature has **identical behavior on web and mobile**, test it with Playwright (web). When a feature is **mobile-only or platform-divergent**, test it with Detox on Android emulator. Web E2E smoke tests cover the union.

#### Web-Parity Features (Playwright only)

These have the same UI, routes, and state management on web + RN:

| Feature                                            | Playwright Coverage               |
| -------------------------------------------------- | --------------------------------- |
| Tab navigation (Explore, Systems, Trails, Profile) | `tests/e2e/flows/01-tabs.spec.ts` |
| System listing, search, filter                     | `02-browse-systems.spec.ts`       |
| System detail (mini-map, trail list, wiki)         | `03-system-detail.spec.ts`        |
| Trail detail (stats, segments, features, wiki)     | `04-trail-detail.spec.ts`         |
| Feature/landmark detail                            | `10-feature-detail.spec.ts`       |
| Wiki page view + edit + revision history           | (Phase 2 specs)                   |
| Search (typeahead, cross-entity)                   | `08-search.spec.ts`               |
| Deep linking                                       | `09-deeplink.spec.ts`             |
| Error states (404, API-down)                       | `06-error-states.spec.ts`         |
| User journeys / happy paths                        | `07-journey.spec.ts`              |
| Auth flows (login, register, profile)              | (Phase 6 specs)                   |
| Admin dashboard, revision feed, ban                | (Phase 6 specs)                   |
| Segment editor, split/merge/reorder                | (Phase 5 specs)                   |
| Feature CRUD forms                                 | (Phase 4 specs)                   |
| Media gallery (photo grid, full-screen)            | (Phase 4 specs)                   |
| Citations (add URL/image, delete)                  | (Phase 2 specs)                   |
| Storage manager UI shell                           | (Phase 3 specs)                   |
| Responsive layout (desktop sidebar ↔ mobile stack) | (Phase 7 specs)                   |

#### Mobile-Only Features (Detox)

These depend on native APIs, device sensors, app lifecycle, or offline-first architecture:

| Feature                                                    | Requires Detox | Why Mobile-Only                           |
| ---------------------------------------------------------- | -------------- | ----------------------------------------- |
| Offline browsing (map, trails, wiki from SQLite)           | Yes            | `navigator.onLine`, SQLite, MBTiles       |
| Download for Offline (MBTiles + GeoJSON + Wiki JSON)       | Yes            | File system, background fetch, progress   |
| Offline edit queue (wiki, features, media)                 | Yes            | Queued in SQLite, sync on reconnect       |
| Sync upload (pending contributions → server)               | Yes            | App foreground detection, chunked upload  |
| Sync conflict resolution (diff view, keep mine/theirs)     | Yes            | Conflict UI is mobile-specific            |
| Connectivity status indicator (🟢🟡🔴⚪)                   | Yes            | `@react-native-community/netinfo`         |
| Storage manager interactions (download, delete, size bars) | Yes            | SQLite reads, file deletion               |
| WebView map bridge (pinch-zoom, tap, long-press, drag)     | Yes            | `postMessage` bridge is platform-specific |
| Camera capture + gallery pick for media                    | Yes            | `expo-camera`, `expo-image-picker`        |
| GPS tracking / Record Hike                                 | Yes            | `expo-location`, background tasks         |
| Background location for attestation                        | Yes            | `expo-task-manager`                       |
| JWT storage in SecureStore                                 | Yes            | `expo-secure-store`                       |
| App lifecycle (background → foreground sync trigger)       | Yes            | React Native `AppState`                   |
| Network toggle (airplane mode simulation)                  | Yes            | Device-specific                           |
| Offline tile rendering fallback (MBTiles → grey overlay)   | Yes            | WebView SQLite bridge                     |
| Android-specific: back button, deep link from notification | Yes            | Android navigation                        |

### 14.3 Detox Setup (Android)

#### Dependencies

```json
// packages/app/package.json (devDependencies)
{
  "detox": "^20.35",
  "@config-plugins/detox": "^9"
}
```

```bash
# Global CLI
bun add -g detox-cli
```

#### Configuration Files

**`.detoxrc.js`** (project root):

```js
module.exports = {
  logger: { level: process.env.CI ? "error" : "info" },
  testRunner: {
    $0: "jest",
    args: {
      config: "e2e/jest.config.js",
      _: ["e2e"],
    },
  },
  apps: {
    "android.debug": {
      type: "android.apk",
      binaryPath: "packages/app/android/app/build/outputs/apk/debug/app-debug.apk",
      build: `
        export JAVA_HOME=/usr/lib/jvm/java-21-openjdk && \
        cd packages/app/android && \
        ./gradlew app:assembleDebug app:assembleAndroidTest -DtestBuildType=debug -x lint -x test -PreactNativeArchitectures=x86_64
      `,
      reversePorts: [8081, 3000],
    },
    "android.release": {
      type: "android.apk",
      binaryPath: "packages/app/android/app/build/outputs/apk/release/app-release.apk",
      build: `
        export JAVA_HOME=/usr/lib/jvm/java-21-openjdk && \
        cd packages/app/android && \
        ./gradlew app:assembleRelease app:assembleAndroidTest -DtestBuildType=release -x lint -x test -PreactNativeArchitectures=x86_64
      `,
    },
  },
  devices: {
    emulator: {
      type: "android.emulator",
      device: { avdName: "detox_test" },
    },
  },
  configurations: {
    "android.emu.debug": {
      device: "emulator",
      app: "android.debug",
    },
    "android.emu.release": {
      device: "emulator",
      app: "android.release",
    },
  },
};
```

**`e2e/jest.config.js`**:

```js
module.exports = {
  rootDir: "..",
  testMatch: ["<rootDir>/e2e/**/*.test.js"],
  testTimeout: 120000,
  maxWorkers: 1,
  globalSetup: "detox/runners/jest/globalSetup",
  globalTeardown: "detox/runners/jest/globalTeardown",
  testEnvironment: "detox/runners/jest/testEnvironment",
  setupFilesAfterSetup: ["./e2e/setup.ts"],
  reporters: [
    "detox/runners/jest/reporter",
    ["jest-junit", { outputDirectory: "e2e/.results", outputName: "report.xml" }],
  ],
  verbose: true,
};
```

#### Directory Structure

```
e2e/
├── jest.config.js           # Jest runner config for Detox
├── setup.ts                 # Global setup: launch app, mock API, reset state
├── helpers/
│   ├── api-mock.ts          # Mock backend API responses via proxy
│   ├── network.ts           # Toggle airplane mode, simulate offline
│   ├── test-data.ts         # Seed test systems, trails, wiki pages
│   └── wait-for.ts          # Custom wait helpers (map render, sync complete)
├── flows/
│   ├── 01-offline-download.test.ts    # Phase 3
│   ├── 02-offline-browse.test.ts      # Phase 3
│   ├── 03-offline-edit.test.ts        # Phase 3
│   ├── 04-sync-upload.test.ts         # Phase 3
│   ├── 05-sync-conflict.test.ts       # Phase 3
│   ├── 06-storage-manager.test.ts     # Phase 3
│   ├── 07-webview-map.test.ts         # Phase 1 (map touch interactions)
│   ├── 08-camera-gallery.test.ts      # Phase 4
│   ├── 09-gps-recording.test.ts       # Phase 9
│   ├── 10-auth-secure-store.test.ts   # Phase 6
│   ├── 11-app-lifecycle.test.ts       # Background/foreground
│   ├── 12-back-navigation.test.ts     # Android back button
│   └── 13-full-journey.test.ts        # Smoke: online → download → offline → sync
├── pages/
│   ├── ExplorePage.ts       # Map interaction selectors
│   ├── SystemDetailPage.ts  # Download button, wiki toggle
│   ├── TrailDetailPage.ts   # Segment list, record hike
│   ├── WikiEditorPage.ts    # TextArea, save, citations
│   ├── SettingsPage.ts      # Storage manager, downloads
│   └── ProfilePage.ts       # Pending queue, sync status
└── .results/                # Test reports + screenshots (gitignored)
```

#### Emulator Setup

```bash
# Create AVD for Detox (pixel_6, API 34, x86_64, 2GB RAM)
avdmanager create avd \
  -n detox_test \
  -k "system-images;android-34;google_apis;x86_64" \
  -d pixel_6 \
  --force

# Start emulator headless for CI
$ANDROID_HOME/emulator/emulator \
  -avd detox_test \
  -no-audio -no-window \
  -gpu swiftshader_indirect \
  -no-snapshot \
  -memory 2048 &

# Wait for emulator to boot
adb wait-for-device
adb shell 'while [[ -z $(getprop sys.boot_completed) ]]; do sleep 1; done'
```

#### Run Commands

```bash
# Build debug APK + run Detox tests
bun run detox:build-android:debug
bun run detox:test-android:debug

# Or combined
detox test --configuration android.emu.debug

# Single test file
detox test e2e/flows/01-offline-download.test.js --configuration android.emu.debug

# With artifacts on failure (screenshots, logs)
detox test --configuration android.emu.debug --artifacts-location e2e/.results/ --take-screenshots failing

# CI mode
CI=true detox test --configuration android.emu.release --cleanup
```

### 14.4 Detox Test Scenarios by Phase

#### Phase 3: Offline Mode (Critical Path — 6 test files)

**`01-offline-download.test.ts`** — Download a System for offline use:

1. Navigate to System detail page
2. Tap "Download for Offline" button
3. Verify progress indicator appears (0% → 50% → 100%)
4. Verify success toast: "Downloaded 42MB"
5. Verify "Download for Offline" changes to "Update Download"
6. Kill app, go offline, relaunch → verify system is accessible

**`02-offline-browse.test.ts`** — Browse downloaded content while offline:

1. Pre-condition: system pack downloaded
2. Enable airplane mode
3. Verify status indicator shows 🔴 "Offline (no data)" on undownloaded tab
4. Navigate to Systems tab → verify only downloaded systems shown
5. Tap downloaded system → verify trail list renders from SQLite
6. Tap trail → verify segments, features, wiki page render
7. Search (FTS5) → verify results appear for downloaded content
8. Map → verify MBTiles render, grey "not downloaded" overlay for outside area

**`03-offline-edit.test.ts`** — Edit wiki pages while offline:

1. Pre-condition: system pack downloaded, go offline
2. Open wiki page for a trail, tap "Edit"
3. Modify content: "Updated this offline"
4. Add edit summary: "Offline test edit"
5. Save → verify pending queue count increases (🟡)
6. Navigate to Profile → verify PendingQueue shows the edit with preview
7. Delete edit from queue → verify it's removed
8. Re-edit and save again → verify queue has 1 pending again

**`04-sync-upload.test.ts`** — Sync pending edits on reconnect:

1. Pre-condition: 3 offline edits queued (wiki, feature, media)
2. Re-enable network (disable airplane mode)
3. Wait for auto-sync to trigger (debounced, ~5s)
4. Verify status indicator shows ⚪ "Syncing 1 of 3..." → "Syncing 2 of 3..." → "Syncing 3 of 3..."
5. Verify indicator changes to 🟢 "Online"
6. Verify pending queue is empty
7. Navigate to API to verify edits were persisted server-side
8. Pull-to-refresh to verify server content matches

**`05-sync-conflict.test.ts`** — Handle edit conflicts:

1. Pre-condition: edit wiki page offline (base_revision_id = v42)
2. While offline, simulate another user editing the same page via API (revision v43)
3. Reconnect → sync attempt returns 409 Conflict
4. Verify conflict screen appears: "Someone else edited this page while you were offline"
5. Side-by-side diff: your version (v42) vs server version (v43)
6. Tap "Keep Mine" → verify your edit is applied (creates v44)
7. Kill and retry scenario with "Keep Theirs" → verify server version kept
8. Retry with no resolution → verify conflict remains pending

**`06-storage-manager.test.ts`** — Manage downloaded packs:

1. Download 3 systems (42MB, 89MB, 128MB)
2. Navigate to Settings → Storage
3. Verify total usage bar: `████████░ 259MB / 500MB`
4. Verify each system: name, size, last synced date, [Update] [Delete] buttons
5. Tap [Delete] on one system → confirmation dialog → confirm
6. Verify system removed from list, storage bar updates
7. Tap [Update] on a system → verify re-download with updated data
8. "Delete All" → verify all packs removed, storage shows 0MB

#### Phase 1: Map Interactions on Mobile (1 test file)

**`07-webview-map.test.ts`** — Verify WebView map bridge:

1. Open Explore tab → map loads (verify WebView renders)
2. Pinch zoom → verify map zooms (check zoom level via bridge)
3. Double-tap → verify zoom in
4. Single tap on trail → verify feature select event fires → bottom sheet appears
5. Long-press on empty area → verify "Add Feature" modal opens
6. Tap feature marker (trailhead icon) → verify feature detail bottom sheet
7. "View on map" from trail detail → verify map flies to trail geometry
8. Layer toggles: hide trails → verify trails disappear; re-enable → verify they reappear
9. Locate-me button → verify map centers on current location (if location granted)

#### Phase 4: Camera & Gallery (1 test file)

**`08-camera-gallery.test.ts`** — Media capture on mobile:

1. Navigate to feature detail, tap "Add Photo"
2. Tap "Take Photo" → verify camera launches
3. Capture photo → verify thumbnail appears in gallery
4. Tap "Choose from Gallery" → verify picker opens
5. Select image → verify thumbnail appears
6. While offline: capture photo → verify queued in pending (base64 stored)
7. Reconnect → verify photo syncs to server

#### Phase 9: GPS Recording (1 test file)

**`09-gps-recording.test.ts`** — Record and upload GPS tracks:

1. Navigate to trail detail, tap "Record Hike"
2. Verify tracking starts → timer running, distance accumulating
3. Simulate location changes (mock `expo-location` via Detox launch args)
4. Wait 10s → verify track recorded
5. Tap "Stop & Save" → verify GPX data stored
6. Upload track → verify strong attestation POST succeeds
7. Verify "Verified" badge appears on trail (if quorum met)

#### Phase 6: Auth (1 test file)

**`10-auth-secure-store.test.ts`** — JWT persistence across app restarts:

1. Login → verify JWT stored in SecureStore
2. Kill app completely (adb force-stop)
3. Relaunch app → verify user is still authenticated (token read from SecureStore)
4. Logout → verify token removed from SecureStore
5. Relaunch → verify user is unauthenticated

#### Platform-Specific (2 test files)

**`11-app-lifecycle.test.ts`** — Background/foreground sync:

1. Queue 2 offline edits
2. Put app in background (Home button)
3. Re-enable network while app is in background
4. Bring app to foreground → verify sync auto-triggers (AppState change)
5. Verify edits synced

**`12-back-navigation.test.ts`** — Android hardware back button:

1. Navigate Trail → Segment → verify back button returns to Trail
2. Navigate System → Trail → verify back button returns to System
3. From editor with unsaved changes → verify "Discard changes?" dialog
4. From root tab → verify back exits app (or shows confirmation)

#### Full Journey Smoke Test (1 test file)

**`13-full-journey.test.ts`** — End-to-end user journey:

1. Launch app online → browse systems, find "Hocking Hills"
2. Download system (42MB)
3. Go offline → browse map, trails, read wiki
4. Edit wiki page offline ("Added hazard note")
5. Add feature offline (long-press map → "Trailhead" tag)
6. Take photo of sign (offline)
7. Reconnect → sync completes
8. Verify all contributions appear on server
9. View system again → verify edits visible

### 14.5 Playwright E2E Integration

Existing Playwright tests in `tests/e2e/` cover web-parity features (10 spec files). They use:

- `playwright.config.ts` — Chromium, parallel, Expo web build served locally
- `tests/e2e/helpers/api-mock.ts` — Route interception mocking the API
- `tests/e2e/fixtures/data.ts` — Test seed data
- `data-testid` selectors for element targeting

#### Adding New Playwright Specs (Web-Parity Features)

As new phases add web-parity features, add corresponding Playwright specs:

| Phase              | New Playwright Specs                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Phase 2 (Wiki)     | `tests/e2e/flows/11-wiki-view.spec.ts`, `12-wiki-edit.spec.ts`, `13-wiki-revisions.spec.ts`, `14-citations.spec.ts`              |
| Phase 4 (Features) | `tests/e2e/flows/15-feature-create.spec.ts`, `16-feature-edit.spec.ts`, `17-media-upload.spec.ts`                                |
| Phase 5 (Segments) | `tests/e2e/flows/18-segment-create.spec.ts`, `19-segment-split-merge.spec.ts`, `20-segment-reorder.spec.ts`                      |
| Phase 6 (Auth)     | `tests/e2e/flows/21-auth-register.spec.ts`, `22-auth-login.spec.ts`, `23-admin-dashboard.spec.ts`, `24-admin-moderation.spec.ts` |
| Phase 7 (Polish)   | `tests/e2e/flows/25-desktop-layout.spec.ts`, `26-responsive.spec.ts`                                                             |

### 14.6 Component Unit Tests (React Native Testing Library)

For shared components that run on both web and native, add unit tests in `packages/app/src/**/__tests__/`:

```
packages/app/src/
├── components/
│   ├── ui/
│   │   └── __tests__/
│   │       ├── Button.test.tsx
│   │       ├── Badge.test.tsx
│   │       ├── SearchBar.test.tsx
│   │       └── DifficultyBadge.test.tsx
│   ├── trail/
│   │   └── __tests__/
│   │       ├── TrailCard.test.tsx
│   │       └── TrailDetailHeader.test.tsx
│   ├── system/
│   │   └── __tests__/
│   │       └── SystemCard.test.tsx
│   ├── feature/
│   │   └── __tests__/
│   │       └── FeatureTypeIcon.test.tsx
│   └── offline/
│       └── __tests__/
│           └── StatusIndicator.test.tsx
├── stores/
│   └── __tests__/
│       ├── offlineStore.test.ts
│       ├── mapStore.test.ts
│       └── uiStore.test.ts
├── services/
│   └── __tests__/
│       ├── syncService.test.ts
│       └── offlinePackService.test.ts
└── hooks/
    └── __tests__/
        ├── useOffline.test.ts
        └── useSync.test.ts
```

Test framework: `@testing-library/react-native` + `jest` (already ships with Expo).

### 14.7 Test Data Strategy

#### For Detox Tests (Mobile)

- Mock the API at the **network layer** using a local proxy or Detox's mock server
- Alternative: run the real API (Docker Compose) with a `?seed=test` query param that creates deterministic test data
- Pre-condition data via `detox.device.launchApp({ newInstance: true, launchArgs: { seed: 'test' } })`
- For offline scenarios: pre-populate SQLite via launch args
- GPS mocks: `detox.device.setLocation(lat, lon)`

#### For Playwright Tests (Web)

- Existing `tests/e2e/helpers/api-mock.ts` pattern: intercept all API calls via `page.route()` and return fixture data
- Fixture data in `tests/e2e/fixtures/data.ts` — 3 systems, 3 trails, segments, features

### 14.8 CI/CD Pipeline

```yaml
# .github/workflows/test.yml (to be created)
name: Test
on: [push, pull_request]
jobs:
  unit-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: cd packages/api && bun test
      - run: cd packages/shared && bun test

  e2e-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run build:e2e
      - run: bunx playwright install --with-deps chromium
      - run: bun run e2e
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: tests/e2e/.results/

  e2e-android:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        api-level: [34]
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - name: Enable KVM
        run: |
          echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' | sudo tee /etc/udev/rules.d/99-kvm.rules
          sudo udevadm control --reload-rules
          sudo udevadm trigger --name-match=kvm

      - name: Start API + Postgres
        run: docker compose -f docker/docker-compose.yml up -d postgres api
      - name: Seed test data
        run: curl -X POST http://localhost:3000/api/seed -H "x-admin-secret: dev-secret"

      - name: AVD cache
        uses: actions/cache@v4
        with:
          path: ~/.android/avd/*
          key: avd-${{ matrix.api-level }}-v1

      - name: Create and run emulator
        uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: ${{ matrix.api-level }}
          arch: x86_64
          avd-name: detox_test
          script: |
            bun run detox:build-android:debug
            bun run detox:test-android:debug -- --ci --artifacts-location e2e/.results/

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: detox-artifacts
          path: e2e/.results/
```

### 14.9 Root Package.json Scripts

```jsonc
{
  "scripts": {
    // Existing
    "test": "turbo run test",
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui",
    "e2e:report": "playwright show-report",
    "build:e2e": "cd packages/app && npx expo export --platform web && cp -r dist ../../tests/e2e/.app",

    // Detox
    "detox:build-android:debug": "detox build --configuration android.emu.debug",
    "detox:build-android:release": "detox build --configuration android.emu.release",
    "detox:test-android:debug": "detox test --configuration android.emu.debug",
    "detox:test-android:release": "detox test --configuration android.emu.release",
    "detox:test-android:debug:ci": "CI=true detox test --configuration android.emu.debug --cleanup --artifacts-location e2e/.results/",

    // Dev
    "dev:android": "cd packages/app && npx expo run:android",
    "log:android": "adb logcat -s ReactNativeJS:V",
    "screenshot:android": "adb exec-out screencap -p > screenshot.png",
  },
}
```

---

### 14.10 Testing Phase-Gate Checklist

Each phase must pass the following before being considered "done":

| Phase   | Must Pass                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase 1 | Playwright: tabs, browse, system/trail detail, search, deep links. Detox: WebView map interactions.                                                                      |
| Phase 2 | Playwright: wiki view, edit, revisions, citations.                                                                                                                       |
| Phase 3 | **Detox: all 6 offline test files (download, browse, edit, sync, conflict, storage).** Playwright: storage manager UI shell. Bun test: syncService, conflict resolution. |
| Phase 4 | Playwright: feature CRUD, media gallery. Detox: camera/gallery.                                                                                                          |
| Phase 5 | Playwright: segment CRUD, split/merge/reorder.                                                                                                                           |
| Phase 6 | Playwright: auth flows, admin dashboard. Detox: SecureStore persistence, app lifecycle.                                                                                  |
| Phase 7 | Playwright: responsive layout, accessibility. Performance benchmarks (Lighthouse).                                                                                       |
| Phase 8 | Detox: all iOS tests (reuse Android test JS, different `.detoxrc.js` config).                                                                                            |
| Phase 9 | Detox: GPS recording, track playback. Bun test: attestation logic, trust score math.                                                                                     |

---

### 14.11 Risks & Mitigations

| Risk                              | Mitigation                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Detox + Expo compatibility        | Use `@config-plugins/detox` Expo plugin; test on SDK 52 early                                                                      |
| Detox + WebView interactions      | WebView inside RN is opaque to Detox matchers; use `testID` on RN wrapper views, use `webview.element(by.webView())` for OL events |
| Detox + op-sqlite                 | Native SQLite binding may not work in Android emulator with Detox; fall back to `expo-sqlite` for Detox test builds if needed      |
| Long test runtime (emulator boot) | Cache AVD snapshot; run only `android.emu.release` in CI; parallelize by test file (future)                                        |
| Flaky WebView map tests           | Retry with visual diff; use `waitFor` with generous timeouts (15s for tile render)                                                 |
| MBTiles generation in CI          | Pre-generate test packs, commit to repo or upload as CI artifact                                                                   |
| Network toggle flakiness          | Use Detox's `device.setURLBlacklist()` to simulate offline rather than airplane mode                                               |

---

## 15. Risks & Mitigations

| Risk                                    | Mitigation                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| WebView map performance                 | Profile tile rendering, use simplified geometries at lower zooms, lazy load features       |
| MBTiles files too large                 | Compress with gzip, limit max zoom to 14, prune unpopulated tiles                          |
| Sync conflicts frequent                 | Clear merge UI, eventually consider CRDT (automerge) for text                              |
| OSM data quality varies                 | Allow user edits from day 1, attestation system verifies over time                         |
| Spam/vandalism                          | Anonymous rate limiting, admin tools in Phase 6, trust scores in Phase 9                   |
| PostGIS hosting burden for self-hosters | Provide pre-loaded DB dump, simple docker compose, document resource needs                 |
| OpenLayers WebView bridge fragile       | Keep bridge surface small, version-lock the HTML bundle, test on multiple Android versions |

---

## 16. Open Questions (To Be Resolved)

- [x] License: AGPL-3.0 (resolved — see README).
- [ ] Name: "Magnum" final? (conflicts with .44 Magnum, Python package, ice cream brand)
- [ ] Production tile hosting: public OpenMapTiles instance or require self-hosting?
- [ ] iOS WebView restrictions (WKWebView limits SQLite access)? Need research.
- [x] Mapbox/MapLibre comparison: is OpenLayers the right choice or should we use MapLibre GL JS?
  - **Decision:** Start with OpenLayers. Re-evaluate if performance issues arise. MapLibre is also FOSS.
- [ ] Offline satellite imagery? Large files. Probably leave for post-MVP.
- [ ] International OSM extracts: Geofabrik covers most regions. Prioritize after US.
- [ ] Mobile app stores (Google Play, App Store): self-hosted backend means users configure server URL in app settings.
- [ ] Preset sync: ship inside the existing offline pack or via a dedicated lightweight sync endpoint? (Lean dedicated — presets change often and are small.)
- [ ] Centerline algorithm parameters (buffer distance, snap tolerance) — tune against real Ohio trace data during §21 step 5.
- [ ] Exact karma thresholds (50 / 500) and hide threshold (−3) — calibrate after early usage data.
- [ ] OSM upstreaming: OAuth 2.0 flow, dedup bbox check, and "verify schema" review UI — designed in (§21.16), built in a future phase.

---

## 17. Appendix A: File Structure (Full Tree)

```
magnum/
├── package.json                    # workspace root
├── turbo.json                      # turborepo config
├── tsconfig.base.json              # shared TS config
├── .gitignore
├── .env.example
├── PLAN.md                         # this file
├── README.md
├── LICENSE
│
├── docker/
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   ├── api.Dockerfile
│   ├── martin.conf                 # Martin tile server config
│   └── init-db.sql                 # extensions, initial seed
│
├── scripts/
│   ├── ingest-osm.sh
│   ├── osm2pgsql.lua               # OSM → postgis mapping
│   └── seed-ohio.ts                # test data seeder
│
├── packages/
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── drizzle.config.ts
│   │   ├── src/
│   │   │   ├── index.ts             # Hono app entry
│   │   │   ├── db/
│   │   │   │   ├── schema.ts        # Drizzle schema
│   │   │   │   ├── index.ts         # DB connection
│   │   │   │   └── migrations/      # Drizzle migrations
│   │   │   ├── routes/
│   │   │   │   ├── systems.ts
│   │   │   │   ├── trails.ts
│   │   │   │   ├── wiki.ts
│   │   │   │   ├── features.ts
│   │   │   │   ├── media.ts
│   │   │   │   ├── segments.ts
│   │   │   │   ├── offline.ts
│   │   │   │   ├── sync.ts
│   │   │   │   ├── auth.ts          # Phase 6
│   │   │   │   ├── admin.ts         # Phase 6
│   │   │   │   └── attestations.ts  # Phase 9
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── rate-limit.ts
│   │   │   │   └── cors.ts
│   │   │   ├── services/
│   │   │   │   ├── offline-pack.ts  # MBTiles generation
│   │   │   │   ├── sync.ts          # Sync logic
│   │   │   │   └── search.ts        # FTS queries
│   │   │   └── seed.ts              # Dev seed data
│   │   └── test/
│   │       ├── systems.test.ts
│   │       ├── wiki.test.ts
│   │       └── ...
│   │
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── system.ts
│   │   │   │   ├── trail.ts
│   │   │   │   ├── feature.ts
│   │   │   │   ├── wiki.ts
│   │   │   │   ├── media.ts
│   │   │   │   └── api.ts           # Request/response types
│   │   │   ├── schemas/             # Zod validation
│   │   │   │   ├── system.ts
│   │   │   │   ├── wiki.ts
│   │   │   │   ├── feature.ts
│   │   │   │   └── ...
│   │   │   ├── api/                 # Typed fetch client
│   │   │   │   ├── client.ts
│   │   │   │   └── endpoints.ts
│   │   │   ├── constants.ts         # enums, type tags, etc.
│   │   │   └── index.ts
│   │   └── test/
│   │
│   ├── map/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── MapContainer.tsx
│   │   │   ├── MapContainer.web.tsx
│   │   │   ├── MapContainer.native.tsx
│   │   │   ├── bridge/
│   │   │   │   ├── types.ts         # postMessage event types
│   │   │   │   └── ol-bridge.ts     # bridge API surface
│   │   │   ├── shared/
│   │   │   │   ├── styles.ts        # layer styles (shared)
│   │   │   │   ├── config.ts        # tile URLs, defaults
│   │   │   │   └── controls.ts      # zoom, layer, locate
│   │   │   ├── layers/
│   │   │   │   ├── TrailsLayer.ts
│   │   │   │   ├── SegmentsLayer.ts
│   │   │   │   ├── SystemsLayer.ts
│   │   │   │   ├── FeaturesLayer.ts
│   │   │   │   └── BaseLayer.ts
│   │   │   └── webview-html/        # HTML page loaded in mobile WebView
│   │   │       └── index.html       # includes OpenLayers + bridge
│   │   └── test/
│   │
│   └── app/
│       ├── package.json
│       ├── tsconfig.json
│       ├── app.json                 # Expo config
│       ├── babel.config.js
│       ├── metro.config.js
│       ├── src/
│       │   ├── app/
│       │   │   ├── _layout.tsx
│       │   │   ├── (tabs)/
│       │   │   │   ├── _layout.tsx
│       │   │   │   ├── explore.tsx
│       │   │   │   ├── systems.tsx
│       │   │   │   ├── trails.tsx
│       │   │   │   └── profile.tsx
│       │   │   ├── system/
│       │   │   │   └── [slug].tsx
│       │   │   ├── trail/
│       │   │   │   └── [slug].tsx
│       │   │   ├── segment/
│       │   │   │   └── [id].tsx
│       │   │   ├── feature/
│       │   │   │   └── [id].tsx
│       │   │   ├── wiki/
│       │   │   │   ├── [targetType]/
│       │   │   │   │   └── [targetId].tsx
│       │   │   │   └── edit/
│       │   │   │       └── [targetType]/
│       │   │   │           └── [targetId].tsx
│       │   │   ├── admin/           # Phase 6
│       │   │   │   ├── _layout.tsx
│       │   │   │   ├── dashboard.tsx
│       │   │   │   ├── revisions.tsx
│       │   │   │   └── users.tsx
│       │   │   ├── auth/            # Phase 6
│       │   │   │   ├── login.tsx
│       │   │   │   └── register.tsx
│       │   │   └── settings.tsx
│       │   ├── components/
│       │   │   ├── map/
│       │   │   │   ├── MapView.tsx
│       │   │   │   ├── MapControls.tsx
│       │   │   │   ├── TrailOverlay.tsx
│       │   │   │   ├── SegmentOverlay.tsx
│       │   │   │   ├── FeatureMarker.tsx
│       │   │   │   └── SystemBoundary.tsx
│       │   │   ├── wiki/
│       │   │   │   ├── WikiPageView.tsx
│       │   │   │   ├── WikiPageEditor.tsx
│       │   │   │   ├── CitationForm.tsx
│       │   │   │   └── RevisionHistory.tsx
│       │   │   ├── trail/
│       │   │   │   ├── TrailCard.tsx
│       │   │   │   ├── TrailDetailHeader.tsx
│       │   │   │   ├── SegmentList.tsx
│       │   │   │   └── SegmentEditor.tsx
│       │   │   ├── system/
│       │   │   │   ├── SystemCard.tsx
│       │   │   │   └── SystemHeader.tsx
│       │   │   ├── feature/
│       │   │   │   ├── FeatureCard.tsx
│       │   │   │   ├── FeatureForm.tsx
│       │   │   │   └── FeatureTypeIcon.tsx
│       │   │   ├── offline/
│       │   │   │   ├── StatusIndicator.tsx
│       │   │   │   ├── DownloadButton.tsx
│       │   │   │   ├── StorageManager.tsx
│       │   │   │   └── PendingQueue.tsx
│       │   │   ├── media/
│       │   │   │   ├── MediaGallery.tsx
│       │   │   │   ├── MediaUploader.tsx
│       │   │   │   └── ImageViewer.tsx
│       │   │   └── ui/
│       │   │       ├── Button.tsx
│       │   │       ├── Badge.tsx
│       │   │       ├── Card.tsx
│       │   │       ├── SearchBar.tsx
│       │   │       ├── DifficultyBadge.tsx
│       │   │       └── SegmentTypeBadge.tsx
│       │   ├── stores/             # Zustand
│       │   │   ├── authStore.ts
│       │   │   ├── offlineStore.ts
│       │   │   ├── mapStore.ts
│       │   │   └── uiStore.ts
│       │   ├── db/                 # SQLite (offline)
│       │   │   ├── index.ts
│       │   │   ├── schema.ts
│       │   │   ├── migrations.ts
│       │   │   └── queries/
│       │   │       ├── systems.ts
│       │   │       ├── trails.ts
│       │   │       ├── features.ts
│       │   │       ├── wiki.ts
│       │   │       └── sync.ts
│       │   ├── hooks/
│       │   │   ├── useApi.ts
│       │   │   ├── useOffline.ts
│       │   │   ├── useDownload.ts
│       │   │   ├── useSync.ts
│       │   │   └── useLocation.ts
│       │   ├── utils/
│       │   │   ├── geo.ts           # geometry helpers
│       │   │   ├── markdown.ts      # MD rendering config
│       │   │   └── image.ts         # resize, exif
│       │   └── providers/
│       │       ├── OfflineProvider.tsx
│       │       └── ThemeProvider.tsx
│       └── assets/
│           ├── icons/               # feature type icons, app icon
│           └── fonts/
```

---

## 18. Appendix B: Key Dependencies

### API (`packages/api`)

```json
{
  "dependencies": {
    "hono": "^4",
    "@hono/zod-validator": "^0.4",
    "drizzle-orm": "^0.38",
    "drizzle-kit": "^0.30",
    "pg": "^8",
    "zod": "^3",
    "bcryptjs": "^2", // Phase 6
    "jsonwebtoken": "^9", // Phase 6
    "@turf/turf": "^7" // Geometry operations
  },
  "devDependencies": {
    "@types/pg": "^8",
    "bun-types": "latest"
  }
}
```

### App (`packages/app`)

```json
{
  "dependencies": {
    "expo": "~52",
    "expo-router": "~4",
    "expo-location": "~18",
    "expo-camera": "~16",
    "expo-image-picker": "~16",
    "expo-image": "~2",
    "expo-secure-store": "~14",
    "expo-sqlite": "~15",
    "expo-file-system": "~18",
    "@op-engineering/op-sqlite": "^11",
    "react": "0.76",
    "react-native": "0.76",
    "react-native-web": "~0.19",
    "react-native-webview": "~13",
    "zustand": "^5",
    "zod": "^3",
    "@turf/turf": "^7",
    "react-native-markdown-display": "^7",
    "@react-native-community/netinfo": "^11",
    "@expo/vector-icons": "^14"
  }
}
```

### Map (`packages/map`)

```json
{
  "dependencies": {
    "ol": "^10",
    "react": "^18",
    "react-native": "^0.76",
    "react-native-webview": "^13"
  }
}
```

### Shared (`packages/shared`)

```json
{
  "dependencies": {
    "zod": "^3"
  }
}
```

---

## 19. Appendix C: Screenshot Wireframes (Textual)

### Explore Tab (Map View)

```
┌─────────────────────────────┐
│  🔍 Search trails...    🟢  │  ← StatusIndicator
│                             │
│     ┌──────────────┐        │
│     │              │        │
│     │   🗺️ MAP    │        │  ← OpenLayers
│     │              │        │     Trails colored by surface
│     │  ━━━━━━━━━━  │        │     System boundaries (shaded)
│     │  ━━━━━━━━━━  │        │     Feature markers (icons)
│     │              │        │
│     └──────────────┘        │
│                             │
│  ┌─┐ ┌─┐ ┌──────┐          │
│  │+│ │-│ │📍 My │          │  ← MapControls
│  └─┘ └─┘ └──────┘          │
│                             │
│  [Trails] [Systems] [Base]  │  ← Layer toggles
│                             │
├─────────────────────────────┤
│  🧭 Explore │ 📋 Systems │  │  ← Tab bar
│             │ 🛤️ Trails │ 👤 │
└─────────────────────────────┘
```

### Trail Detail Page

```
┌─────────────────────────────┐
│  ← Trail Detail             │
│                             │
│  ┌───────────────────────┐  │
│  │   Mini Map (trail     │  │
│  │   highlighted)        │  │
│  └───────────────────────┘  │
│                             │
│  Ohio Erie Trail            │
│  Moderate · 42.3 mi · 890ft │  ← TrailDetailHeader
│                             │
│  [Wiki] [Segments] [Feats]  │  ← Tabs
│  ─────────────────────────  │
│                             │
│  Segment 1: Prairie Path    │
│  Surface: Gravel            │
│  Hazards: None              │
│                             │
│  Segment 2: River Bend      │
│  Surface: Natural ⚠ Steep  │  ← SegmentList
│                             │
│  Segment 3: Road Connect    │
│  Surface: Road Connector 🚗 │
│  ─────────────────────────  │
│                             │
│  [Edit Segments]            │
│  [Download for Offline 42MB]│
│  [Record Hike 🎯]          │  ← Phase 9
└─────────────────────────────┘
```

### Wiki Editor

```
┌─────────────────────────────┐
│  ← Edit Wiki       [Save]   │
│                             │
│  Title:                      │
│  ┌─────────────────────────┐│
│  │ Trail Conditions        ││
│  └─────────────────────────┘│
│                             │
│  [Edit] [Preview]           │
│                             │
│  ┌─────────────────────────┐│
│  │ ## Access               ││
│  │                         ││
│  │ Trailhead parking is    ││
│  │ available at the ...    ││
│  │                         ││
│  │ ## Hazards              ││
│  │ - Muddy after rain      ││
│  │ - Steep section at ... ││
│  └─────────────────────────┘│
│                             │
│  Citations:                  │
│  📎 https://metropark...   ×│
│  📷 sign-board.jpg         ×│  ← CitationForm
│  [+ Add Citation]           │
│                             │
│  Edit summary:               │
│  ┌─────────────────────────┐│
│  │ Updated hazards section ││
│  └─────────────────────────┘│
│                             │
│  Contributing as: anonymous  │
└─────────────────────────────┘
```

### Offline Status Bar States

```
🟢 Online                          — connected, can edit
🟡 Offline (3 pending changes)     — disconnected, has unsynced work
🔴 Offline (no data for this area) — disconnected, no downloaded pack
⚪ Syncing 2 of 3 changes...       — uploading queued edits
```

### Storage Manager

```
┌─────────────────────────────┐
│  Settings > Storage         │
│                             │
│  ████████████░░░ 320MB / 500MB
│                             │
│  Downloaded Systems:         │
│                             │
│  📦 Hocking Hills            │
│     42MB · Synced Jun 15    │
│     [Update] [Delete]        │
│                             │
│  📦 Wayne National Forest   │
│     128MB · Synced Jun 14   │
│     [Update] [Delete]        │
│                             │
│  📦 Cuyahoga Valley          │
│     89MB · Synced Jun 10    │
│     [Update] [Delete]        │
│                             │
│  [Download All] [Delete All] │
└─────────────────────────────┘
```

---

_Last updated: 2026-06-26_
_Phase 0 starts with: monorepo scaffold, Docker Compose, DB schema, API skeleton, RN app shell._

---

## 20. DevOps & Agent Workflow

This section describes the development workflow for agents (and humans) to quickly iterate on the app.

### 20.1 Quick Start

```bash
# 1. Start backend (Postgres + Martin + API)
docker compose -f docker/docker-compose.yml up -d
cd packages/api && bun run dev  # API on :3000 with hot-reload

# 2. Start Metro bundler (in separate terminal)
cd packages/app
EXPO_PUBLIC_API_URL=http://localhost:3000 \
EXPO_PUBLIC_MARTIN_URL=http://localhost:3001 \
  npx expo start --dev-client --port 8081

# 3. Start emulator (in separate terminal)
$ANDROID_HOME/emulator/emulator -avd test_device -no-audio -no-window -gpu swiftshader_indirect -no-snapshot -memory 1536

# 4. Port forwarding (run once per emulator boot)
adb reverse tcp:8081 tcp:8081   # Metro
adb reverse tcp:3000 tcp:3000   # API
```

### 20.2 Dev Scripts

```bash
# Start full dev environment
./scripts/dev-start.sh --all

# Build APK and install on connected emulator
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk
./scripts/dev-build-android.sh

# Build release APK
./scripts/dev-build-android.sh --release
```

### 20.3 Fast Edit Cycle (JS/TS changes only)

When only editing JS/TS code (no native changes):

1. **Start Metro** — `cd packages/app && npx expo start --dev-client --port 8081`
2. **Ensure app has debug APK installed** — `./scripts/dev-build-android.sh`
3. **Launch app on emulator** — `adb shell am start -n org.magnum.app/.MainActivity`
4. **Edit code** — Save file → Metro detects change → App reloads automatically
5. **See errors** — `adb logcat -s ReactNativeJS:V AndroidRuntime:E`

**No rebuild needed for JS/TS edits!** Metro's fast refresh handles it.

### 20.4 When Rebuild IS Required

Rebuild the APK only when:

- Adding/removing native dependencies (`bun add`/`bun remove` anything with native code)
- Changing `app.json` or Expo config
- Adding new native asset files (images, fonts in `assets/`)
- After `bun install` that changes native module versions

```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk
cd packages/app/android
./gradlew app:assembleDebug -x lint -x test -PreactNativeArchitectures=x86_64
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### 20.5 Viewing Device Logs

```bash
# JS console logs + errors
adb logcat -s ReactNativeJS:V

# Full Android logs (crash info)
adb logcat AndroidRuntime:E *:S

# Clear and watch
adb logcat -c && adb logcat -s ReactNativeJS:V
```

### 20.6 Common Issues

**Build fails with "Plugin [id: 'expo-module-gradle-plugin'] was not found"**

- This happens when Bun's nested node_modules layout confuses Gradle
- The `expo-module-gradle-plugin` npm package is an empty placeholder — remove it if installed
- For expo modules using the new plugin format, convert them to use `apply plugin: 'com.android.library'` + manual `ExpoModulesCorePlugin.gradle` application
- Or use `npx expo install expo-sqlite@~15.0.0` to get SDK 52 compatible versions

**Build fails with Kotlin compilation errors (Unresolved reference: NativeArrayBuffer etc.)**

- Version mismatch: package is for a newer Expo SDK than 52
- Install compatible version: `bun add expo-sqlite@~15.0.0`

**Bun install breaks the Android build**

- Bun uses a nested `node_modules/.bun/` structure that Gradle can't resolve
- If the build breaks after `bun install`, try running `npx expo prebuild --platform android --clean` first
- If `expo-modules-core` isn't resolvable, manually symlink it:
  ```bash
  cd packages/app/node_modules
  ln -sf ../../../node_modules/.bun/expo-modules-core@2.2.3/node_modules/expo-modules-core expo-modules-core
  ```

**Emulator not found by adb**

```bash
adb kill-server && adb start-server
adb devices  # should show emulator-5554
```

**Metro port already in use**

```bash
lsof -i :8081 | grep LISTEN | awk '{print $2}' | xargs kill
```

### 20.7 API Development

```bash
# API hot-reloads on file changes
cd packages/api && bun run dev

# Run API tests
cd packages/api && bun test

# Seed test data (requires admin secret)
curl -X POST http://localhost:3000/api/seed \
  -H "x-admin-secret: dev-secret-change-me"

# Run DB migration
cd packages/api && bun run db:migrate
```

### 20.8 Environment Variables

Copy `.env.example` to `.env` and customize:

| Variable                 | Default               | Description                 |
| ------------------------ | --------------------- | --------------------------- |
| `DB_HOST`                | localhost             | PostgreSQL host             |
| `DB_NAME`                | magnum                | Database name               |
| `DB_USER`                | magnum                | Database user               |
| `DB_PASSWORD`            | changeme              | Database password           |
| `MARTIN_URL`             | http://localhost:3001 | Martin tile server          |
| `EXPO_PUBLIC_API_URL`    | http://localhost:3000 | API URL (exposed to app)    |
| `EXPO_PUBLIC_MARTIN_URL` | http://localhost:3001 | Martin URL (exposed to app) |
| `ADMIN_SECRET`           | dev-secret-change-me  | Admin header secret         |

**IMPORTANT**: `EXPO_PUBLIC_*` variables are inlined at BUILD TIME. If you change them, you must rebuild the APK.

For Metro dev server, set them when starting:

```bash
EXPO_PUBLIC_API_URL=http://localhost:3000 npx expo start --dev-client --port 8081
```

### 20.9 Testing Mobile App

```bash
# For JS changes: no rebuild needed, Metro live reloads
# For native changes: rebuild APK

# Take screenshot
adb exec-out screencap -p > screenshot.png

# Check app process
adb shell ps | grep magnum

# Force stop app
adb shell am force-stop org.magnum.app
```

---

## 21. UI Redux — Presets, Hierarchy, Trails & Social

A redesign of the contributor experience across four axes: (1) a preset-based feature system modeled on OSM, (2) system-hierarchy creation/editing, (3) a GPS-trace-driven trail synthesis with tiered trail trust, and (4) a karma/reputation engine with Wikipedia-style moderation. This supersedes the old Phase 9 attestation model (§11).

### 21.1 Design Principles

- **OSM-shaped, not OSM-typed.** Hikers tap icons and answer ≤5 tiny questions; moderators define presets backed by OSM tags. Upstreaming to OSM is _designed in now_ (presets carry OSM tag maps) but the OAuth + review UI is built later.
- **Wiki-style everywhere.** Any logged-in contributor can create/edit systems and reorganize the hierarchy. Every mutation is revision-logged so moderators (and even other users) can revert.
- **Tiered trail trust.** `premium` (official import, frozen) → `elevated` (promoted, frozen) → `synthesized` (built/maintained from GPS trace segments). Only `synthesized` trails are touched by GPS data.
- **Karma is the core currency.** Upvotes on traces and features are the primary way users earn points. Karma → trust tier → privileges.

### 21.2 Information Architecture (by frequency)

Surfaces are weighted by how often the flow is used. Common actions are prominent; infrequent ones are reachable but not primary.

| Frequency | Flows | Surface |
| --- | --- | --- |
| Primary (common) | Add Feature, Upload/Record Trace, Organize Trails | Explore FABs; System "Trails & Traces" tab |
| Secondary (reachable) | Create/Edit System, draw boundary, hierarchy tree | "+" in Systems tab header; System detail Edit |
| Moderator (gated) | Preset editor, premium import, promote trail, synthesis review, patrol feed | `admin/*` routes |

Explore FAB column becomes: `[Upload Trace]` above `[Add Feature]` (the download-area control moves into a menu or appears context-only).

### 21.3 Core User Flows

#### 21.3.1 Add Feature (bottom sheet, hiker-optimized)

Replaces navigation to `/feature/create`. The dedicated create route is retained only as the full-feature editor / edit-from-detail entry point.

1. Explore → **Add Feature FAB** → banner "Tap map to place" (reuse existing placing mode).
2. Tap map → pin drops at `[lon,lat]` → **bottom sheet rises** in place (swipe-down cancels).
3. **Sheet step 1 — Preset grid:** icon tiles grouped by category (top chips to jump sections, or sectioned vertical scroll). Collapsible search for power users.
4. Tap a preset → **Sheet step 2 — Questions + Photo:**
   - 0–N questions rendered as large controls (boolean = big toggle; select = segmented control, ≤5 options).
   - **System auto-detected** from the pin point via a point-in-polygon query → shown as a chip "📍 Mountains Park" with a "change" affordance. Trail = optional picker of that system's trails.
   - Name optional (auto-fills `"{PresetLabel}"` if blank).
   - **Photo: big "📷 Add photo" button — always encouraged, skippable.**
   - Save → online POST, or offline queue via `pending_contributions`.

#### 21.3.2 Upload / Record Trace

1. Explore → **Upload Trace FAB** → bottom sheet with two options.
2. **Import path:** file picker (GPX/GeoJSON) → parse → preview LineString on mini-map → Save.
3. **Record path:** full-screen recorder — big Start/Stop, live distance + duration + current track; background location via `expo-location` + `expo-task-manager` with a persistent notification. Stop → preview → Save.
4. On Save (both): `gps_traces` row, `status=active`, `weight=1.0`, `source=import|recorded`. **The user does NOT pick a system** — traces are auto-tagged by geometry ∩ system boundaries (see §21.9 jobs).
5. Offline record/import → queue in `pending_contributions`; server runs segmentation + tagging after sync.

#### 21.3.3 Organize Trails (segment → trail assignment)

The common "organizing trails" flow.

1. System detail → **"Trails & Traces"** tab → **Organize** → full-screen map (`system/[slug]/organize`).
2. Map shows existing trails (solid, tier-colored), trace segments (semi-transparent, colored per trace), unassigned segments highlighted.
3. Tap a segment → bottom sheet:
   - Algorithm proposal: "Suggests: **Old Log Trail** (conf. 0.82, 3 agree / 1 disagree)".
   - Actions: **Assign to trail** (picker) / **Propose new trail** / **Downvote trace** / **Agree with proposal**.
   - Feeds `trace_segment_votes`; consumed by the next synthesis run.
4. Toolbar toggles: filter by trace, show/hide proposals, "only unassigned".

#### 21.3.4 Create / Edit System & Hierarchy

1. **Systems tab → "+" in header** (not on the home screen — infrequent flow).
2. **New System screen:** Name (slug auto); **Draw boundary** (full-screen map, polygon draw — tap vertices, "✓ close" to finish; reuses the draw interaction pattern from Explore's offline-area draw); **Provenance** (ownership source, source date, external URL — required per `outline.md`); optional super-system picker.
3. Save → revision-logged → **triggers trace re-tag job** for the new boundary.
4. System detail → **Edit** (same form prefilled; redraw boundary); **"Move to…" action sheet** (Move to super-system / Promote to system / Demote to sub-system / Merge into another); **Add sub-system**; **Assign trails** (multi-select, auto-suggested by boundary intersection).
5. **Hierarchy tree** (`systems/tree`): collapsible Super→System→Sub; tap = detail; "⋯" = Move-to sheet.

### 21.4 Preset System

Replaces the hardcoded `FEATURE_TYPES` enum (`packages/shared/src/constants.ts`) and `features.type_tag`. Presets live in the DB, are synced to the device and cached (a few MB; first app open requires network).

#### Data model

```sql
presets(
  id UUID PRIMARY KEY,
  key TEXT UNIQUE,            -- stable slug, e.g. 'bench'
  label TEXT,                 -- 'Bench'
  icon_name TEXT,             -- Ionicons glyph name
  icon_color TEXT,
  category TEXT,              -- grouping for the picker grid
  osm_tags JSONB,             -- {"amenity":"bench"} — future upstream mapping
  questions JSONB,            -- [{key,type:"boolean"|"select",label,options?[<=5]}]
  upstreamable BOOLEAN,       -- shown in the future OSM review queue
  sort_order INTEGER,
  created_by UUID,
  updated_at TIMESTAMPTZ
)

-- features migration
--   DROP type_tag
--   ADD preset_id UUID REFERENCES presets(id)
--   ADD answers JSONB          -- the user's answers to that preset's questions
```

#### Bundled default presets (~20 across 5 categories)

| Category | Presets |
| --- | --- |
| Rest & Shelter | bench, picnic table, shelter, campsite |
| Water & Sanitation | drinking water, spring, restroom, waste basket |
| Navigation | trailhead, map board, guidepost, sign, intersection |
| Hazards & Obstacles | fallen tree, washout, steep section, road connector |
| Landmarks | viewpoint, notable tree, waterfall, cave entrance, bridge, tunnel |

Shipped as a seed migration (one row per old enum value, with OSM tag maps). Existing features migrate by mapping `type_tag → preset.key`.

#### Sample question schemas

- `bench` → `material`[wood/stone/metal/plastic], `backrest`[yes/no], `seats`[1/2/3+]
- `drinking_water` → `potable`[yes/no/seasonal], `covered`[yes/no]
- `shelter` → `type`[lean-to/cabin/ruin], `sleeps`[1-2/3-4/5+]
- `viewpoint` → `panoramic`[yes/no], `covered`[yes/no]

#### UI surfaces

- **Hiker flow:** preset icon-grid + quick questions + photo (§21.3.1). `FeatureTypeIcon` becomes DB-driven.
- **Feature detail:** preset icon + answer badges (`Material: Wood`, `Backrest: Yes`); ↑/↓ vote + score + contributor chip; "Edit" opens the sheet prefilled.
- **Moderator preset editor** (`admin/presets`, `admin/presets/[id]`): icon picker, OSM tag key/value editor, question builder (add question; boolean or select with ≤5 options), upstreamable toggle. Revision-logged.

### 21.5 System Hierarchy Management

The DB already has `super_systems`, `systems`, `sub_systems` + join tables (`packages/api/src/db/schema.ts`). This phase adds CRUD, drawn boundaries, the Move-to organizer, and revision logging.

- **API:** CRUD for `super_systems` and `sub_systems` (mirror existing `POST /systems`); join management (assign/remove super, trail↔sub); boundary via draw or GeoJSON; provenance fields required.
- **Boundaries are drawn** on the map (polygon tool), reusing Explore's draw-interaction pattern. Provenance (`ownership_source` + `source_date`) is required per `outline.md`.
- **Permissions:** any logged-in contributor can create/edit; all actions revision-logged and revertable (see §21.8).
- **Hierarchy tree** with **"Move to…" action sheet** (tap node → action sheet; no drag-drop needed on mobile).

### 21.6 Trail Tiers & GPS Synthesis

Adds a `tier` to trails and a GPS-trace pipeline that creates/maintains `synthesized` trails.

#### Trail tiers

```sql
-- trails migration
ALTER TABLE trails ADD COLUMN tier TEXT
  CHECK (tier IN ('premium','elevated','synthesized'))
  DEFAULT 'synthesized';
```

- **Premium** — moderator-only import of official GeoJSON/shapefile. Geometry authoritative; never re-derived.
- **Elevated** — a synthesized trail promoted by a moderator. Geometry frozen (snapshot of the current derived geometry).
- **Synthesized** — geometry derived and re-derivable from trace segments.

Existing rows default to `synthesized` (already-`verified=true` rows may seed as `elevated`).

#### New tables

```sql
gps_traces(
  id UUID PRIMARY KEY,
  user_id UUID, contributor_name TEXT,
  geometry GEOMETRY(LineString,4326),
  source TEXT,            -- 'import' | 'recorded'
  weight FLOAT DEFAULT 1.0,
  upvotes INT DEFAULT 0, downvotes INT DEFAULT 0,
  status TEXT DEFAULT 'active',   -- active | ignored | removed
  recorded_at TIMESTAMPTZ, created_at TIMESTAMPTZ
)

trace_systems(            -- auto-tagged by geometry ∩ boundary (many-to-many)
  trace_id UUID, system_id UUID, PRIMARY KEY(trace_id,system_id)
)

gps_trace_segments(       -- server-cut pieces of a trace
  id UUID PRIMARY KEY,
  trace_id UUID REFERENCES gps_traces(id) ON DELETE CASCADE,
  geometry GEOMETRY(LineString,4326),
  cluster_id INT,                 -- assigned by synthesis run
  proposed_trail_id UUID          -- algorithm's best guess
)

trace_segment_votes(      -- wiki-style user marking (segment → trail)
  id UUID PRIMARY KEY,
  segment_id UUID, user_id UUID, trail_id UUID,
  vote INT CHECK (vote IN (-1,1)),
  UNIQUE(segment_id,user_id)
)

synthesis_runs(           -- audit/history of regeneration
  id UUID PRIMARY KEY,
  system_id UUID, started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ,
  trails_updated INT, trails_proposed INT, status TEXT
)
```

#### Synthesis algorithm (per-system, server-side PostGIS batch)

1. **Cut** each active trace into segments (Douglas-Peucker simplify → split at significant vertices).
2. **Cluster** by spatial density: buffer each segment ~5–10 m, union overlapping buffers → clusters; singletons stay single.
3. **Assign/propose:** for each cluster, find the nearest existing `synthesized` trail within tolerance → propose assignment; else flag as a **possible new trail** for moderator review.
4. **Weighted centerline:** for each trail, take all assigned segments; `weight = trace.weight × vote_confidence`; compute the centerline (iterative snap / median axis) and write to `trails.geometry`.
5. **Run log** in `synthesis_runs`; proposals queue in the moderator review list.

Algorithm parameters (buffer distance, snap tolerance) are tuned against real Ohio trace data during implementation.

#### Trace lifecycle & moderation

- Upload against (auto-detected) system. `weight` starts at 1.0.
- **Downvote** (any user): `downvotes++`; recompute `weight = (upvotes+1 − downvotes) / (upvotes+downvotes+2)` (Wilson-style). Below **0.3** → `status='ignored'` (excluded from synthesis).
- **Moderator remove:** `status='removed'` (soft delete, kept for audit).
- **Trace → trail marking:** users tap a segment and pick a trail or "propose new"; votes accumulate; synthesis uses weighted majority.

#### UI surfaces

- **System detail — "Trails & Traces" tab:** trace list (contributor, date, weight, status), upload button, per-trace ↑/↓, moderator remove, toggle on map, **Organize** button.
- **Trail detail — tier badge** (Premium / Elevated / Synthesized) beside the existing `verified` badge. Synthesized shows "Derived from N segments / M traces · regen {date}". Geometry-edit tools hidden for premium/elevated (metadata edits still allowed).
- **Organize view** (`system/[slug]/organize`): full-screen segment map + tap-sheet (assign / propose / downvote / agree).
- **Moderator synthesis queue** (`admin/synthesis`): "possible new trail" proposals → approve (create `synthesized` trail) / reject; **promote** action `synthesized → elevated`.
- **Premium import** (`admin/import`): moderator-only GeoJSON/shapefile upload → creates `premium` trails (skips synthesis).

### 21.7 Karma & Reputation Engine

`users.trust_score` (existing column) becomes the **karma total** — lifetime-cumulative, kept current via incremental updates on each vote (no batch recompute).

#### Earning

- An upvote on your **trace** or **feature** adds `tierWeight(voter)` points.
  - `tierWeight`: New = 1, Established = 2, Trusted = 3, Moderator = 3.
- A downvote subtracts `tierWeight(voter)` (display floors at 0; raw value tracked for flagging).
- Upvote point value is scaled by the voter's tier to resist sockpuppet farming.

#### Trust tiers (lifetime karma thresholds)

| Tier | Karma | Can do |
| --- | --- | --- |
| New | 0–49 | add features, upload traces, edit wikis, vote |
| Established | 50–499 | + create/edit systems, draw boundaries, organize trails, revert others (within protection) |
| Trusted | 500+ | + propose presets, approve new-trail proposals, promote synthesized→elevated; reverts not auto-flagged |
| Moderator | appointed | + remove traces, delete within protection, premium import, ban, rollback, override protection |

#### Votes table (generic, the karma source)

```sql
votes(
  id UUID PRIMARY KEY,
  target_type TEXT,        -- 'feature' | 'trace' | 'preset' | 'system'
  target_id UUID,
  user_id UUID,
  value INT CHECK (value IN (-1,1)),
  created_at TIMESTAMPTZ,
  UNIQUE(target_type,target_id,user_id)
)
```

#### Thresholds

- **Feature hide/queue:** net score (↑ − ↓) ≤ **−3** → `hidden`, moderator-removal queue.
- **Trace weight:** `w = (↑+1 − ↓) / (↑+↓+2)`; `w < 0.3` → `ignored`.

#### Social UI

- Compact **↑/↓ + score** control on Feature cards, Trace rows, and System/Preset pages.
- **Profile page:** karma total, tier badge, tabs (Traces / Features / Edits), upvotes-received summary. Optional leaderboard (low priority).

### 21.8 Moderation & Protection (Wikipedia-style)

#### Revision logging

The existing `revisions` table is generalized: `target_type` expands to cover `system | super_system | sub_system | preset | feature | trace` (in addition to wiki pages). Every create/update/delete/reassign writes a revision with contributor + before/after payload. **Any logged-in user can revert** any revision, subject to protection.

#### Auto-protection tiers (per entity)

| Level | Trigger | Who can edit / move / revert |
| --- | --- | --- |
| Normal | default | any logged-in user |
| Semi-protected | ↑ ≥ 10 **or** children ≥ 3 | Established+ |
| Full-protected | moderator-set **or** ↑ ≥ 100 | Moderator only |

**Hard rule (always enforced server-side):** a delete is blocked if the system has ≥ 2 trails AND the creator ≠ actor AND the actor is not a moderator.

#### Behavior flagging (automated, anti-vandalism)

Low-trust actions are flagged into a moderator **patrol feed** (`admin/patrol`):

- New-tier user edits/reverts a semi-protected or fuller entity.
- New-tier user performing > 5 reversions in 10 minutes.
- Raw-negative-karma user doing any delete/revert.
- Mass reversion of a popular system.

Patrol feed actions: **Revert** (single revision) and **Rollback** (revert an actor's consecutive edits to one entity).

### 21.9 Data Model Changes (consolidated)

Summary of all schema additions/changes introduced by this redux (see §21.4, §21.6, §21.7):

- `presets` table; `features` drops `type_tag`, adds `preset_id` + `answers JSONB`.
- `trails` adds `tier`.
- `votes` (generic, ±1) — karma source.
- `gps_traces`, `trace_systems`, `gps_trace_segments`, `trace_segment_votes`, `synthesis_runs`.
- `revisions.target_type` expanded to cover system-hierarchy entities, presets, features, traces.
- `users.trust_score` repurposed as the cached karma total.

### 21.10 Background Jobs

1. **Trace re-tagging** — on system create / boundary edit, plus a daily cron. Recomputes `trace_systems` via `ST_Intersects(trace.geometry, system.boundary)`. Handles traces recorded before a system existed.
2. **Trace segmentation** — async on upload; simplify → split → `gps_trace_segments`.
3. **Synthesis run** — per-system, nightly + on-demand (moderator). Cluster → assign/propose → weighted centerline → write `trails.geometry` for synthesized; proposals → mod queue.
4. **Karma** — incremental on each vote (DB trigger); no scheduled job.

### 21.11 Offline Notes

- Presets sync to device and cache (few MB). First app open requires network.
- Traces recorded/imported offline queue in `pending_contributions` (existing pattern); the server runs segmentation + tagging after sync.
- Voting offline queues the same way.

### 21.12 Build Order

1. **Karma + votes + trust tiers + protection + patrol feed** — everything else depends on trust.
2. **Presets** — schema migration, ~20 bundled defaults, device sync+cache, Add-Feature bottom sheet, preset editor.
3. **System hierarchy** — drawn boundaries, Move-to sheet, tree, generalized revisions, re-tag job.
4. **Trace ingestion** — import + live record, auto-tag, segmentation, Trails & Traces tab, voting/weighting.
5. **Synthesis** — assignment/organize view first (manual), then auto-synthesis algorithm + proposal queue + promote/import.

Karma is sequenced first because privileges, protection, and the downvote/hide logic all depend on trust tiers being live.

### 21.13 Open Details (resolve during implementation)

- Centerline algorithm parameters (buffer distance, snap tolerance) — tune against real Ohio trace data in step 5.
- Whether the preset list ships inside the existing offline pack or via a dedicated lightweight sync endpoint (lean dedicated — it changes often and is small).
- Exact karma thresholds (50 / 500) and hide threshold (−3) — calibrate after early usage data.

### 21.14 Screen-by-Screen Layout Reference

Consolidated reference for every screen touched by the redux. Individual flow details are in §21.3.

| Screen | Route | Key elements |
| --- | --- | --- |
| **Explore** | `(tabs)/explore` | Search bar + status dot (top). Map. **FAB column bottom-right: `[Upload Trace]` above `[Add Feature]`** (download-area control moves into a menu). Base-layer switcher (existing). |
| **Add Feature sheet** | (bottom sheet on Explore) | Step 1: preset icon-grid (category chips + icon tiles). Step 2: questions + auto-system chip + photo + save. Swipe-down cancels. |
| **Upload Trace sheet** | (bottom sheet on Explore) | Import / Record toggle → file picker (GPX/GeoJSON) or full-screen recorder. |
| **Feature detail** | `feature/[id]` | Preset icon + answer badges (`Material: Wood`, `Backrest: Yes`), description, photos, wiki, **↑/↓ vote + score + contributor chip**, "Edit" (opens sheet prefilled). |
| **System detail** | `system/[slug]` | Map preview, meta, trails list, **"Trails & Traces" tab**, wiki, Edit / Move-to / Add-sub / Assign-trails actions, ↑/↓ vote. |
| **Trails & Traces tab** | (within system detail) | Trace list (contributor, date, weight, status, ↑/↓, mod-remove), toggle-on-map, **Organize** button. |
| **Organize view** | `system/[slug]/organize` | Full-screen segment map + tap-sheet (assign to trail / propose new / downvote trace / agree with proposal). Toolbar: filter by trace, show/hide proposals, only-unassigned. |
| **Trail detail** | `trail/[slug]` | **Tier badge** (Premium / Elevated / Synthesized) beside existing `verified` badge. Synthesized: "Derived from N segments / M traces · regen {date}". Geometry-edit tools hidden for premium/elevated. |
| **Systems tree** | `systems/tree` | Collapsible Super→System→Sub. Tap = detail. "⋯" = Move-to action sheet. |
| **Profile** | `profile` (enhanced) | Karma total, **tier badge**, tabs (Traces / Features / Edits), upvotes-received summary. Optional leaderboard (low priority). |
| **Admin: Patrol** | `admin/patrol` | Recent-changes feed across all entity types. Filters (by user, by type, flagged-only). **Revert** (single revision) + **Rollback** (revert user's consecutive edits to an entity). |
| **Admin: Presets** | `admin/presets`, `admin/presets/[id]` | Preset list + editor: icon picker, OSM tag key/value editor, question builder (boolean or select ≤5 options), upstreamable toggle. Revision-logged. |
| **Admin: Synthesis** | `admin/synthesis` | New-trail proposal queue from `synthesis_runs` → approve (create `synthesized` trail) / reject. **Promote** action: `synthesized → elevated`. |
| **Admin: Import** | `admin/import` | Moderator-only GeoJSON/shapefile upload → creates `premium` trails (skips synthesis). |

**Vote control:** compact ↑/↓ arrows + score, on Feature cards, Trace rows, and System/Preset pages.

### 21.15 New API Endpoints

Endpoints introduced by the redux, grouped by area. These augment the existing §9 API.

**Presets**

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/presets` | List all presets (for device sync + cache) |
| `POST` | `/api/presets` | Create preset (moderator+) |
| `PUT` | `/api/presets/:id` | Update preset (moderator+) |
| `DELETE` | `/api/presets/:id` | Delete preset (moderator+) |

**Votes (karma)**

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/votes` | Cast upvote/downvote `{target_type, target_id, value}` |
| `DELETE` | `/api/votes` | Remove user's vote (same unique key) |
| `GET` | `/api/entities/:type/:id/score` | Vote tally for an entity |

**Features (updated)**

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/features` | Now accepts `preset_id` + `answers` (not `type_tag`) |
| `PUT` | `/api/features/:id` | Same shape |
| `GET` | `/api/systems/contains?lon=&lat=` | Point-in-polygon: which system contains this point (auto-detect for feature placement) |

**System hierarchy**

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/super-systems` | Create super-system |
| `PUT` | `/api/super-systems/:id` | Update (incl. boundary) |
| `DELETE` | `/api/super-systems/:id` | Delete (protection-gated) |
| `POST` | `/api/sub-systems` | Create sub-system |
| `PUT` | `/api/sub-systems/:id` | Update |
| `DELETE` | `/api/sub-systems/:id` | Delete (protection-gated) |
| `POST` | `/api/systems/:id/super-systems` | Assign super-system |
| `DELETE` | `/api/systems/:id/super-systems/:superId` | Remove assignment |
| `POST` | `/api/systems/:id/trails` | Assign trails (multi) |
| `DELETE` | `/api/systems/:id/trails/:trailId` | Remove trail from system |
| `POST` | `/api/systems/:id/move` | Move-to action (promote/demote/merge) |

**GPS traces**

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/traces` | Upload trace (GPX/GeoJSON geometry; auto-tagged to systems) |
| `GET` | `/api/systems/:id/traces` | List traces in a system |
| `GET` | `/api/traces/:id` | Trace detail |
| `DELETE` | `/api/traces/:id` | Moderator remove (soft) |
| `GET` | `/api/traces/:id/segments` | Server-cut segments for a trace |
| `POST` | `/api/trace-segments/:id/vote` | Assign segment → trail / vote |
| `POST` | `/api/traces/:id/vote` | Upvote/downvote trace (affects weight) |

**Synthesis**

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/systems/:id/synthesize` | Trigger synthesis run (moderator) |
| `GET` | `/api/synthesis-runs/:id` | Run status + results |
| `GET` | `/api/admin/synthesis-proposals` | New-trail proposal queue |
| `POST` | `/api/admin/synthesis-proposals/:id/approve` | Approve → create `synthesized` trail |
| `POST` | `/api/admin/synthesis-proposals/:id/reject` | Reject proposal |
| `POST` | `/api/admin/trails/:id/promote` | Promote `synthesized → elevated` |
| `POST` | `/api/admin/trails/import` | Premium import (GeoJSON → `premium` trail) |

**Revisions (generalized)**

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/revisions?target_type=&target_id=` | Revision history for any entity type |
| `POST` | `/api/revisions/:id/revert` | Revert any revision (protection-gated; any logged-in user within tier) |

**Patrol & moderation**

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/admin/patrol` | Flagged actions feed (filters: user, type, flagged-only) |
| `POST` | `/api/admin/patrol/rollback` | Rollback: revert actor's consecutive edits to one entity |

**Profile & karma**

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/users/:id` | Profile: karma total, tier, contribution counts |
| `GET` | `/api/users/:id/contributions` | User's traces, features, edits (paginated) |

### 21.16 Future: OSM Upstreaming (Designed-In, Built Later)

Presets already carry `osm_tags` and an `upstreamable` flag so the data model is ready. The actual push-to-OSM flow is a future phase. Design when built:

1. **OAuth 2.0 login** — moderator logs in with their personal OpenStreetMap account. Edits are tied to their OSM reputation and they agree to the OSM Contributor Terms.
2. **Verify Schema UI** — admin sees a feature's photo + preset-derived OSM tags, confirms or edits before push. Example: "This is a **Bench**. Uploading as `amenity=bench`. [Edit Tags] [Submit to OSM]".
3. **Dedup check** — before creating, query OSM via bounding-box API for existing features of the same tag within 5–10 m. Warn: "A bench already exists here in OSM. Update instead of create?"
4. **`source` tag** — all pushed data includes `source=magnum_user_submission` so other OSM mappers know provenance.
5. **Manual review only** — no automated/bot uploads. Every push goes through a moderator.
6. **Eligibility** — only `upstreamable=true` presets with a photo are queued. Features with net-negative votes are excluded.

The admin review queue (`admin/upstream`) surfaces eligible features, grouped by preset, with photo + proposed tags + dedup status.

---

## 22. Recording UX — "Trace Mode" (redesigned §21.3.2 / Phase 9)

A redesign of the contributor recording flow to make capturing a GPS trace a **first-class** action: a single tap from the home screen, a persistent indicator while recording, and a kill-safe buffer so no data is lost to process death.

### 22.1 Design Principles

- **One tap to start, one tap to return.** The Record tab sits between Explore and Systems, so a hiker is at most one tap from the active trace view from any screen. The persistent banner is the back-channel: tap it from any tab to jump back into the recording.
- **No data loss to kills.** Every location event is written to the SQLite mirror *as it arrives*, inside the same callback. If the OS terminates the process, the SQLite row is the source of truth and the recovery modal offers to continue, end & save, or discard.
- **Background tracking with foreground controls.** The library (`react-native-background-geolocation`) runs a foreground service so tracking continues with the screen off. The user-visible controls — pause, submit, discard — live on the Record tab, which is the only place with enough space for the map preview + stats + three big buttons.
- **Submit follows the offline pattern.** Online: `POST /api/traces`. Offline: queue in `pending_contributions` and the next sync upload picks it up. The status indicator in the header reflects the queued state.

### 22.2 Information Architecture

| Surface | What it does |
| --- | --- |
| **Record tab (idle)** | Big "Start recording" CTA, "Import a file" link, recent traces list. |
| **Record tab (active)** | Status pill (Recording/Paused/Submitting), live map with growing polyline + tail dot, three stats (Duration, Distance, Points), Pause/Resume + Submit buttons, Discard link. |
| **Persistent banner** | Red (recording) or amber (paused) bar across the top of every screen, shows duration and tap-target to return to the Record tab. |
| **Recovery modal** | On app launch with an unfinished session, modal offers Continue / End & Save / Discard. |
| **Explore FAB** | Continues to expose "Upload Trace" (file import) — the Record tab is the home for recording, the FAB is the home for file imports. |

### 22.3 Library Choice: `react-native-background-geolocation`

We use the Transistorsoft background-geolocation library for native Android/iOS. Rationale:

- **High accuracy + motion-aware power management** out of the box.
- **Foreground service** with a persistent notification (required on modern Android for "always" tracking).
- **Persists its own location log** to a local SQLite, which we can use for kill-recovery backfill in addition to our own mirror.
- **Survives reboot** (`startOnBoot: true`) — a hiker on a multi-day trip can reboot the phone without losing the trace.
- **iOS Always authorization** is handled by the library's built-in flow.

Web fallback: the same Record tab runs in the browser dev build using `navigator.geolocation.watchPosition`. Points are held in-memory only (no SQLite mirror on web) and submitted as a single trace on tap. This is for dev convenience — the production target is the native app.

### 22.4 Configuration

`app.json` configures the library via the official Transistorsoft Expo config plugin:

```jsonc
{
  "plugins": [
    "expo-router",
    "expo-asset",
    "expo-font",
    "@config-plugins/detox",
    [
      "react-native-background-geolocation",
      {
        "license": {
          "appId": "com.licensetest",
          "entitlements": ["core"]
        }
      }
    ]
  ]
}
```

The license option is what injects the manifest meta-data:

```xml
<meta-data
    android:name="com.transistorsoft.locationmanager.license"
    android:value='{"app_id":"com.licensetest","entitlements":["core"]}' />
```

The Transistorsoft config plugin emits this in the release variant (it gates the meta-data on the build type). Replace the test `appId` with the production license issued by Transistorsoft for the real app.

The runtime config (high accuracy, foreground service, notification text, etc.) lives in `backgroundGeolocationService.ts` and is passed to `BackgroundGeolocation.ready()` when a session starts. See that file for the exact values.

### 22.5 SQLite Mirror (v4)

Two new tables back the live recording buffer:

```sql
CREATE TABLE trace_sessions (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'recording',  -- recording | paused | submitted | discarded
  source TEXT NOT NULL DEFAULT 'recorded',   -- recorded (import lives in pending_contributions)
  total_points INTEGER NOT NULL DEFAULT 0,
  total_meters REAL NOT NULL DEFAULT 0,
  server_trace_id TEXT,                       -- assigned after a successful submit
  pending_contribution_id INTEGER,            -- FK to pending_contributions when offline-queued
  updated_at TEXT NOT NULL
);

CREATE TABLE trace_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,                       -- monotonic per-session ordinal
  lon REAL NOT NULL,
  lat REAL NOT NULL,
  elevation REAL,
  accuracy REAL,
  speed REAL,
  heading REAL,
  recorded_at TEXT NOT NULL,                  -- when the GPS sample was taken
  received_at TEXT NOT NULL,                  -- when we wrote it to SQLite
  FOREIGN KEY (session_id) REFERENCES trace_sessions(id) ON DELETE CASCADE
);
```

Schema version bumped to 4. The migration is additive (CREATE IF NOT EXISTS) so existing v3 installations keep their data and gain the new tables.

### 22.6 Recovery Flow (Kill-Safe)

1. On every `onLocation` event the service writes to `trace_points` (with a fresh `seq`) and bumps `total_points` on the session row. Both writes happen inside the same JS tick so a kill between them leaves either the previous state (correct) or the new state (correct) — never a half-written row.
2. On app launch, `TraceRecoveryModal` calls `checkForRecoverableSession()` which runs `SELECT * FROM trace_sessions WHERE status IN ('recording','paused')`. If a row exists, the modal renders.
3. **Continue** — `resumeTraceRecording(session)` re-invokes the library with the existing `extras.session_id` and re-attaches the onLocation callback. The library's own on-disk log is used to backfill any points we missed into our mirror.
4. **End & Save** — `submitTraceSession(id)` reads the points from SQLite, builds a `LineString`, and either POSTs to `/api/traces` or queues in `pending_contributions` (offline). The session row flips to `submitted`.
5. **Discard** — `discardTraceSessionById(id)` calls `BackgroundGeolocation.stop()` and marks the row `discarded`. The points stay in the DB for audit but the session is excluded from "recent" listings.

### 22.7 Files Added / Changed

**New:**
- `packages/app/app/(tabs)/record.tsx` — the Record tab (idle + active states)
- `packages/app/app/trace/import.tsx` — file-import wrapper route
- `packages/app/src/components/trace/RecordingBanner.tsx` — persistent recording indicator
- `packages/app/src/components/trace/TraceRecoveryModal.tsx` — kill-recovery modal
- `packages/app/src/services/backgroundGeolocationService.ts` — wraps the library, owns the SQLite mirror
- `packages/app/src/stores/traceStore.ts` — Zustand store for live recording state
- `packages/app/src/types/react-native-background-geolocation.d.ts` — minimal type stubs

**Changed:**
- `packages/app/app.json` — adds the Transistorsoft config plugin
- `packages/app/app/_layout.tsx` — mounts `RecordingBanner` and `TraceRecoveryModal`
- `packages/app/app/(tabs)/_layout.tsx` — adds the Record tab
- `packages/app/app/trace/record.tsx` — **deleted** (replaced by the tab)
- `packages/app/src/components/trace/UploadTraceSheet.tsx` — "Record a trace" entry points to the Record tab
- `packages/app/src/db/schema.ts` — `SCHEMA_VERSION = 4`, adds `trace_sessions` + `trace_points`
- `packages/app/src/services/offlineDataService.ts` — session/point helpers + `addPendingContribution` now returns the row id
- `packages/map/src/MapContainer.native.tsx` — accepts `liveRoute` prop, handles `setLiveRoute`/`clearLiveRoute` bridge commands
- `packages/map/src/bridge/types.ts` — adds the two new commands
- `packages/map/src/bridge/ol-bridge.ts` — adds them to the script bridge
- `packages/map/src/webview-html/index.html` — adds a top-most `liveRoute` vector layer
- `packages/map/src/types.ts` — adds the `liveRoute` prop
- `packages/app/package.json` — `react-native-background-geolocation` + `@transistorsoft/config-plugin-background-geolocation`

### 22.8 Two-Clicks-from-Home UX

| User intent | Path | Clicks |
| --- | --- | --- |
| Start a trace | tap Record tab → tap "Start recording" | 2 |
| Return to active recording from another tab | tap the persistent banner | 1 |
| Submit a trace | tap Submit on the Record tab (or on the banner → Record tab → Submit) | 1–2 |
| Pause / resume | tap Pause/Resume on the Record tab | 1 |
| Discard | tap Discard → confirm | 2 |
| Recover from a kill | open the app → tap Continue / End & Save / Discard | 1 |

The user-never-loses-data promise is the recovery modal: even on a hard kill, the next app launch surfaces the unfinished trace and offers one-tap resolution.

### 22.9 Future Work

- **Live trail synthesis preview.** Overlay the user's existing `synthesized` trails (faded) under the live route so they can see which trail they're extending.
- **Voice prompts.** "Half a mile to the next trail intersection" — driven by proximity queries against the live route + nearby trails.
- **Photo attachments.** Long-press on the map during a recording to drop a geo-tagged photo into the trace as a feature.
- **Multi-day recordings.** The schema supports indefinite session length (50k point cap is the only hard limit). Multi-day traces would split into segments by day.
