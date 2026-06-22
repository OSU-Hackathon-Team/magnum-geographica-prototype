import type { Page, Route } from "@playwright/test";
import {
  MOCK_API_HOST,
  SYSTEMS,
  TRAILS,
  TRAILS_BY_SYSTEM,
  SEGMENTS_BY_TRAIL,
  FEATURES_BY_TRAIL,
  FEATURES,
} from "../fixtures/data.js";

type Json = unknown;
type Handler = (params: {
  url: URL;
  method: string;
  body: Json;
  query: Record<string, string>;
}) => { status?: number; body: Json } | undefined;

function ok(body: Json, status = 200) {
  return { status, body };
}

function notFound(message = "not found") {
  return { status: 404, body: { error: "not_found", message } };
}

function conflict(message = "conflict") {
  return { status: 409, body: { error: "conflict", message } };
}

const WIKI_PAGES: Record<string, { id: string; content_md: string; contributor_name: string; updated_at: string }> = {};
const WIKI_REVISIONS: Record<string, { id: string; wiki_page_id: string; content_md: string; contributor_name: string; edit_summary: string; created_at: string }[]> = {};
const CITATIONS: Record<string, { id: string; title: string; url: string | null }[]> = {};
const MEDIA_ITEMS: { id: string; feature_id: string | null; trail_id: string | null; caption: string | null }[] = [];

let nextWikiId = 100;
let nextRevId = 200;
let nextCitationId = 300;
let nextMediaId = 400;
let nextFeatureId = 500;

const DOWNLOADED_PACKS: string[] = [];
const PENDING_CONTRIBUTIONS: { id: number; entity_type: string; action: string; payload: Json }[] = [];
let nextPendingId = 1;

// Wiki page key: `${targetType}:${targetId}`
function wikiKey(targetType: string, targetId: string) {
  return `${targetType}:${targetId}`;
}

