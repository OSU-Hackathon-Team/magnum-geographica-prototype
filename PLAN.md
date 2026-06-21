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

| Layer | Choice | Rationale |
|---|---|---|
| Mobile | Expo SDK 52+, React Native 0.76+ | Managed workflow, OTA updates |
| Web | React Native Web (via Expo) | Single codebase, feature parity |
| State | Zustand | Minimal, works on RN + web identically |
| Nav | expo-router (file-based) | Shared navigation between web + mobile |
| Maps | OpenLayers 10 | FOSS, mature, vector tile support |
| Tiles | OpenMapTiles schema, Martin tile server | FOSS, PostGIS-backed, MBTiles export |
| Offline DB | op-sqlite (Android), expo-sqlite (web fallback) | Fast SQLite bindings |
| Backend | Bun + Hono 4 | Fast, TypeScript-native, easy Docker |
| ORM | Drizzle ORM | Type-safe, good PostGIS support |
| DB | PostgreSQL 16 + PostGIS 3 | Spatial queries, proven |
| Media | BYTEA in PG (MVP) → MinIO (later) | Simple first, scalable later |
| Auth | None for MVP; JWT later | Anonymous contributor_name string in MVP |
| Monorepo | Turborepo | Fast caching, parallel builds |
| Docker | Single docker-compose.yml | Self-hostable by anyone |

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

| Layer | Source |
|---|---|
| Base map (terrain/streets) | OpenMapTiles public instance (free tier) or self-hosted |
| Hillshade / satellite | Optional overlay (self-hosted or public) |
| Trail overlays | Martin tile server from PostGIS (vector tiles) |
| System boundaries | Martin tile server |
| Features / landmarks | GeoJSON layer (fetched per-viewport) |

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

| Feature | Online | Offline |
|---|---|---|
| Browse map | Yes | Yes (MBTiles) |
| View trails/systems | Yes | Yes |
| Read wiki pages | Yes | Yes |
| Edit wiki pages | Yes | Yes (queued) |
| Add features | Yes | Yes (queued) |
| Attach photos | Yes | Yes (queued, stored as base64 in SQLite) |
| Search | Yes | Yes (SQLite FTS) |
| View revision history | Yes | Partial (local + server history, no full log) |
| Admin actions | Yes | No |

---

## 9. API Design (Hono + Bun)

### 9.1 Phase 0 — Scaffold

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Server health check |
| `GET` | `/api/systems` | List systems (paginated) |
| `GET` | `/api/systems/:id` | System detail with boundary GeoJSON |
| `GET` | `/api/trails` | List trails (paginated, filterable) |
| `GET` | `/api/trails/:id` | Trail detail with geometry GeoJSON |
| `POST` | `/api/seed` | Dev-only: seed Ohio test data from OSM extract |

### 9.2 Phase 1 — Map & Browse

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/systems/:id/trails` | Trails in a system |
| `GET` | `/api/systems/:id/features` | Features in a system |
| `GET` | `/api/trails/:id/segments` | Segments of a trail (ordered) |
| `GET` | `/api/trails/:id/features` | Features on a trail |
| `GET` | `/api/search?q=&type=` | Full-text search across systems, trails, features |
| `GET` | `/api/tiles/{z}/{x}/{y}.pbf` | Proxy to Martin tile server |

### 9.3 Phase 2 — Wiki Pages

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/wiki-pages?target_type=&target_id=` | Get wiki page for target |
| `POST` | `/api/wiki-pages` | Create wiki page |
| `PUT` | `/api/wiki-pages/:id` | Update wiki page (creates revision) |
| `GET` | `/api/wiki-pages/:id/revisions` | Revision history (paginated) |
| `GET` | `/api/wiki-pages/:id/revisions/:rev_id` | Specific revision content |
| `POST` | `/api/wiki-pages/:id/revert` | Revert to a specific revision (creates new revision) |
| `POST` | `/api/citations` | Add citation to wiki page |
| `DELETE` | `/api/citations/:id` | Remove citation |
| `GET` | `/api/revisions/recent` | Recent edits across all targets (admin preview) |

