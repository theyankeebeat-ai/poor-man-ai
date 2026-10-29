/** Hosted brains, best capacity first. Local Next dev keeps using /b. */
export const HOSTED_BRAINS = [
  "https://poor-man-ai.vercel.app",
  "https://poor-man-ai.onrender.com",
  "https://wqrriztbsifgytjzippi.supabase.co/functions/v1/api",
  "https://6abf29600005f72b00bb.fra.appwrite.run",
] as const;

function initialApi(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return "/b";
  }
  return HOSTED_BRAINS[0];
}

/** Live binding. ensureBrain() may replace this before the cockpit renders. */
export let API = initialApi();

function isFixed(url: string): boolean {
  return (
    url === "/b" ||
    url.startsWith("http://127.0.0.1") ||
    url.startsWith("http://localhost") ||
    Boolean(process.env.NEXT_PUBLIC_API_URL)
  );
}

let pending: Promise<string> | null = null;

async function probe(base: string, timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/health`, { cache: "no-store", signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Pick the first healthy hosted brain. Vercel is preferred. Render may be cold. */
export function ensureBrain(): Promise<string> {
  if (isFixed(API)) return Promise.resolve(API);
  if (!pending) {
    pending = new Promise((resolve) => {
      const hosts = [...HOSTED_BRAINS];
      let left = hosts.length;
      let best = -1;
      let settled = false;
      const finish = () => {
        if (settled) return;
        if (best === 0 || left === 0) {
          settled = true;
          API = best >= 0 ? hosts[best] : hosts[0];
          resolve(API);
        }
      };
      hosts.forEach((base, index) => {
        const timeoutMs = index === 1 ? 50000 : 20000;
        probe(base, timeoutMs).then((ok) => {
          if (ok && (best < 0 || index < best)) best = index;
          left -= 1;
          finish();
        });
      });
    });
  }
  return pending;
}
