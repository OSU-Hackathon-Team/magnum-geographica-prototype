import type { Context, MiddlewareHandler } from "hono";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 60_000).unref?.();

export function rateLimit(opts?: {
  max?: number;
  windowMs?: number;
  keyFn?: (c: Context) => string;
}): MiddlewareHandler {
  const max = opts?.max ?? MAX_REQUESTS;
  const windowMs = opts?.windowMs ?? WINDOW_MS;
  const keyFn =
    opts?.keyFn ??
    ((c: Context) => {
      const user = c.get("user");
      if (user?.id) return `user:${user.id}`;
      const ip =
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
        c.req.header("x-real-ip") ??
        "127.0.0.1";
      return `ip:${ip}`;
    });

  return async (c: Context, next) => {
    const key = keyFn(c);
    const now = Date.now();
    let entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }
    entry.count += 1;

    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(Math.max(0, max - entry.count)));
    c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      return c.json(
        { error: "rate_limited", message: `Too many requests. Try again in ${Math.ceil((entry.resetAt - now) / 1000)}s` },
        429,
      );
    }
    await next();
  };
}

export function strictRateLimit(): MiddlewareHandler {
  return rateLimit({ max: 20, windowMs: 60_000 });
}
