import type { AgentEvent, MemoryFact } from "./types";
import {
  DEFAULT_HYPERPARAMS,
  INTEL_STORAGE_KEY,
  intelligencePayload,
  type HyperparametersConfig,
} from "./types/architecture";

function loadIntelligence(): ReturnType<typeof intelligencePayload> {
  try {
    const raw = localStorage.getItem(INTEL_STORAGE_KEY);
    if (raw) {
      const hp = { ...DEFAULT_HYPERPARAMS, ...(JSON.parse(raw) as Partial<HyperparametersConfig>) };
      return intelligencePayload(hp);
    }
  } catch {
    /* ignore */
  }
  return intelligencePayload(DEFAULT_HYPERPARAMS);
}

const LOCAL_API = "http://127.0.0.1:8000";
const HOSTED_API = import.meta.env.VITE_API_URL || "https://wqrriztbsifgytjzippi.supabase.co/functions/v1/api";

function resolveApi(): string {
  if (typeof window === "undefined") return LOCAL_API;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return LOCAL_API;
  return HOSTED_API;
}

export const API = resolveApi();

export async function fetchMemory(): Promise<MemoryFact[]> {
  const r = await fetch(`${API}/memory`);
  if (!r.ok) throw new Error(`memory ${r.status}`);
  const data = (await r.json()) as { facts: MemoryFact[] };
  return data.facts ?? [];
}

export async function streamChat(
  message: string,
  maxSteps: number,
  signal: AbortSignal,
  onEvent: (ev: AgentEvent) => void,
  history: { role: string; text: string }[] = [],
  opts: { workspace?: string; mode?: string; thinking_level?: 'low' | 'medium' | 'high' } = {},
): Promise<void> {
  const r = await fetch(`${API}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    cache: "no-store",
    body: JSON.stringify({
      message,
      max_steps: maxSteps,
      history,
      workspace: opts.workspace || undefined,
      mode: opts.mode || undefined,
      thinking_level: opts.thinking_level || 'medium',
      intelligence: loadIntelligence(),
    }),
    signal,
  });
  if (!r.ok || !r.body) {
    throw new Error(`chat ${r.status}`);
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let hasAnswer = false;
  const emit = (event: AgentEvent) => {
    if ((event.type === "token" || event.type === "done" || event.type === "error") && event.text?.trim()) hasAnswer = true;
    onEvent(event);
  };
  let buf = "";
  const cancelReader = () => {
    try {
      void reader.cancel();
    } catch {
      /* ignore */
    }
  };
  const onAbort = () => cancelReader();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (true) {
      if (signal.aborted) {
        cancelReader();
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed || signal.aborted) continue;
        try {
          emit(JSON.parse(trimmed) as AgentEvent);
        } catch {
          /* ignore partial JSON */
        }
      }
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
  if (buf.trim() && !signal.aborted) {
    try {
      emit(JSON.parse(buf.trim()) as AgentEvent);
    } catch {
      /* ignore */
    }
  }
  if (!signal.aborted && !hasAnswer) throw new Error("The backend closed the stream without an answer. Please retry.");
}

export function staticUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API}${path.startsWith("/") ? path : `/${path}`}`;
}

type TTSVoice = { id: string; name: string; lang: string; gender: string };

/** In-flight / resolved cache — survives HMR remounts via sessionStorage. */
const TTS_VOICES_SESSION_KEY = "ra-tts-voices-v1";
let ttsVoicesPromise: Promise<TTSVoice[]> | null = null;

function readCachedTTSVoices(): TTSVoice[] | null {
  try {
    const raw = sessionStorage.getItem(TTS_VOICES_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; voices?: TTSVoice[] };
    if (!parsed?.voices?.length || !parsed.at) return null;
    // 1 hour client cache
    if (Date.now() - parsed.at > 60 * 60 * 1000) return null;
    return parsed.voices;
  } catch {
    return null;
  }
}

export async function fetchTTSVoices(): Promise<TTSVoice[]> {
  if (!ttsVoicesPromise) {
    ttsVoicesPromise = (async () => {
      const cached = readCachedTTSVoices();
      if (cached) return cached;
      try {
        const r = await fetch(`${API}/tts/voices`);
        if (!r.ok) return [];
        const data = (await r.json()) as { voices: TTSVoice[] };
        const voices = data.voices ?? [];
        if (voices.length) {
          try {
            sessionStorage.setItem(
              TTS_VOICES_SESSION_KEY,
              JSON.stringify({ at: Date.now(), voices }),
            );
          } catch {
            /* ignore quota */
          }
        }
        return voices;
      } catch {
        return [];
      }
    })();
  }
  return ttsVoicesPromise;
}

export async function synthesizeTTS(
  text: string,
  voice = "en-US-AriaNeural",
  rate = "+0%",
  pitch = "+0Hz",
): Promise<Blob | null> {
  try {
    const r = await fetch(`${API}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice, rate, pitch }),
    });
    if (!r.ok) return null;
    return await r.blob();
  } catch {
    return null;
  }
}

export async function uploadFile(
  file: File,
): Promise<{
  filename: string;
  url: string;
  size: number;
  isImage: boolean;
  preview?: string;
}> {
  const formData = new FormData();
  formData.append("file", file);
  const r = await fetch(`${API}/upload`, {
    method: "POST",
    body: formData,
  });
  if (!r.ok) {
    throw new Error(`Upload failed with status ${r.status}`);
  }
  const data = (await r.json()) as {
    filename: string;
    url: string;
    size: number;
    is_image: boolean;
    preview?: string;
  };
  return {
    filename: data.filename,
    url: staticUrl(data.url),
    size: data.size,
    isImage: data.is_image,
    preview: data.preview,
  };
}


