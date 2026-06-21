import { Hono } from "hono";
import { db } from "../db/index.js";
import { seedOhioData } from "../services/seed.js";

export const seedRoute = new Hono();

seedRoute.post("/", async (c) => {
  const adminSecret = process.env.ADMIN_SECRET ?? "dev-secret-change-me";
  const provided = c.req.header("x-admin-secret");
  if (process.env.NODE_ENV === "production" && provided !== adminSecret) {
    return c.json({ error: "unauthorized", message: "admin secret required in production" }, 401);
  }

  try {
    const result = await seedOhioData(db);
    return c.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: "seed_failed", message }, 500);
  }
});