### 9.4 Phase 3 — Offline

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/offline-packs/:system_id/info` | Size estimate, last generated timestamp |
| `POST` | `/api/offline-packs/generate/:system_id` | Generate (or return cached) pack |
| `GET` | `/api/offline-packs/:system_id/download` | Download pack file |
| `POST` | `/api/sync/contributions` | Bulk upload pending offline changes |
| `GET` | `/api/sync/updates?since=` | Get changes since timestamp |

### 9.5 Phase 4 — Features & Media

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/features` | Create feature |
| `PUT` | `/api/features/:id` | Update feature |
| `DELETE` | `/api/features/:id` | Delete feature |
| `POST` | `/api/media` | Upload media (attached to feature/trail/system) |
| `GET` | `/api/media/:id` | Download media file |
| `DELETE` | `/api/media/:id` | Delete media |

### 9.6 Phase 5 — Segments

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/trails/:id/segments` | Create segment |
| `PUT` | `/api/segments/:id` | Update segment metadata |
| `DELETE` | `/api/segments/:id` | Delete segment |
| `POST` | `/api/trails/:id/segments/reorder` | Reorder segments (pass array of IDs) |
| `POST` | `/api/trails/:id/segments/split` | Split segment at a point |
| `POST` | `/api/trails/:id/segments/merge` | Merge two adjacent segments |

### 9.7 Phase 6 — Auth & Admin

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Login, get JWT |
| `GET` | `/api/auth/me` | Current user info |
| `GET` | `/api/admin/revisions` | Recent revisions (paginated, with filters) |
| `POST` | `/api/admin/revisions/:id/revert` | Admin revert |
| `DELETE` | `/api/admin/wiki-pages/:id` | Admin delete wiki page |
| `DELETE` | `/api/admin/features/:id` | Admin delete feature |
| `POST` | `/api/admin/users/:id/ban` | Ban user |
| `GET` | `/api/users/:id` | Public user profile |
| `GET` | `/api/users/:id/contributions` | User's revisions |

### 9.8 Phase 9 — Attestations

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/attestations/strong` | Upload GPS track (strong attestation) |
| `POST` | `/api/attestations/weak` | Thumbs up/down (weak attestation) |
| `GET` | `/api/trails/:id/attestations` | Attestation stats for trail |
| `GET` | `/api/users/:id/trust-score` | User trust score |

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

### Phase 0: Foundation (Weeks 1-2)

**Goal:** Green monorepo to working app skeleton with live DB.

#### Tasks

1. **Monorepo setup**
   - Init root `package.json` with workspaces
   - `turbo.json` with build/dev/lint/test pipelines
   - `tsconfig.base.json` shared config
   - ESLint + Prettier shared config

2. **Docker environment**
   - `docker-compose.yml`:
     ```yaml
     services:
       postgres:
         image: postgis/postgis:16-3.4
         ports: ["5432:5432"]
         environment: [POSTGRES_DB=magnum, POSTGRES_USER=magnum, POSTGRES_PASSWORD=magnum]
         volumes: [pgdata:/var/lib/postgresql/data]
       martin:
         image: maplibre/martin:latest
         ports: ["3001:3000"]
         environment: [DATABASE_URL=postgres://magnum:magnum@postgres:5432/magnum]
         depends_on: [postgres]
       api:
         build: docker/api.Dockerfile
         ports: ["3000:3000"]
         environment: [DATABASE_URL=postgres://magnum:magnum@postgres:5432/magnum]
         depends_on: [postgres]
         volumes: [./packages/api:/app]
     volumes:
       pgdata:
     ```

3. **API package** (`packages/api`)
   - Init Bun + Hono
   - Drizzle ORM setup with `drizzle.config.ts`
   - Generate all migrations from DDL above
   - `POST /api/seed` — insert test data (3 systems, ~15 trails in Ohio)
   - Health endpoint
   - CORS for dev

