const upstreams = [
  Deno.env.get("VERCEL_API") ?? "https://poor-man-ai.vercel.app",
  Deno.env.get("RENDER_API") ?? "https://poor-man-ai.onrender.com",
];

const cors: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, accept, apikey, x-client-info",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

function brainPath(url: URL): string {
  const stripped = url.pathname
    .replace(/^\/functions\/v1\/api/, "")
    .replace(/^\/api/, "") || "/";
  return stripped.startsWith("/") ? stripped : `/${stripped}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  const url = new URL(req.url);
  const path = brainPath(url) + url.search;
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
  let lastStatus = 502;
  for (const base of upstreams) {
    try {
      const headers = new Headers();
      const contentType = req.headers.get("content-type");
      const accept = req.headers.get("accept");
      if (contentType) headers.set("content-type", contentType);
      if (accept) headers.set("accept", accept);
      const upstream = await fetch(base.replace(/\/$/, "") + path, {
        method: req.method,
        headers,
        body,
      });
      lastStatus = upstream.status;
      if (upstream.status === 404 || upstream.status >= 500) continue;
      const out = new Headers(cors);
      const type = upstream.headers.get("content-type");
      if (type) out.set("content-type", type);
      out.set("cache-control", "no-cache");
      out.set("x-accel-buffering", "no");
      return new Response(upstream.body, { status: upstream.status, headers: out });
    } catch {
      lastStatus = 502;
    }
  }
  return new Response(JSON.stringify({ status: "error", detail: "upstream unavailable" }), {
    status: lastStatus,
    headers: { ...cors, "content-type": "application/json" },
  });
});
