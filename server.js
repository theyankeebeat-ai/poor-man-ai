import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { handleChatRequest } from "./src/chat-api.js";

const port = Number(process.env.PORT || 8787);
const host = "0.0.0.0";
const root = join(process.cwd(), "dist");

const allowedOrigins = new Set([
  "https://poorman.web.app",
  "https://poorman.firebaseapp.com",
  "https://ai.usavisible.com",
]);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

function applyCors(req, res) {
  const origin = req.headers.origin;
  const local = typeof origin === "string" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (origin && (allowedOrigins.has(origin) || local)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
}

function fileFor(pathname) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
  const file = join(root, rel);
  const rootPrefix = root.endsWith(sep) ? root : root + sep;
  if (file !== root && !file.startsWith(rootPrefix)) return null;
  return file;
}

function sendFile(res, file) {
  const type = types[extname(file)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  createReadStream(file).pipe(res);
}

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");

  if (url.pathname === "/api/chat") {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    handleChatRequest(req, res);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method not allowed.");
    return;
  }

  let file = fileFor(url.pathname);
  if (!file) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file) || !statSync(file).isFile()) {
    const fallback = join(root, "index.html");
    if (!extname(url.pathname) && existsSync(fallback)) {
      sendFile(res, fallback);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found.");
    return;
  }
  if (req.method === "HEAD") {
    res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
    res.end();
    return;
  }
  sendFile(res, file);
});

server.listen(port, host, () => {
  console.log(`Poor Man Ai backend on http://${host}:${port}`);
});
