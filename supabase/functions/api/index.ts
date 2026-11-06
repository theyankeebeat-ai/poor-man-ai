/**
 * Supabase Chat API gateway.
 * Routes /chat and /health to the two lean Go brains (Vercel, then Render).
 * Does not run AI-mode search engines.
 */
const brains = [
  {
    name: "vercel",
    base: Deno.env.get("VERCEL_API") ?? "https://poor-man-ai.vercel.app",
  },
  {
    name: "render",
    base: Deno.env.get("RENDER_API") ?? "https://poor-man-ai.onrender.com",
  },
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

async function probe(base: string): Promise<{ ok: boolean; warm?: boolean; status?: number }> {
  try {
    const res = await fetch(base.replace(/\/$/, "") + "/health", {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return { ok: false, status: res.status };
    const body = await res.json().catch(() => ({}));
    return {
      ok: body?.status === "ok",
      warm: body?.warm === true,
      status: res.status,
    };
  } catch {
    return { ok: false };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(req.url);
  const path = brainPath(url) + url.search;

  // Chat API self-description (does not require an upstream brain).
  if (req.method === "GET" && (path === "/role" || path === "/role/")) {
    return new Response(
      JSON.stringify({
        status: "ok",
        role: "chat-api",
        search: "disabled",
        brains: brains.map((b) => b.name),
        note: "Supabase is the chat API gateway. Vercel and Render are lean RAG brains.",
      }),
      { status: 200, headers: { ...cors, "content-type": "application/json" } },
    );
  }

  if (req.method === "GET" && (path === "/health" || path === "/health/")) {
    const reports = [];
    for (const brain of brains) {
      const p = await probe(brain.base);
      reports.push({ name: brain.name, base: brain.base, ...p });
    }
    const live = reports.find((r) => r.ok);
    return new Response(
      JSON.stringify({
        status: live ? "ok" : "degraded",
        role: "chat-api",
        search: "disabled",
        warm: !!live?.warm,
        runtime: "supabase-edge",
        note: "Chat API gateway. Upstream brains do local RAG only; AI-mode search is off.",
        brains: reports,
      }),
      {
        status: live ? 200 : 503,
        headers: { ...cors, "content-type": "application/json", "cache-control": "no-cache" },
      },
    );
  }

  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
  let lastStatus = 502;
  for (const brain of brains) {
    try {
      const headers = new Headers();
      const contentType = req.headers.get("content-type");
      const accept = req.headers.get("accept");
      if (contentType) headers.set("content-type", contentType);
      if (accept) headers.set("accept", accept);
      const upstream = await fetch(brain.base.replace(/\/$/, "") + path, {
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
      out.set("x-bpmai-brain", brain.name);
      out.set("x-bpmai-role", "chat-api");
      return new Response(upstream.body, { status: upstream.status, headers: out });
    } catch {
      lastStatus = 502;
    }
  }
  return new Response(JSON.stringify({ status: "error", detail: "upstream brain unavailable", role: "chat-api" }), {
    status: lastStatus,
    headers: { ...cors, "content-type": "application/json" },
  });
});
