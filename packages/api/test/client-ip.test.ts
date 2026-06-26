import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { authRoute } from "../src/routes/auth.js";

const buildApp = () => new Hono().route("/api/auth", authRoute);

describe("GET /api/auth/client-ip", () => {
  test("returns the first hop from x-forwarded-for", async () => {
    const res = await buildApp().request("/api/auth/client-ip", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1, 10.0.0.2" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ip: string };
    expect(body.ip).toBe("203.0.113.5");
  });

  test("falls back to x-real-ip when x-forwarded-for is absent", async () => {
    const res = await buildApp().request("/api/auth/client-ip", {
      headers: { "x-real-ip": "198.51.100.7" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ip: string };
    expect(body.ip).toBe("198.51.100.7");
  });

  test("returns 0.0.0.0 when no proxy headers are present", async () => {
    const res = await buildApp().request("/api/auth/client-ip");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ip: string };
    // `readClientIp` returns 0.0.0.0 when neither x-forwarded-for nor
    // x-real-ip is set (no proxy in front). The endpoint is just a
    // best-effort disclosure of the caller's IP.
    expect(body.ip).toBe("0.0.0.0");
  });

  test("trims whitespace around the forwarded address", async () => {
    const res = await buildApp().request("/api/auth/client-ip", {
      headers: { "x-forwarded-for": "  192.0.2.42  " },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ip: string };
    expect(body.ip).toBe("192.0.2.42");
  });

  test("does not require authentication", async () => {
    // The endpoint is intentionally unauthenticated: it's how the app
    // looks up its own public IP to attribute anonymous edits. No bearer
    // token is sent, and the request still succeeds.
    const res = await buildApp().request("/api/auth/client-ip");
    expect(res.status).toBe(200);
  });
});
