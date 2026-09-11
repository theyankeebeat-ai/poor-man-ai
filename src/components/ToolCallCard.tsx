import { API, staticUrl } from "../api";
import {
  parseSearchHits,
  parseWeather,
  toolLabel,
  toolQueryHint,
} from "../lib/formatResults";
import type { ChatMessage } from "../types";
import { SearchHits } from "./SearchHits";
import { WeatherCard } from "./WeatherCard";
import { SparklesIcon } from "./icons";

export function ToolCallCard({
  msg,
  live,
}: {
  msg: ChatMessage;
  live?: boolean;
}) {
  const name = msg.toolName ?? "tool";
  const pending = live && !msg.observation;
  const hint = toolQueryHint(msg.text || "");

  if (name === "memory_write") {
    // In-context memory persistence is recorded silently in background
    return null;
  }

  const obs = msg.observation;
  const weather = obs ? parseWeather(obs) : null;
  const hits = obs ? parseSearchHits(obs) : [];
  const failed = Boolean(
    obs && /error|401|unauthorized/i.test(obs) && !weather && !hits.length,
  );

  if (weather) return <WeatherCard data={weather} />;
  if (hits.length) return <SearchHits hits={hits} />;

  if (pending || failed || name === "web_search") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] px-4 py-3 shadow-xs">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--accent))]/10 text-[rgb(var(--accent))]">
          {pending ? (
            <span className="h-2 w-2 animate-ping rounded-full bg-[rgb(var(--accent))]" />
          ) : (
            <SparklesIcon className="h-3.5 w-3.5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-[rgb(var(--fg))]">
              {toolLabel(name, pending)}
            </p>
            {pending && (
              <span className="rounded-full bg-[rgb(var(--accent))]/15 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--accent))]">
                Running
              </span>
            )}
          </div>
          {hint && (
            <p className="mt-1 font-mono text-[11px] text-[rgb(var(--muted))] break-all bg-[rgb(var(--bg))] p-1.5 rounded-lg border border-[rgb(var(--line))]/60">
              {hint}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (name.startsWith("crew:")) {
    return (
      <div className="rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] p-3.5 shadow-xs">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--accent))]">
          {toolLabel(name)}
        </p>
        {obs && (
          <p className="mt-1 text-xs leading-relaxed text-[rgb(var(--muted))]">{obs}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--card))] px-4 py-3 text-xs text-[rgb(var(--muted))] shadow-xs">
      <div className="flex items-center gap-2 font-medium text-[rgb(var(--fg))]">
        {pending ? (
          <span className="h-2 w-2 animate-pulse rounded-full bg-[rgb(var(--accent))]" />
        ) : (
          <span className="h-2 w-2 rounded-full bg-emerald-500/80" />
        )}
        <span>{toolLabel(name)}</span>
      </div>
      {msg.imageUrls?.map((src) => (
        <img
          key={src}
          src={src.startsWith("http") ? src : `${API}${src}`}
          alt=""
          className="mt-3 max-h-72 rounded-xl border border-[rgb(var(--line))] object-cover shadow-sm"
        />
      ))}
      {msg.queuedJson && (
        <a
          className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-medium text-[rgb(var(--accent))] hover:underline"
          href={staticUrl(msg.queuedJson)}
          target="_blank"
          rel="noreferrer"
        >
          View generated artifact →
        </a>
      )}
    </div>
  );
}
