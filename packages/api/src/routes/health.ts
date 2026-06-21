import { Hono } from "hono";
import { db } from "../db/index.js";

export const healthRoute = new Hono();

healthRoute.get("/", async (c) => {
  let dbOk = false;
  try {
    await db.execute("SELECT 1");
    dbOk = true;
  } catch {
    dbOk = false;
  }

  return c.json({
    status: "ok",
    version: "0.0.1",
    time: new Date().toISOString(),
    database: dbOk ? "ok" : "unreachable",
  });
});
