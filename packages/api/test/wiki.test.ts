import { describe, expect, test } from "bun:test";
import { mock } from "bun:test";
import { createMockDb } from "./helpers/mockDb.js";

const { db, state } = createMockDb();

mock.module("../src/db/index.js", () => ({
  db,
  pool: { end: () => Promise.resolve() },
  schema: {},
}));

const { Hono } = await import("hono");
const { wikiRoute } = await import("../src/routes/wiki.js");
const { citationsRoute } = await import("../src/routes/citations.js");

const buildApp = () => {
  const app = new Hono();
  app.route("/api/wiki-pages", wikiRoute);
  app.route("/api/citations", citationsRoute);
  return app;
};

const TARGET_UUID = "11111111-1111-1111-1111-111111111111";
const WIKI_UUID = "22222222-2222-2222-2222-222222222222";
const REV_UUID = "33333333-3333-3333-3333-333333333333";

describe("GET /api/wiki-pages", () => {
  test("returns 400 without target_type and target_id", async () => {
    const res = await buildApp().request("/api/wiki-pages");
    expect(res.status).toBe(400);
  });

  test("returns 404 when wiki page not found", async () => {
    state.wikiPages.length = 0;
    const res = await buildApp().request(
      `/api/wiki-pages?target_type=trail&target_id=${TARGET_UUID}`,
    );
    expect(res.status).toBe(404);
  });

  test("returns wiki page when found", async () => {
    state.wikiPages.length = 0;
    state.wikiPages.push({
      id: WIKI_UUID,
      target_type: "trail",
      target_id: TARGET_UUID,
      title: "Test Wiki",
      content_md: "# Hello",
      rendered_html: "",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    const res = await buildApp().request(
      `/api/wiki-pages?target_type=trail&target_id=${TARGET_UUID}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { title: string; content_md: string };
    expect(body.title).toBe("Test Wiki");
    expect(body.content_md).toBe("# Hello");
  });
});

describe("POST /api/wiki-pages", () => {
  test("rejects invalid input", async () => {
    state.insertCalls.length = 0;
    const res = await buildApp().request("/api/wiki-pages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("rejects duplicate wiki page", async () => {
    state.wikiPages.length = 0;
    state.wikiPages.push({
      id: WIKI_UUID,
      target_type: "trail",
      target_id: TARGET_UUID,
      title: "Existing",
      content_md: "",
      rendered_html: "",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    state.insertCalls.length = 0;
    const res = await buildApp().request("/api/wiki-pages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target_type: "trail",
        target_id: TARGET_UUID,
        title: "Duplicate",
        content_md: "# Test",
      }),
    });
    expect(res.status).toBe(409);
  });

  test("creates wiki page and initial revision", async () => {
    state.wikiPages.length = 0;
    state.insertCalls.length = 0;
    const res = await buildApp().request("/api/wiki-pages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target_type: "trail",
        target_id: TARGET_UUID,
        title: "My Wiki",
        content_md: "# Hello",
        contributor_name: "test-user",
        edit_summary: "Initial page",
      }),
    });
    expect(res.status).toBe(201);
    expect(state.insertCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("PUT /api/wiki-pages/:id", () => {
  test("returns 404 for non-existent wiki page", async () => {
    state.wikiPages.length = 0;
    const res = await buildApp().request(`/api/wiki-pages/${WIKI_UUID}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Updated",
        content_md: "new content",
        contributor_name: "editor",
      }),
    });
    expect(res.status).toBe(404);
  });

  test("updates wiki page and creates revision", async () => {
    state.wikiPages.length = 0;
    state.wikiPages.push({
      id: WIKI_UUID,
      target_type: "trail",
      target_id: TARGET_UUID,
      title: "Old Title",
      content_md: "old content",
      rendered_html: "",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    state.insertCalls.length = 0;
    state.updateCalls.length = 0;

    const res = await buildApp().request(`/api/wiki-pages/${WIKI_UUID}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Updated Title",
        content_md: "updated content",
        contributor_name: "editor",
        edit_summary: "Made edits",
      }),
    });
    expect(res.status).toBe(200);
    expect(state.updateCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("GET /api/wiki-pages/:id/revisions", () => {
  test("returns 404 for non-existent wiki page", async () => {
    state.wikiPages.length = 0;
    const res = await buildApp().request(`/api/wiki-pages/${WIKI_UUID}/revisions`);
    expect(res.status).toBe(404);
  });

  test("returns empty revision list", async () => {
    state.wikiPages.length = 0;
    state.wikiPages.push({
      id: WIKI_UUID,
      target_type: "trail",
      target_id: TARGET_UUID,
      title: "Wiki",
      content_md: "content",
      rendered_html: "",
    });
    state.revisions.length = 0;
    const res = await buildApp().request(`/api/wiki-pages/${WIKI_UUID}/revisions`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; total: number };
    expect(body.total).toBe(0);
  });

  test("returns revisions list", async () => {
    state.wikiPages.length = 0;
    state.wikiPages.push({
      id: WIKI_UUID,
      target_type: "trail",
      target_id: TARGET_UUID,
      title: "Wiki",
      content_md: "content",
      rendered_html: "",
    });
    state.revisions.length = 0;
    state.revisions.push({
      id: REV_UUID,
      wiki_page_id: WIKI_UUID,
      content_md: "content",
      contributor_name: "user",
      author_id: null,
      edit_summary: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const res = await buildApp().request(`/api/wiki-pages/${WIKI_UUID}/revisions`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });
});

describe("GET /api/wiki-pages/:id/revisions/:revId", () => {
  test("returns 404 for non-existent revision", async () => {
    state.revisions.length = 0;
    const res = await buildApp().request(`/api/wiki-pages/${WIKI_UUID}/revisions/${REV_UUID}`);
    expect(res.status).toBe(404);
  });

  test("returns specific revision", async () => {
    state.revisions.length = 0;
    state.revisions.push({
      id: REV_UUID,
      wiki_page_id: WIKI_UUID,
      content_md: "old content",
      contributor_name: "user",
      author_id: null,
      edit_summary: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const res = await buildApp().request(`/api/wiki-pages/${WIKI_UUID}/revisions/${REV_UUID}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { content_md: string };
    expect(body.content_md).toBe("old content");
  });
});

describe("POST /api/wiki-pages/:id/revert", () => {
  test("returns 404 for non-existent wiki page", async () => {
    state.wikiPages.length = 0;
    const res = await buildApp().request(`/api/wiki-pages/${WIKI_UUID}/revert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision_id: REV_UUID,
        contributor_name: "reverter",
      }),
    });
    expect(res.status).toBe(404);
  });

  test("returns 404 for non-existent revision", async () => {
    state.wikiPages.length = 0;
    state.wikiPages.push({
      id: WIKI_UUID,
      target_type: "trail",
      target_id: TARGET_UUID,
      title: "Wiki",
      content_md: "content",
      rendered_html: "",
    });
    state.revisions.length = 0;
    const res = await buildApp().request(`/api/wiki-pages/${WIKI_UUID}/revert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision_id: REV_UUID,
        contributor_name: "reverter",
      }),
    });
    expect(res.status).toBe(404);
  });

  test("reverts to previous revision", async () => {
    state.wikiPages.length = 0;
    state.wikiPages.push({
      id: WIKI_UUID,
      target_type: "trail",
      target_id: TARGET_UUID,
      title: "Wiki",
      content_md: "new content",
      rendered_html: "",
    });
    state.revisions.length = 0;
    state.revisions.push({
      id: REV_UUID,
      wiki_page_id: WIKI_UUID,
      content_md: "old content",
      contributor_name: "user",
      author_id: null,
      edit_summary: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    state.updateCalls.length = 0;
    state.insertCalls.length = 0;

    const res = await buildApp().request(`/api/wiki-pages/${WIKI_UUID}/revert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision_id: REV_UUID,
        contributor_name: "reverter",
      }),
    });
    expect(res.status).toBe(200);
    expect(state.updateCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("POST /api/citations", () => {
  test("rejects invalid input", async () => {
    state.insertCalls.length = 0;
    const res = await buildApp().request("/api/citations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("creates a citation", async () => {
    state.insertCalls.length = 0;
    const res = await buildApp().request("/api/citations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wiki_page_id: WIKI_UUID,
        title: "Official Site",
        url: "https://example.com",
      }),
    });
    expect(res.status).toBe(201);
    expect(state.insertCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("DELETE /api/citations/:id", () => {
  test("returns 404 for non-existent citation", async () => {
    const CITATION_UUID = "99999999-9999-9999-9999-999999999999";
    state.citations.length = 0;
    const res = await buildApp().request(`/api/citations/${CITATION_UUID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  test("deletes a citation", async () => {
    const CITATION_UUID = "99999999-9999-9999-9999-999999999999";
    state.citations.length = 0;
    state.citations.push({
      id: CITATION_UUID,
      wiki_page_id: WIKI_UUID,
      title: "Old Citation",
      url: "https://example.com",
      image_data: null,
      image_mime_type: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    state.deleteCalls.length = 0;
    const res = await buildApp().request(`/api/citations/${CITATION_UUID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect(state.deleteCalls.length).toBeGreaterThanOrEqual(1);
  });
});