4. **Shared package** (`packages/shared`)
   - TypeScript types for all entities (mirrors DB schema)
   - Zod validation schemas for API inputs
   - API client (thin wrapper around fetch with types)
   - Constants (feature type tags, difficulty levels, surface types)

5. **App package** (`packages/app`)
   - `npx create-expo-app@latest` with TypeScript template
   - Add `react-native-web`, `@expo/vector-icons`, `zustand`, `expo-router`, `op-sqlite`
   - Root layout with React Navigation tabs
   - Four tabs: Explore (map placeholder), Systems (empty list), Trails (empty list), Profile (empty)
   - Zustand store skeleton (auth, offline status, settings)

6. **Map package** (`packages/map`)
   - `MapContainer.web.tsx` — renders OpenLayers with OSM base layer
   - `MapContainer.native.tsx` — renders WebView with blank page (no OL yet)
   - Shared styles/config files (empty, to be filled in Phase 1)

7. **Verify**
   - `bun run dev` starts API on :3000
   - `npx expo start --web` shows app with tabs
   - Docker Compose brings up Postgres + Martin
   - `POST /api/seed` populates test data
   - `GET /api/systems` returns JSON

#### Deliverables
- Monorepo builds without errors
- API serves test data from PostGIS
- App skeleton renders on web with tab navigation
- Docker Compose runs the full backend stack

---

### Phase 1: Map & Trail Browsing (Weeks 3-5)

**Goal:** Real map with trail overlays, System/Trail hierarchy browsing.

#### Tasks

1. **OSM extract ingestion**
   - Script to download Ohio `.osm.pbf` from Geofabrik
   - `osm2pgsql` import into PostGIS with custom style
   - Filter: only `highway=path|footway|track|cycleway|bridleway` (non-motorized)
   - Map OSM tags to our schema (surface, name, etc.)
   - Run once, commit script for reproducibility

2. **Martin tile configuration**
   - `martin.conf` — SQL function for trail tiles, system boundaries
   - Trail layer: `SELECT id, name, geometry, surface_type FROM trails WHERE geometry && ST_MakeEnvelope(...)`
   - System layer: `SELECT id, name, boundary FROM systems WHERE boundary && ST_MakeEnvelope(...)`

3. **OpenLayers integration — Web**
   - `MapContainer.web.tsx`:
     - Base layer: OpenMapTiles raster or self-hosted vector
     - Vector tile layers: trails (colored by surface), systems (translucent fill)
     - Feature click → navigate to detail
     - Zoom, attribution, layer toggle controls
   - `MapControls.tsx` — zoom buttons, layer picker, locate-me

4. **OpenLayers integration — Mobile (WebView bridge)**
   - `MapContainer.native.tsx`:
     - WebView loads local HTML bundle with OpenLayers
     - `olBridge` object: `setViewport(trails, systems)`, `flyTo(lon, lat, zoom)`
     - Event listeners: `mapClick`, `featureSelect` sent to RN via postMessage
   - Ensure touch interactions work (pinch zoom, tap)

5. **Navigation & routing**
   - `explore.tsx` — full-screen map, search bar overlay
   - `systems.tsx` — FlatList of systems, searchable
   - `system/[slug].tsx` — system detail: mini-map, description, trail list, wiki link
   - `trails.tsx` — FlatList of trails, filterable by difficulty/system
   - `trail/[slug].tsx` — trail detail: map with trail highlighted, stats, segments, features, wiki link
   - `segment/[id].tsx` — segment detail (read-only for now): surface, hazards, photos

6. **Search**
   - API: full-text search across systems, trails, features (Postgres `ts_vector`)
   - `SearchBar.tsx` — typeahead dropdown, results grouped by type
   - Client-side debouncing, minimum 3 characters

