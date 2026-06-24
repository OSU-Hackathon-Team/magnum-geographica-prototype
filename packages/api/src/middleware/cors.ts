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
  const envOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  const configured = opts?.origins ?? envOrigins;
  const allowed = configured?.length ? configured : "*";

  return async (c: Context, next) => {
    const requestOrigin = c.req.header("origin") ?? "";

    const isWildcard = allowed === "*";
    const isAllowed = isWildcard || (Array.isArray(allowed) && allowed.includes(requestOrigin));

    if (isAllowed) {
      c.header("Access-Control-Allow-Origin", isWildcard ? "*" : requestOrigin);
      if (!isWildcard) {
        c.header("Access-Control-Allow-Credentials", "true");
      }
      c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
      c.header("Access-Control-Allow-Headers", ALLOWED_HEADERS.join(", "));
      c.header("Access-Control-Max-Age", "86400");
    }

    if (c.req.method === "OPTIONS") {
      return c.body(null, 204);
    }

    await next();
  };
}
