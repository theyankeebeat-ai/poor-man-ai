import { useEffect, useState } from "react";
import { fetchMemory } from "../api";
import type { MemoryFact } from "../types";
import { BrainIcon } from "./icons";

export function MemoryPanel({ refreshKey }: { refreshKey: number }) {
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      fetchMemory()
        .then(setFacts)
        .catch((e: Error) => setErr(e.message));
    }, 800);
    return () => window.clearTimeout(t);
  }, [refreshKey]);

  return (
    <aside className="hidden h-full w-64 shrink-0 flex-col border-l border-[rgb(var(--line))] bg-[rgb(var(--card))]/90 backdrop-blur-md xl:flex">
      <div className="flex items-center justify-between border-b border-[rgb(var(--line))]/50 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <BrainIcon className="h-4 w-4 text-[rgb(var(--accent))]" />
          <span className="text-xs font-semibold tracking-tight text-[rgb(var(--fg))]">
            Context Memory
          </span>
        </div>
        <span className="rounded-full bg-[rgb(var(--line))]/60 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--muted))]">
          {facts.length}
        </span>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {err && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-400">
            {err}
          </div>
        )}
        {!err && facts.length === 0 && (
          <div className="flex flex-col items-center justify-center p-6 text-center text-xs leading-relaxed text-[rgb(var(--muted))]">
            <span className="mb-2 text-xl opacity-60">🧠</span>
            Discovered insights & key knowledge will automatically persist here.
          </div>
        )}
        {facts
          .slice()
          .reverse()
          .map((f, i) => (
            <div
              key={`${f.ts}-${i}`}
              className="rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--card-elevated))]/60 p-3 text-xs transition-all hover:border-[rgb(var(--accent))]/40"
            >
              <p className="line-clamp-4 leading-relaxed text-[rgb(var(--fg))]">
                {f.fact.replace(/\*\*/g, "").slice(0, 220)}
              </p>
              {f.source_url && (
                <a
                  className="mt-2.5 flex items-center gap-1 truncate text-[10px] font-medium text-[rgb(var(--accent))] hover:underline"
                  href={f.source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>🔗</span>
                  <span className="truncate">{f.source_url.replace(/^https?:\/\//, "")}</span>
                </a>
              )}
            </div>
          ))}
      </div>
    </aside>
  );
}