7. **Map ↔ Navigation integration**
   - Tap trail on map → push `/trail/[slug]`
   - Tap feature on map → push `/feature/[id]`
   - "View on map" button from detail pages → fly to geometry
   - Deep link support: `/map?lat=40.0&lon=-83.0&zoom=12`

#### Deliverables
- Ohio trails displayed on map with color-coded surface types
- Complete System → Trail → Segment drill-down
- Search working end-to-end
- Map works on both web and Android (WebView bridge)

---

### Phase 2: Wiki Pages (Weeks 6-7)

**Goal:** Anonymous wiki editing and revision history.

#### Tasks

1. **Wiki page view**
   - `WikiPageView.tsx` — rendered markdown, citations list, revision count, last edited
   - Markdown renderer: use `react-native-markdown-display` (supports web + native)
   - Citation display: link (tappable, opens browser) or image thumbnail

2. **Wiki page editor**
   - `WikiPageEditor.tsx` — markdown textarea with live preview toggle
   - `CitationForm.tsx` — add URL citation or upload image
   - Save → PUT `/api/wiki-pages/:id` with `contributor_name`
   - Create → POST `/api/wiki-pages` (auto-creates for target)
   - "Edit Summary" input (one-line description of change)

3. **Revision history**
   - `RevisionHistory.tsx` — chronological list of revisions
   - Tap revision → view that version's content
   - "Revert to this version" button → creates new revision with old content
   - Contributor name displayed on each revision

4. **Wiki integration in detail pages**
   - System detail: wiki tab/toggle showing the System's wiki page
   - Trail detail: wiki tab/toggle showing the Trail's wiki page
   - Feature detail: wiki tab/toggle
   - Each has an "Edit" button → wiki editor

5. **Simple admin (dev secret)**
   - `GET /api/revisions/recent` — last 50 revisions across all targets
   - Admin secret in header (`x-admin-secret`) gates revert/delete
   - Future migration path: replace with JWT auth in Phase 6

#### Deliverables
- Create, edit, view wiki pages on any target
- Full revision history with revert
- Citations (URL + image) working

---

### Phase 3: Offline Mode (Weeks 8-11)

**Goal:** Complete offline experience on Android.

#### Tasks

1. **SQLite initialization**
   - `packages/app/src/db/` — SQLite schema, migrations
   - `op-sqlite` on Android, `expo-sqlite` on web (for dev/testing)
   - Mirror tables: systems, trails, segments, features, wiki_pages, revisions, media
   - WKB geometry stored as blobs (no spatial indexes in SQLite, use bounding box columns for spatial queries)
   - FTS5 virtual table for offline search

2. **Download system**
   - `DownloadButton.tsx` on System detail page (appears when online)
   - Shows estimated size before download (from `/api/offline-packs/:id/info`)
   - Progress bar during download (multiple files: MBTiles, GeoJSON, Wiki JSON)
   - Stores all data in SQLite
   - MBTiles stored as file or blob, registered with OpenLayers

3. **MBTiles integration**
   - OpenLayers plugin/custom source that reads from SQLite MBTiles
   - On Android: WebView bridge calls native SQLite → returns tile data
   - On web (dev): fetches from local SQLite WASM or server
   - Tile fallback: if no local tile for zoom/extent, show grey "not downloaded" overlay

