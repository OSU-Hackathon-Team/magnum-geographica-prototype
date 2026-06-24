import type { Context, MiddlewareHandler } from "hono";

const METRO_URL = process.env.METRO_URL ?? "http://localhost:8081";

export function metroProxy(): MiddlewareHandler {
  return async (c: Context) => {
    if (process.env.NODE_ENV === "production") {
      return c.json({ error: "not_found" }, 404);
    }

    const metro = new URL(c.req.path, METRO_URL);
    metro.search = new URL(c.req.url).search;

    const headers = new Headers(c.req.raw.headers);
    headers.set("host", metro.host);

    let body: BodyInit | undefined;
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      body = await c.req.raw.clone().arrayBuffer();
    }

    try {
      const upstream = await fetch(metro.href, {
        method: c.req.method,
        headers,
        body,
      });

      return new Response(upstream.body, {
        status: upstream.status,
        headers: upstream.headers,
      });
    } catch {
      return c.json(
        { error: "metro_unreachable", message: `could not reach Metro at ${METRO_URL}` },
        502,
      );
    }
  };
}
