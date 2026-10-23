const { onRequest } = require("firebase-functions/v2/https");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

exports.api = onRequest({
  region: "us-central1",
  memory: "256MiB",
  timeoutSeconds: 120,
  maxInstances: 2,
  invoker: "public",
  cors: ["https://ai.usavisible.com", "https://zerogravity-ab52d.web.app"],
}, async (req, res) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 110000);
  const cancel = () => { if (!res.writableFinished) controller.abort(); };
  res.on("close", cancel);
  try {
    const incoming = new URL(req.originalUrl, "https://localhost");
    const upstream = new URL(process.env.RENDER_API_URL || "https://poor-man-ai.onrender.com");
    upstream.pathname = incoming.pathname.replace(/^\/backend(?=\/|$)/, "") || "/";
    upstream.search = incoming.search;
    const headers = { accept: req.get("accept") || "*/*" };
    if (req.get("content-type")) headers["content-type"] = req.get("content-type");
    const response = await fetch(upstream, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.rawBody,
      signal: controller.signal,
      redirect: "error",
    });
    res.status(response.status);
    res.set("Cache-Control", "no-store");
    for (const name of ["content-type", "content-disposition"]) {
      const value = response.headers.get(name);
      if (value) res.set(name, value);
    }
    if (!response.body || req.method === "HEAD") return res.end();
    res.flushHeaders();
    await pipeline(Readable.fromWeb(response.body), res);
  } catch (error) {
    if (!res.headersSent) res.status(502).json({ error: "Backend request failed", retryable: true });
    else if (!res.destroyed) res.end();
  } finally {
    clearTimeout(timer);
    res.off("close", cancel);
  }
});
