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

  const dbStatus = dbOk ? "ok" : "unreachable";
  const statusCode = dbOk ? 200 : 503;
  return c.json({
    status: dbOk ? "ok" : "degraded",
    version: "0.0.1",
    time: new Date().toISOString(),
    database: dbStatus,
  }, statusCode as 200);
});
