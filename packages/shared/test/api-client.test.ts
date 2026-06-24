import { describe, expect, test, beforeEach } from "bun:test";
import { ApiClient, ApiClientError } from "../src/api/client.js";
import { createMagnumClient } from "../src/api/endpoints.js";

function makeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return Promise.resolve(handler(url, init ?? {}));
  }) as typeof fetch;
}

describe("ApiClient", () => {
  test("GET builds URL with query params, omits nulls and empties", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const client = new ApiClient({
      baseUrl: "http://api.test",
      fetch: makeFetch((url, init) => {
        captured = { url, init };
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    });

    const res = await client.get<{ ok: boolean }>("/api/x", {
      q: "hocking",
      page: 2,
      empty: "",
      nope: null,
      undef: undefined,
    });
    expect(res.ok).toBe(true);
    expect(captured).not.toBeNull();
    const url = new URL(captured!.url);
    expect(url.origin + url.pathname).toBe("http://api.test/api/x");
    expect(url.searchParams.get("q")).toBe("hocking");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.has("empty")).toBe(false);
    expect(url.searchParams.has("nope")).toBe(false);
    expect(url.searchParams.has("undef")).toBe(false);
  });

  test("POST serializes JSON body and sets content-type", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const client = new ApiClient({
      baseUrl: "http://api.test",
      fetch: makeFetch((url, init) => {
        captured = { url, init };
        return new Response("{}", { status: 200 });
      }),
    });

    await client.post("/api/x", { hello: "world" });
    expect(captured).not.toBeNull();
    expect(captured!.init.method).toBe("POST");
    expect((captured!.init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    expect(captured!.init.body).toBe('{"hello":"world"}');
  });

  test("attaches x-admin-secret and x-contributor-name when configured", async () => {
    let captured: RequestInit | null = null;
    const client = new ApiClient({
      baseUrl: "http://api.test",
      fetch: makeFetch((_url, init) => {
        captured = init;
        return new Response("{}", { status: 200 });
      }),
      getAdminSecret: () => "topsecret",
      getContributorName: () => "alice",
    });

    await client.get("/api/x");
    const headers = captured!.headers as Record<string, string>;
    expect(headers["x-admin-secret"]).toBe("topsecret");
    expect(headers["x-contributor-name"]).toBe("alice");
  });

  test("throws ApiClientError with parsed body on non-2xx", async () => {
    const client = new ApiClient({
      baseUrl: "http://api.test",
      fetch: makeFetch(
        () =>
          new Response(JSON.stringify({ error: "bad", message: "nope" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          }),
      ),
    });

    expect(client.get("/api/x")).rejects.toBeInstanceOf(ApiClientError);
    try {
      await client.get("/api/x");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      const e = err as ApiClientError;
      expect(e.status).toBe(400);
      expect(e.body.error).toBe("bad");
      expect(e.message).toBe("nope");
    }
  });

  test("handles 204 No Content as undefined", async () => {
    const client = new ApiClient({
      baseUrl: "http://api.test",
      fetch: makeFetch(() => new Response(null, { status: 204 })),
    });
    const result = await client.delete("/api/x");
    expect(result).toBeUndefined();
  });

  test("strips trailing slash from baseUrl", () => {
    const client = new ApiClient({
      baseUrl: "http://api.test/",
      fetch: makeFetch(() => new Response("{}", { status: 200 })),
    });
    expect((client as unknown as { baseUrl: string }).baseUrl).toBe("http://api.test");
  });
});

describe("createMagnumClient", () => {
  test("endpoints wire to expected paths", async () => {
    const seen: string[] = [];
    const magnum = createMagnumClient("http://api.test", {
      fetch: makeFetch((url) => {
        seen.push(new URL(url).pathname);
        return new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20 }), {
          status: 200,
        });
      }),
    });

    await magnum.health();
    await magnum.listSystems();
    await magnum.listTrails();
    await magnum.getSystem("abc");
    await magnum.getTrail("def");
    await magnum.search({ q: "x", type: "all", limit: 20 });

    expect(seen).toContain("/api/health");
    expect(seen).toContain("/api/systems");
    expect(seen).toContain("/api/trails");
    expect(seen).toContain("/api/systems/abc");
    expect(seen).toContain("/api/trails/def");
    expect(seen).toContain("/api/search");
  });
});

beforeEach(() => {});