const handlers: Array<{ pattern: RegExp; handler: Handler }> = [
  {
    pattern: /\/api\/health$/,
    handler: () => ok({ status: "ok", version: "0.0.1", time: new Date().toISOString(), database: "ok" }),
  },
  {
    pattern: /\/api\/systems\/by-slug\/([^/]+)$/,
    handler: ({ url }) => {
      const slug = url.pathname.split("/").pop();
      const system = SYSTEMS.find((s) => s.slug === slug);
      return system ? ok(system) : notFound(`system '${slug}' not found`);
    },
  },
  {
    pattern: /\/api\/systems\/([^/]+)$/,
    handler: ({ url }) => {
      const id = url.pathname.split("/").pop();
      const system = SYSTEMS.find((s) => s.id === id);
      return system ? ok(system) : notFound(`system ${id} not found`);
    },
  },
  {
    pattern: /\/api\/systems\/([^/]+)\/trails$/,
    handler: ({ url }) => {
      const id = url.pathname.split("/").at(-2);
      const trails = id ? TRAILS_BY_SYSTEM[id] ?? [] : [];
      return ok({ items: trails, total: trails.length });
    },
  },
  {
    pattern: /\/api\/systems\/([^/]+)\/features$/,
    handler: () => ok({ items: [], total: 0 }),
  },
  {
    pattern: /\/api\/systems$/,
    handler: ({ query }) => {
      const q = query.q?.toLowerCase() ?? "";
      const items = q ? SYSTEMS.filter((s) => s.name.toLowerCase().includes(q)) : [...SYSTEMS];
      return ok({ items, total: items.length, page: 1, pageSize: 20 });
    },
  },
  {
    pattern: /\/api\/trails\/by-slug\/([^/]+)$/,
    handler: ({ url }) => {
      const slug = url.pathname.split("/").pop();
      const trail = TRAILS.find((t) => t.slug === slug);
      return trail ? ok(trail) : notFound(`trail '${slug}' not found`);
    },
  },
  {
    pattern: /\/api\/trails\/([^/]+)$/,
    handler: ({ url }) => {
      const id = url.pathname.split("/").pop();
      const trail = TRAILS.find((t) => t.id === id);
      return trail ? ok(trail) : notFound(`trail ${id} not found`);
    },
  },
  {
    pattern: /\/api\/trails\/([^/]+)\/segments$/,
    handler: ({ url }) => {
      const id = url.pathname.split("/").at(-2);
      const items = id ? (SEGMENTS_BY_TRAIL[id] ?? []) : [];
      return ok({ items, total: items.length });
    },
  },
  {
    pattern: /\/api\/trails\/([^/]+)\/features$/,
    handler: ({ url }) => {
      const id = url.pathname.split("/").at(-2);
      const items = id ? (FEATURES_BY_TRAIL[id] ?? []) : [];
      return ok({ items, total: items.length });
    },
  },
  {
    pattern: /\/api\/trails$/,
    handler: ({ query }) => {
      const q = query.q?.toLowerCase() ?? "";
      const items = q ? TRAILS.filter((t) => t.name.toLowerCase().includes(q)) : [...TRAILS];
      return ok({ items, total: items.length, page: 1, pageSize: 20 });
    },
  },
  {
    pattern: /\/api\/features\/([^/]+)$/,
    handler: ({ url }) => {
      const id = url.pathname.split("/").pop();
      const feature = id ? FEATURES[id] : undefined;
      return feature ? ok(feature) : notFound(`feature ${id} not found`);
    },
  },
  // --- Wiki pages: GET by target_type + target_id ---
  {
    pattern: /\/api\/wiki-pages$/,
    handler: ({ query, method, body }) => {
      if (method === "POST") {
        const b = body as { target_type?: string; target_id?: string; title?: string; content_md?: string; contributor_name?: string; edit_summary?: string };
        if (!b?.target_type || !b?.target_id) return { status: 400, body: { error: "missing target_type/target_id" } };
        const key = wikiKey(b.target_type, b.target_id);
        if (WIKI_PAGES[key]) return conflict("wiki page already exists for this target");
        const id = String(nextWikiId++);
        const now = new Date().toISOString();
        WIKI_PAGES[key] = { id, content_md: b.content_md ?? "", contributor_name: b.contributor_name ?? "anonymous", updated_at: now };
        WIKI_REVISIONS[id] = [{ id: String(nextRevId++), wiki_page_id: id, content_md: b.content_md ?? "", contributor_name: b.contributor_name ?? "anonymous", edit_summary: b.edit_summary ?? "", created_at: now }];
        CITATIONS[id] = [];
        return ok({ id, title: b.title ?? "", content_md: b.content_md ?? "", contributor_name: b.contributor_name ?? "anonymous", updated_at: now, citation_count: 0, revision_count: 1 }, 201);
      }
      const targetType = query.target_type;
      const targetId = query.target_id;
      if (!targetType || !targetId) return { status: 400, body: { error: "missing target_type/target_id" } };
      const key = wikiKey(targetType, targetId);
      const page = WIKI_PAGES[key];
      if (!page) return notFound("wiki page not found");
      return ok({ ...page, citation_count: (CITATIONS[page.id] ?? []).length, revision_count: (WIKI_REVISIONS[page.id] ?? []).length });
    },
  },
  // --- Wiki pages: PUT by id ---
  {
    pattern: /\/api\/wiki-pages\/(\d+)$/,
    handler: ({ url, method, body }) => {
      const id = url.pathname.split("/").pop()!;
      if (method === "PUT") {
        const b = body as { content_md?: string; contributor_name?: string; edit_summary?: string; base_revision_id?: string };
        const page = Object.values(WIKI_PAGES).find((p) => p.id === id);
        if (!page) return notFound("wiki page not found");
        if (b.base_revision_id) {
          const revs = WIKI_REVISIONS[id] ?? [];
          const head = revs.length > 0 ? revs[revs.length - 1].id : "none";
          if (b.base_revision_id !== head) return conflict("wiki page has been updated since you last loaded it");
        }
        page.content_md = b.content_md ?? page.content_md;
        page.contributor_name = b.contributor_name ?? page.contributor_name;
        page.updated_at = new Date().toISOString();
        const revId = String(nextRevId++);
        if (!WIKI_REVISIONS[id]) WIKI_REVISIONS[id] = [];
        WIKI_REVISIONS[id].push({ id: revId, wiki_page_id: id, content_md: page.content_md, contributor_name: page.contributor_name, edit_summary: b.edit_summary ?? "", created_at: page.updated_at });
        return ok({ ...page, citation_count: (CITATIONS[id] ?? []).length, revision_count: WIKI_REVISIONS[id].length });
      }
      return notFound("method not allowed");
    },
  },
  // --- Wiki revisions ---
  {
    pattern: /\/api\/wiki-pages\/(\d+)\/revisions\/(\w+)$/,
    handler: ({ url }) => {
      const parts = url.pathname.split("/");
      const pageId = parts[3];
      const revId = parts[5];
      const revs = WIKI_REVISIONS[pageId] ?? [];
      const rev = revs.find((r) => r.id === revId);
      return rev ? ok(rev) : notFound("revision not found");
    },
  },
  {
    pattern: /\/api\/wiki-pages\/(\d+)\/revisions$/,
    handler: ({ url }) => {
      const pageId = url.pathname.split("/")[3];
      const revs = WIKI_REVISIONS[pageId] ?? [];
      return ok({ items: [...revs].reverse(), total: revs.length });
    },
  },
  {
    pattern: /\/api\/wiki-pages\/(\d+)\/revert$/,
    handler: ({ url, body }) => {
      const pageId = url.pathname.split("/")[3];
      const b = body as { revision_id?: string; contributor_name?: string; edit_summary?: string };
      if (!b?.revision_id) return { status: 400, body: { error: "missing revision_id" } };
      const revs = WIKI_REVISIONS[pageId] ?? [];
      const target = revs.find((r) => r.id === b.revision_id);
      if (!target) return notFound("revision not found");
      const page = Object.values(WIKI_PAGES).find((p) => p.id === pageId);
      if (!page) return notFound("wiki page not found");
      page.content_md = target.content_md;
      page.updated_at = new Date().toISOString();
      const revId = String(nextRevId++);
      WIKI_REVISIONS[pageId].push({ id: revId, wiki_page_id: pageId, content_md: page.content_md, contributor_name: b.contributor_name ?? "anonymous", edit_summary: b.edit_summary ?? `Revert to revision ${b.revision_id}`, created_at: page.updated_at });
      return ok({ ...page, citation_count: (CITATIONS[pageId] ?? []).length, revision_count: WIKI_REVISIONS[pageId].length });
    },
  },
  // --- Wiki citations ---
  {
    pattern: /\/api\/wiki-pages\/(\d+)\/citations$/,
    handler: ({ url }) => {
      const pageId = url.pathname.split("/")[3];
      return ok({ items: CITATIONS[pageId] ?? [], total: (CITATIONS[pageId] ?? []).length });
    },
  },
  {
    pattern: /\/api\/citations\/(\w+)$/,
    handler: ({ url, method }) => {
      const id = url.pathname.split("/").pop()!;
      if (method === "DELETE") {
        for (const [pageId, cites] of Object.entries(CITATIONS)) {
          const idx = cites.findIndex((c) => c.id === id);
          if (idx >= 0) {
            cites.splice(idx, 1);
            return ok({ deleted: true });
          }
        }
        return notFound("citation not found");
      }
      return notFound();
    },
  },
  {
    pattern: /\/api\/citations$/,
    handler: ({ body, method }) => {
      if (method === "POST") {
        const b = body as { wiki_page_id?: string; title?: string; url?: string };
        if (!b?.wiki_page_id || !b?.title) return { status: 400, body: { error: "missing wiki_page_id/title" } };
        const id = String(nextCitationId++);
        const cite = { id, title: b.title, url: b.url ?? null };
        if (!CITATIONS[b.wiki_page_id]) CITATIONS[b.wiki_page_id] = [];
        CITATIONS[b.wiki_page_id].push(cite);
        return ok(cite, 201);
      }
      return notFound();
    },
  },
  // --- Wikis on other targets (e.g., /api/wiki-pages?target_type=trail&target_id=trail-1) ---
  // Already handled by the first wiki handler above
  // --- Media ---
  {
    pattern: /\/api\/media\/(\w+)$/,
    handler: ({ url, method }) => {
      const id = url.pathname.split("/").pop()!;
      if (method === "DELETE") {
        const idx = MEDIA_ITEMS.findIndex((m) => m.id === id);
        if (idx >= 0) { MEDIA_ITEMS.splice(idx, 1); return ok({ deleted: true }); }
        return notFound("media not found");
      }
      if (method === "GET") {
        const item = MEDIA_ITEMS.find((m) => m.id === id);
        return item ? ok({ ...item, data_url: "data:image/png;base64,iVBORw0KGgo=" }) : notFound("media not found");
      }
      return notFound();
    },
  },
  {
    pattern: /\/api\/media$/,
    handler: ({ query, method, body }) => {
      if (method === "POST") {
        const b = body as { feature_id?: string; trail_id?: string; caption?: string; data?: string };
        if (!b?.feature_id && !b?.trail_id) return { status: 400, body: { error: "missing feature_id or trail_id" } };
        const id = String(nextMediaId++);
        MEDIA_ITEMS.push({ id, feature_id: b.feature_id ?? null, trail_id: b.trail_id ?? null, caption: b.caption ?? null });
        return ok({ id, feature_id: b.feature_id, trail_id: b.trail_id, caption: b.caption }, 201);
      }
      if (method === "GET") {
        const featureId = query.feature_id;
        const trailId = query.trail_id;
        const items = MEDIA_ITEMS.filter((m) => (featureId && m.feature_id === featureId) || (trailId && m.trail_id === trailId));
        return ok({ items, total: items.length });
      }
      return notFound();
    },
  },
  // --- Feature CRUD ---
  {
    pattern: /\/api\/features$/,
    handler: ({ body, method }) => {
      if (method === "POST") {
        const b = body as { name?: string; type_tag?: string; lat?: number; lon?: number; description?: string; trail_id?: string; system_id?: string; contributor_name?: string };
        if (!b?.name || !b?.type_tag) return { status: 400, body: { error: "missing name/type_tag" } };
        const id = `f-${nextFeatureId++}`;
        const feature = {
          id, name: b.name, type_tag: b.type_tag,
          description: b.description ?? null,
          trail_id: b.trail_id ?? null, system_id: b.system_id ?? null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          center: { lat: b.lat ?? 39.0, lon: b.lon ?? -83.0 },
        };
        (FEATURES as Record<string, unknown>)[id] = feature;
        const trailId = b.trail_id ?? "trail-1";
        if (!FEATURES_BY_TRAIL[trailId]) FEATURES_BY_TRAIL[trailId] = [];
        FEATURES_BY_TRAIL[trailId].push(feature);
        return ok(feature, 201);
      }
      return notFound();
    },
  },
  // --- Offline packs ---
  {
    pattern: /\/api\/offline-packs\/([^/]+)\/info$/,
    handler: ({ url }) => {
      const systemId = url.pathname.split("/")[3];
      return ok({ system_id: systemId, estimated_size_mb: 42, generated_at: null });
    },
  },
  {
    pattern: /\/api\/offline-packs\/generate\/([^/]+)$/,
    handler: ({ url }) => {
      const systemId = url.pathname.split("/")[4];
      DOWNLOADED_PACKS.push(systemId);
      return ok({ system_id: systemId, size_bytes: 42000000, generated_at: new Date().toISOString() });
    },
  },
  {
    pattern: /\/api\/offline-packs\/([^/]+)\/download$/,
    handler: ({ url }) => {
      const systemId = url.pathname.split("/")[3];
      return ok({ system_id: systemId, trails: TRAILS_BY_SYSTEM[systemId] ?? [], features: [], wiki_pages: {} });
    },
  },
  // --- Sync ---
  {
    pattern: /\/api\/sync\/contributions$/,
    handler: ({ body }) => {
      const b = body as { contributions?: { entity_type: string; action: string; payload: Json }[] };
      const results: Json[] = [];
      for (const c of b?.contributions ?? []) {
        if (c.payload && (c.payload as { _conflict?: boolean })._conflict) {
          results.push({ status: "conflict", server_revision: { id: "rev-conflict", content_md: "Server version content", contributor_name: "other-user", created_at: new Date().toISOString() } });
        } else {
          PENDING_CONTRIBUTIONS.push({ id: nextPendingId++, entity_type: c.entity_type, action: c.action, payload: c.payload });
          results.push({ status: "synced", server_id: `server-${nextPendingId}` });
        }
      }
      return ok({ results });
    },
  },
  {
    pattern: /\/api\/sync\/updates$/,
    handler: () => ok({ revisions: [], cursor: new Date().toISOString() }),
  },
  // --- Revisions recent (admin) ---
  {
    pattern: /\/api\/revisions\/recent$/,
    handler: () => ok({ items: [], total: 0 }),
  },
  // --- Segments ---
  {
    pattern: /\/api\/segments\/([^/]+)$/,
    handler: ({ url }) => {
      const id = url.pathname.split("/").pop()!;
      for (const segs of Object.values(SEGMENTS_BY_TRAIL)) {
        const seg = (segs as { id: string }[]).find((s) => s.id === id);
        if (seg) return ok(seg);
      }
      return notFound(`segment ${id} not found`);
    },
  },
  // Search
  {
    pattern: /\/api\/search$/,
    handler: ({ query }) => {
      const q = query.q?.toLowerCase() ?? "";
      const allFeatures = Object.values(FEATURES);
      return ok({
        systems: SYSTEMS.filter((s) => s.name.toLowerCase().includes(q)),
        trails: TRAILS.filter((t) => t.name.toLowerCase().includes(q)),
        features: q
          ? allFeatures.filter((f) => {
              const name = String((f as { name?: string }).name ?? "").toLowerCase();
              return name.includes(q);
            })
          : [],
      });
    },
  },
];

