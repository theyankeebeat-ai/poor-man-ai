export type SearchHit = { title: string; url: string; snippet: string };

export type WeatherSource = {
  name: string;
  url?: string;
  error?: string;
  desc?: string;
  temp?: number;
  feels?: number;
  humidity?: number;
  wind?: number;
  max?: number;
  min?: number;
};

export type WeatherView = {
  place: string;
  sources: WeatherSource[];
  min?: number;
  max?: number;
  spread?: number;
};

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function parseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function parseSearchHits(text: string): SearchHit[] {
  const data = parseJson(text);
  if (!Array.isArray(data)) return [];
  return data
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const o = x as Record<string, unknown>;
      return {
        title: String(o.title || "Result"),
        url: String(o.url || ""),
        snippet: String(o.snippet || o.content || ""),
      };
    })
    .filter((h) => h.url || h.title);
}

export function parseWeather(text: string): WeatherView | null {
  const data = parseJson(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  if (!Array.isArray(o.sources) && !o.geo && !o.place_query) return null;
  const geo = (o.geo || {}) as Record<string, unknown>;
  const place = [geo.name, geo.admin1, geo.country]
    .filter(Boolean)
    .join(", ") || String(o.place_query || "");
  const sources: WeatherSource[] = (Array.isArray(o.sources) ? o.sources : []).map(
    (s) => {
      const r = s as Record<string, unknown>;
      return {
        name: String(r.name || "Source"),
        url: r.url ? String(r.url) : undefined,
        error: r.error ? String(r.error) : undefined,
        desc: r.desc ? String(r.desc) : undefined,
        temp: num(r.current_c ?? r.temp_c ?? r.air_temp_c),
        feels: num(r.feels_like_c),
        humidity: num(r.humidity),
        wind: num(r.wind_kmh ?? r.wind_kmph),
        max: num(r.today_max_c),
        min: num(r.today_min_c),
      };
    },
  );
  const cc = (o.cross_check || {}) as Record<string, unknown>;
  return {
    place,
    sources,
    min: num(cc.min_c),
    max: num(cc.max_c),
    spread: num(cc.spread_c),
  };
}

export function toolLabel(name: string, live = false): string {
  if (name.startsWith("crew:")) {
    const who = name.slice(5);
    return live ? `Working with ${who}…` : `Agent · ${who}`;
  }
  if (name.startsWith("brain:")) {
    const who = name.slice(6);
    return live ? `Local brain · ${who}…` : `Brain · ${who}`;
  }
  const liveMap: Record<string, string> = {
    weather_compare: "Checking weather sources…",
    web_search: "Searching the web…",
    read_url: "Reading the page…",
    memory_write: "Saving to memory…",
    memory_search: "Looking in memory…",
    youtube_summarize: "Watching YouTube…",
    local_video_summarize: "Reading local video…",
    read_image: "Looking at the image…",
    generate_image: "Generating an image…",
    consult_knowledge: "Reading playbooks…",
    agent_talk: "Specialists talking…",
    extract_claims: "Extracting claims…",
    compare_sources: "Comparing sources…",
    cite_pack: "Packing citations…",
  };
  const map: Record<string, string> = {
    weather_compare: "Weather sources",
    web_search: "Web results",
    read_url: "Page",
    memory_write: "Saved to memory",
    memory_search: "Memory",
    youtube_summarize: "YouTube",
    local_video_summarize: "Local video",
    read_image: "Image",
    generate_image: "Image",
    consult_knowledge: "Playbooks",
    agent_talk: "Agent talk",
    extract_claims: "Claims",
    compare_sources: "Source compare",
    cite_pack: "Citations",
  };
  if (live) return liveMap[name] ?? `Working on ${name.replace(/_/g, " ")}…`;
  return map[name] ?? name.replace(/_/g, " ");
}

export function toolQueryHint(argsText: string): string {
  try {
    const o = JSON.parse(argsText) as Record<string, unknown>;
    const q = o.query ?? o.q ?? o.url ?? o.place ?? o.goal;
    if (typeof q === "string" && q.trim()) return q.trim();
  } catch {
    /* ignore */
  }
  return "";
}

export function isWeatherAnswer(text: string): boolean {
  return /weather cross-check/i.test(text) || /open-meteo/i.test(text);
}

/** If a tool dump / JSON envelope leaked into chat text, prefer the prose field. */
export function unwrapAnswerPayload(text: string): string {
  const raw = (text || "").trim();
  if (!raw) return raw;

  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const data = JSON.parse(s) as unknown;
      return data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };

  const pickProse = (data: Record<string, unknown> | null): string | null => {
    if (!data) return null;
    for (const key of ["message", "draft", "answer", "text", "content"]) {
      const val = data[key];
      if (typeof val === "string" && val.trim().length >= 8) return val.trim();
    }
    return null;
  };

  const prefixed = raw.match(/^(?:final_answer|answer)\s*:\s*(\{[\s\S]*\})\s*$/i);
  if (prefixed?.[1]) {
    const prose = pickProse(tryParse(prefixed[1]));
    if (prose) return prose;
  }

  if (raw.startsWith("{") && raw.endsWith("}")) {
    const prose = pickProse(tryParse(raw));
    if (prose) return prose;
  }

  return raw;
}

export function splitCitations(text: string): { body: string; urls: string[] } {
  const urls: string[] = [];
  const parts = (text || "").split(/\n+Citations:\s*\n/i);
  const body = unwrapAnswerPayload((parts[0] || "").trim());
  const rest = parts.slice(1).join("\n");
  const blob = rest || text || "";
  for (const m of blob.matchAll(/https?:\/\/[^\s)\]>"]+/g)) {
    const u = m[0].replace(/[.,;]+$/, "");
    if (!urls.includes(u)) urls.push(u);
  }
  return { body, urls };
}
