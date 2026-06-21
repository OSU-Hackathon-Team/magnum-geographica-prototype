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