export function resetApiMock() {
  for (const key of Object.keys(WIKI_PAGES)) delete WIKI_PAGES[key];
  for (const key of Object.keys(WIKI_REVISIONS)) delete WIKI_REVISIONS[key];
  for (const key of Object.keys(CITATIONS)) delete CITATIONS[key];
  MEDIA_ITEMS.length = 0;
  PENDING_CONTRIBUTIONS.length = 0;
  DOWNLOADED_PACKS.length = 0;
  nextWikiId = 100;
  nextRevId = 200;
  nextCitationId = 300;
  nextMediaId = 400;
  nextFeatureId = 500;
  nextPendingId = 1;
}

export async function installApiMock(page: Page, opts: { failAll?: boolean } = {}) {
  await page.route(`http://${MOCK_API_HOST}/**`, async (route: Route) => {
    if (opts.failAll) {
      await route.fulfill({ status: 500, body: JSON.stringify({ error: "boom" }) });
      return;
    }
    const req = route.request();
    const url = new URL(req.url());
    const body = req.postDataJSON() as Json;
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
      query[k] = v;
    });
    for (const { pattern, handler } of handlers) {
      if (pattern.test(url.pathname)) {
        const result = handler({ url, method: req.method(), body, query });
        if (result) {
          await route.fulfill({
            status: result.status ?? 200,
            contentType: "application/json",
            body: JSON.stringify(result.body),
          });
          return;
        }
      }
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "no_mock", message: `no mock for ${url.pathname}` }),
    });
  });
}
