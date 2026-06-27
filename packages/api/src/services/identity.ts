import type { Context } from "hono";
import type { AuthUser } from "../middleware/auth.js";

export interface Actor {
  kind: "user" | "ip";
  userId: string | null;
  contributorName: string;
}

/**
 * Read the client's IP from the standard reverse-proxy headers.
 * Prefers `x-forwarded-for` (first hop) and falls back to `x-real-ip`.
 * Returns "0.0.0.0" when neither header is present.
 */
export function readClientIp(c: Pick<Context, "req">): string {
  const xff = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (xff) return xff;
  const xri = c.req.header("x-real-ip")?.trim();
  if (xri) return xri;
  return "0.0.0.0";
}

/**
 * The single source of truth for the contributor name on the server.
 *   - If the request is authenticated, return the user's username.
 *   - Otherwise, return "IP:<address>" (Wikipedia-style attribution).
 *
 * Callers MUST NOT trust `contributor_name` from the request body.
 */
export function resolveContributorName(c: {
  req: Context["req"];
  get: (key: "user") => unknown;
}): string {
  const user = c.get("user") as AuthUser | undefined;
  if (user?.username) return user.username;
  return `IP:${readClientIp(c)}`;
}

/**
 * Resolve the write-actor from the request context. Returns a unified
 * `Actor` that routes can pass to service functions.
 *
 * - Authenticated user → `{ kind: "user", userId: UUID, contributorName: username }`
 * - Unauthenticated (IP user) → `{ kind: "ip", userId: null, contributorName: "IP:<addr>" }`
 */
export function resolveActor(c: {
  req: Context["req"];
  get: (key: "user") => unknown;
}): Actor {
  const user = c.get("user") as AuthUser | undefined;
  if (user?.username) {
    return { kind: "user", userId: user.id, contributorName: user.username };
  }
  return { kind: "ip", userId: null, contributorName: `IP:${readClientIp(c)}` };
}
