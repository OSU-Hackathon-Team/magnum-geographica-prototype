import { readFileSync, statSync, existsSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { createServer } from "node:http";

const DIST = process.argv[2] ?? "tests/e2e/.app";
const PORT = Number(process.argv[3] ?? 4173);
const HOST = process.argv[4] ?? "127.0.0.1";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function tryFile(path: string): { content: Buffer; type: string } | null {
  if (!existsSync(path)) return null;
  const stat = statSync(path);
  if (stat.isDirectory()) {
    return tryFile(join(path, "index.html"));
  }
  const content = readFileSync(path);
  const ext = extname(path).toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";
  return { content, type };
}

function notFound() {
  const indexFile = tryFile(join(DIST, "index.html"));
  if (indexFile) {
    return new Response(indexFile.content, {
      status: 200,
      headers: { "content-type": indexFile.type },
    });
  }
  return new Response("Not Found", { status: 404 });
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    res.statusCode = 400;
    res.end("Bad Request");
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  let path = decodeURIComponent(url.pathname);
  path = normalize(path).replace(/^(\.\.[\/\\])+/, "");

  let file = tryFile(join(DIST, path));
  if (file) {
    res.statusCode = 200;
    res.setHeader("content-type", file.type);
    res.setHeader("cache-control", "no-store");
    res.end(file.content);
    return;
  }

  if (!extname(path)) {
    file = tryFile(join(DIST, path + ".html"));
    if (file) {
      res.statusCode = 200;
      res.setHeader("content-type", file.type);
      res.setHeader("cache-control", "no-store");
      res.end(file.content);
      return;
    }
  }

  const fallback = notFound();
  res.statusCode = fallback.status;
  fallback.headers.forEach((v, k) => res.setHeader(k, v));
  const body = fallback.body ? Buffer.from(await fallback.arrayBuffer()) : undefined;
  res.end(body);
});

server.listen(PORT, HOST, () => {
  console.log(`[serve-e2e] http://${HOST}:${PORT}  (dist: ${DIST})`);
});
