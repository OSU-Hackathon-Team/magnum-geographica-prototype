import type { Context, MiddlewareHandler } from "hono";

export function adminOnly(): MiddlewareHandler {
  return async (c: Context, next) => {
    const required = process.env.ADMIN_SECRET ?? "dev-secret-change-me";
    const provided = c.req.header("x-admin-secret");
    if (!provided || provided !== required) {
      return c.json({ error: "unauthorized", message: "admin secret required" }, 401);
    }
    await next();
  };
}
