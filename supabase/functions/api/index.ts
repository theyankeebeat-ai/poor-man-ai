const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, accept",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
};

const FALLBACK = "https://poor-man-ai.onrender.com";

function origin(): string {
  const raw = Deno.env.get("RENDER_URL") || Deno.env.get("INQUIRE_URL") || FALLBACK;
  try {
    return new URL(raw).origin;
  } catch {
    return FALLBACK;
  }
}

function restPath(pathname: string): string {
  const markers = ["/functions/v1/api", "/api"];
  for (const marker of markers) {
    const at = pathname.indexOf(marker);
    if (at >= 0) return pathname.slice(at + marker.length).replace(/^\/+/, "");
  }
  return pathname.replace(/^\/+/, "");
}

function isChat(method: string, rest: string): boolean {
  return method === "POST" && (rest === "chat" || rest.endsWith("/chat"));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const incoming = new URL(req.url);
  const target = new URL(origin());
  const rest = restPath(incoming.pathname);
  target.pathname = rest ? `/${rest}` : "/";
  target.search = incoming.search;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const accept = req.headers.get("accept");
  if (isChat(req.method, rest)) {
    headers.set("accept", "application/x-ndjson");
  } else if (accept && accept !== "*/*") {
    headers.set("accept", accept);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const payload = hasBody ? await req.arrayBuffer() : undefined;

  const callUpstream = (signal: AbortSignal) =>
    fetch(target, {
      method: req.method,
      headers,
      body: payload,
      signal,
    });

  if (isChat(req.method, rest)) {
    const encoder = new TextEncoder();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    let phase: "status" | "connect" | "stream" | "done" = "status";
    let upstreamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    const stream = new ReadableStream({
      async pull(ctrl) {
        const line = (event: Record<string, string>) =>
          ctrl.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        try {
          if (phase === "status") {
            // Return this chunk before calling Render so the runtime can flush it.
            line({ type: "status", text: "Connecting" });
            phase = "connect";
            return;
          }
          if (phase === "connect") {
            let upstream = await callUpstream(controller.signal);
            if (upstream.status === 502 || upstream.status === 503 || upstream.status === 504) {
              await upstream.body?.cancel().catch(() => {});
              line({ type: "status", text: "Waking the API" });
              await new Promise((resolve) => setTimeout(resolve, 400));
              upstream = await callUpstream(controller.signal);
            }
            if (!upstream.body) {
              line({ type: "error", text: `upstream ${upstream.status}` });
              phase = "done";
              clearTimeout(timer);
              ctrl.close();
              return;
            }
            upstreamReader = upstream.body.getReader();
            phase = "stream";
          }
          if (!upstreamReader) {
            clearTimeout(timer);
            ctrl.close();
            return;
          }
          const { done, value } = await upstreamReader.read();
          if (done) {
            phase = "done";
            clearTimeout(timer);
            ctrl.close();
            return;
          }
          ctrl.enqueue(value);
        } catch {
          clearTimeout(timer);
          try {
            line({ type: "error", text: "upstream" });
            ctrl.close();
          } catch {
            /* stream already closed */
          }
        }
      },
      cancel() {
        clearTimeout(timer);
        controller.abort();
        upstreamReader?.cancel().catch(() => {});
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "content-type": "application/x-ndjson",
        "cache-control": "no-cache",
        "x-accel-buffering": "no",
      },
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    let upstream = await callUpstream(controller.signal);
    if (upstream.status === 502 || upstream.status === 503 || upstream.status === 504) {
      await upstream.body?.cancel().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 400));
      upstream = await callUpstream(controller.signal);
    }

    const out = new Headers({ "Access-Control-Allow-Origin": "*" });
    const upstreamType = upstream.headers.get("content-type");
    if (upstreamType) out.set("content-type", upstreamType);
    out.set("cache-control", "no-cache");

    if (!upstream.body) {
      clearTimeout(timer);
      return new Response(null, { status: upstream.status, headers: out });
    }

    const reader = upstream.body.getReader();
    const stream = new ReadableStream({
      async pull(ctrl) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            clearTimeout(timer);
            ctrl.close();
            return;
          }
          ctrl.enqueue(value);
        } catch (err) {
          clearTimeout(timer);
          ctrl.error(err);
        }
      },
      cancel() {
        clearTimeout(timer);
        controller.abort();
        reader.cancel().catch(() => {});
      },
    });

    return new Response(stream, { status: upstream.status, headers: out });
  } catch {
    clearTimeout(timer);
    return new Response(JSON.stringify({ error: "upstream" }), {
      status: 502,
      headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