4. **Offline map rendering**
   - Detect connectivity: `@react-native-community/netinfo` or `navigator.onLine`
   - When offline → switch map source to local MBTiles
   - When online → use Martin tile server
   - Seamless transition (user shouldn't notice, except for status indicator)

5. **Offline browsing**
   - System list filtered to downloaded only (when offline)
   - Trail detail reads from SQLite
   - Wiki pages read from SQLite
   - Feature markers from GeoJSON in SQLite
   - Search uses FTS5

6. **Offline editing (contribution queue)**
   - When offline, wiki edits → write to `pending_contributions` table
   - `PendingQueue.tsx` — list of pending changes, each with type, target, preview, delete button
   - Feature creation/deletion queued similarly

7. **Sync upload**
   - On reconnect → auto-trigger sync (debounced, 5s after connectivity change)
   - POST `/api/sync/contributions` with all pending changes
   - Handle 409 Conflict → show conflict resolution UI
   - On success → clear pending entries, update local copies with server-assigned IDs

8. **Sync download (updates)**
   - On reconnect → GET `/api/sync/updates?since=2024-01-01T00:00:00Z`
   - Apply updates to local SQLite
   - Update `last_synced` timestamp

9. **Storage manager UI**
   - `StorageManager.tsx` in Settings
   - List of downloaded Systems: name, size, last synced, delete button
   - Total usage bar: `[=========>    ] 320MB / 500MB`
   - "Delete All" button with confirmation

10. **Status indicator**
    - `StatusIndicator.tsx` in tab bar header
    - Reads Zustand `offlineStore` (online status, pending count, sync status)
    - Updates reactively on connectivity change

#### Deliverables
- User downloads a System → goes offline → browses map, trails, wiki pages
- User edits wiki page offline → reconnects → edit syncs successfully
- Conflict resolution works (user sees diff, picks version)
- Storage manager shows usage, allows deletion

---

### Phase 4: Features & Media (Weeks 12-13)

**Goal:** Create and view landmarks on the map, attach photos.

#### Tasks

1. **Feature creation**
   - Long-press on map → drop pin → "Add Feature" modal
   - `FeatureForm.tsx` — name, type tag (picker), description, trail association (optional)
   - Save → POST `/api/features`
   - Offline: queued in `pending_contributions`

2. **Feature display**
   - `FeatureMarker.tsx` — icon per type_tag (trailhead = P, water = 💧, shelter = 🏠, etc. — use simple SVG icons, no emojis in production)
   - Feature markers on explore map + system detail map + trail detail map
   - Tap marker → bottom sheet or modal with name, type, description, photo thumbnail
   - Tap through to full feature detail page

3. **Media attachment**
   - `MediaUploader.tsx` — "Take Photo" (camera) or "Choose from Gallery"
   - EXIF orientation correction
   - Resize to max 2048px before upload (bandwidth + storage)
   - POST `/api/media` with base64 data
   - Offline: store base64 in SQLite `pending_contributions`
   - Progress indicator during upload

4. **Media gallery**
   - `MediaGallery.tsx` — horizontal scroll of photo thumbnails
   - `ImageViewer.tsx` — full-screen image with pinch zoom
   - Media on feature detail, trail detail, system detail pages

5. **Feature editing**
   - Update name, type, description, trail association
   - Delete feature (with confirmation)
   - All queued offline if needed

#### Deliverables
- Create features from map long-press
- Attach photos to features/trails/systems
- Feature icons on map
- Works offline

---

### Phase 5: Segments & Advanced Trail Editing (Weeks 14-15)

**Goal:** First-class segment editing with metadata overrides.

#### Tasks

1. **Segment create/edit**
   - On trail detail page: "Edit Segments" mode
   - `SegmentEditor.tsx` — form: name, surface type (dropdown), hazards (multi-select), steep grade (toggle), one-way (toggle), is road connector (toggle), sort_order
   - Create new segment: draw on map or select from existing trail geometry split
   - Update segment metadata

2. **Segment geometry tools**
   - Split segment: tap point on trail → split into two segments
   - Merge segments: select two adjacent → merge into one
   - Reorder: drag-and-drop list (or up/down buttons)

3. **Segment visualization**
   - `SegmentOverlay.tsx` — segments on map with distinct styling:
     - Natural = brown dashed
     - Gravel = tan
     - Paved = dark grey
     - Boardwalk = light brown
     - Road connector = grey with road icon markers
   - Hazard icons on map (steep = warning triangle, water crossing = wave)
   - Segment list on trail detail shows surface type badge, hazard badges
   - Tap segment in list → fly to it on map

4. **Metadata inheritance**
   - Segment metadata **overrides** trail defaults
   - Trail difficulty computed from segment difficulties (max of segments)
   - Trail length computed from sum of segment lengths
   - Trail elevation gain computed from sum of segment gains

#### Deliverables
- Create, edit, split, merge, reorder segments
- Segments visually distinct on map
- Hazard/road-connector flags visible

---

### Phase 6: User Accounts & Moderation (Weeks 16-18)

**Goal:** Full auth, admin panel, spam prevention.

#### Tasks

1. **Auth backend**
   - `users` table migration
   - `POST /api/auth/register` — email + password → bcrypt hash
   - `POST /api/auth/login` → JWT (access + refresh tokens)
   - Middleware: `authRequired`, `adminRequired`
   - Anonymous edits still allowed (no auth header) but flagged

2. **Auth frontend**
   - Register / Login screens
   - Zustand `authStore`: token, user, isAuthenticated
   - JWT stored in SecureStore (expo-secure-store)
   - Auto-attach token to API requests
   - Profile screen: username, join date, contribution count

3. **Author tracking**
   - `author_id` now populated on revisions when authenticated
   - `contributor_name` used for anonymous edits
   - User profile shows their revisions

4. **Admin panel**
   - `admin/dashboard.tsx` — stats: recent edits, new users, flagged content
   - `admin/revisions.tsx` — revision feed with filters (by user, by target type, by date range)
   - Diff view: side-by-side markdown comparison (old vs new)
   - Revert button with "reason" input
   - Delete wiki page / feature with confirmation
   - `admin/users.tsx` — user list, search, role toggle, ban/unban

5. **Spam prevention (basic)**
   - Rate limiting on API (per-IP, per-token): 10 edits/minute
   - Flag suspicious patterns (no auth, rapid edits, all-links content)
   - Admin can "flag" revisions → flagged feed

#### Deliverables
- User registration and login
- Admin dashboard with revision feed, revert, ban
- Anonymous editing still works
- Rate limiting

---

### Phase 7: Web Parity & Polish (Weeks 19-20)

**Goal:** Web app caught up, admin polished, general polish.

#### Tasks

1. **Web verification pass**
   - Test every screen on web (Chrome, Firefox)
   - Fix any RNW-specific bugs (touch events, gestures, responsiveness)
   - Map interaction: ensure click/tap works identically
   - Responsive layout: desktop sidebar + map vs mobile stack
   - Verify PWA behavior (optional: add manifest, service worker)

2. **Admin polish**
   - Stats dashboard with charts (revisions per day, new users, etc.)
   - Batch operations (revert multiple, delete multiple)
   - Export data as GeoJSON / CSV

3. **Performance**
   - Lazy load routes (expo-router async imports)
   - Virtualize long lists (FlatList)
   - Image caching (expo-image for thumbnails)
   - Map tile caching headers
   - Bundle size audit (avoid shipping unused OpenLayers plugins)

4. **Accessibility**
   - Screen reader labels for map (announce feature names on focus)
   - Color-blind friendly trail colors (use patterns in addition to color)
   - Minimum touch target sizes (44px)

5. **Analytics setup** (optional, FOSS-friendly)
   - Plausible or Umami for basic page views
   - No user tracking, no PII

#### Deliverables
- Web app fully functional
- Admin polished
- Performance acceptable (map loads <2s, list scroll 60fps)
- Accessibility baseline met

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

### Phase 9: Attestation System (Weeks 22-24)

**Goal:** GPS verification, trust scores, reputation.

#### Tasks

1. **GPS tracking (strong attestation)**
   - "Record Hike" button on trail detail
   - Background location tracking (expo-location, expo-task-manager)
   - GPX export format
   - Upload track → `/api/attestations/strong`
   - Server validates: track must overlap trail geometry by >80%

2. **Quorum-based verification**
   - N distinct users (N=3 initially, configurable) submit valid strong attestations
   - Trail automatically marked `verified = true`
   - "Verified" badge on trail detail and map
   - Admin can override verification

3. **Thumbs up/down (weak attestation)**
   - "Was this trail accurate?" thumbs up/down on trail detail
   - POST `/api/attestations/weak`
   - Display ratio (e.g., "87% found this accurate (42 votes)")

4. **Trust scores**
   - Each user has `trust_score` (0.0–1.0)
   - Score decays:
     - Valid strong attestation: +0.05
     - False strong attestation (off-path, impossible speed): -0.20
     - Weak attestation that matches majority: +0.01
     - Weak attestation against majority: -0.02
   - Users below 0.3: edits require admin approval
   - Users below 0.0: cannot submit attestations

5. **Track playback**
   - On trail detail: "View GPS tracks" overlay
   - Multiple user tracks shown on map (different colors)
   - Toggle individual tracks on/off
   - Opacity indicates trust score of submitter

#### Deliverables
- Record and submit GPS tracks
- Verified trail badges
- Trust score system
- Track playback visualization

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
- Expo autolinker may generate `expo.core.ExpoModulesPackage` import instead of `expo.modules.ExpoModulesPackage` — create a delegating `expo/core/ExpoModulesPackage.java` wrapper class in the expo module's android source directory as a workaround.
- Gradle needs Java 21 (OpenJDK 26+ not supported).

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

| Layer | Tool | What |
|---|---|---|
| API unit tests | Bun test | Hono route handlers, Drizzle queries |
| API integration | Bun test + Testcontainers | Seed DB, test endpoints |
| Shared validation | Vitest | Zod schemas parse/fail correctly |
| Map (web) | Playwright | Map renders, clicks produce events |
| App (web) | Playwright | Full user flows via RNW |
| App (mobile) | Detox or Maestro | E2E on Android emulator |
| Offline sync | Manual + scripted | Disconnect network, edit, reconnect |

Test pyramid: heavy on API tests, moderate on component tests, light on E2E.

---

## 15. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| WebView map performance | Profile tile rendering, use simplified geometries at lower zooms, lazy load features |
| MBTiles files too large | Compress with gzip, limit max zoom to 14, prune unpopulated tiles |
| Sync conflicts frequent | Clear merge UI, eventually consider CRDT (automerge) for text |
| OSM data quality varies | Allow user edits from day 1, attestation system verifies over time |
| Spam/vandalism | Anonymous rate limiting, admin tools in Phase 6, trust scores in Phase 9 |
| PostGIS hosting burden for self-hosters | Provide pre-loaded DB dump, simple docker compose, document resource needs |
| OpenLayers WebView bridge fragile | Keep bridge surface small, version-lock the HTML bundle, test on multiple Android versions |

---

## 16. Open Questions (To Be Resolved)

- [ ] License: MIT vs AGPL vs GPLv3?
- [ ] Name: "Magnum" final? (conflicts with .44 Magnum, Python package, ice cream brand)
- [ ] Production tile hosting: public OpenMapTiles instance or require self-hosting?
- [ ] iOS WebView restrictions (WKWebView limits SQLite access)? Need research.
- [ ] Mapbox/MapLibre comparison: is OpenLayers the right choice or should we use MapLibre GL JS?
  - **Decision:** Start with OpenLayers. Re-evaluate if performance issues arise. MapLibre is also FOSS.
- [ ] Offline satellite imagery? Large files. Probably leave for post-MVP.
- [ ] International OSM extracts: Geofabrik covers most regions. Prioritize after US.
- [ ] Mobile app stores (Google Play, App Store): self-hosted backend means users configure server URL in app settings.

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
    "bcryptjs": "^2",        // Phase 6
    "jsonwebtoken": "^9",    // Phase 6
    "@turf/turf": "^7"       // Geometry operations
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

*Last updated: 2026-06-21*
*Phase 0 starts with: monorepo scaffold, Docker Compose, DB schema, API skeleton, RN app shell.*
