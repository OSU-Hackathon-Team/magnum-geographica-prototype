import type { Context } from "hono";
import type { AuthUser } from "../middleware/auth.js";

/**
 * Read the client's IP from the standard reverse-proxy headers.
 * Prefers `x-forwarded-for` (first hop) and falls back to `x-real-ip`.
 * Returns "0.0.0.0" when neither header is present — this is fine
 * for contributor-name attribution but should NOT be used for any
 * security-sensitive rate limiting / allow-listing.
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
 *   - If the auth context is missing *and* the IP is unknown, fall
 *     back to "anonymous" so writes never fail because of a header
 *     issue.
 *
 * Callers MUST NOT trust `contributor_name` from the request body —
 * accepting a client-supplied name lets any user spoof another's
 * attribution. This helper is the only sanctioned way to populate
 * `revisions.contributor_name`, `gps_traces.contributor_name`, etc.
 *
 * The parameter is typed loosely (only `req` + `get` are touched) so
 * the helper can be called from any Hono route regardless of how its
 * `Variables` are declared.
 */
export function resolveContributorName(c: {
  req: Context["req"];
  get: (key: "user") => unknown;
}): string {
  const user = c.get("user") as AuthUser | undefined;
  if (user?.username) return user.username;
  const ip = readClientIp(c);
  if (ip && ip !== "0.0.0.0") return `IP:${ip}`;
  return "anonymous";
}
