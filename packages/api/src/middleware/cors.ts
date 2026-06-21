import type { Context, MiddlewareHandler } from "hono";

const ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Admin-Secret",
  "X-Contributor-Name",
  "X-Client-Id",
  "X-Last-Synced",
];

export function corsMiddleware(opts?: { origins?: string[] | "*" }): MiddlewareHandler {
  const allowed = opts?.origins ?? process.env.CORS_ORIGINS?.split(",") ?? ["*"];

  return async (c: Context, next) => {
    const requestOrigin = c.req.header("origin") ?? "";

    const isAllowed =
      allowed === "*" || (Array.isArray(allowed) && allowed.includes(requestOrigin));

    if (isAllowed) {
      c.header("Access-Control-Allow-Origin", allowed === "*" ? "*" : requestOrigin);
      c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      c.header("Access-Control-Allow-Headers", ALLOWED_HEADERS.join(", "));
      c.header("Access-Control-Max-Age", "86400");
    }

    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }

    await next();
  };
}
