import type { SearchHit } from "../lib/formatResults";

export function SearchHits({
  hits,
  compact,
}: {
  hits: SearchHit[];
  compact?: boolean;
}) {
  if (!hits.length) return null;
  const list = hits.slice(0, compact ? 8 : 6);
  return (
    <details
      className={`overflow-hidden rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--card))]/70 ${
        compact ? "text-[11px]" : ""
      }`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
        <span>Sources</span>
        <span className="rounded-full bg-[rgb(var(--line))]/60 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal">
          {hits.length}
        </span>
      </summary>
      <div className="divide-y divide-[rgb(var(--line))]/70 border-t border-[rgb(var(--line))]/70">
        {list.map((h, i) => {
          let host = "";
          try {
            if (h.url) host = new URL(h.url).hostname.replace(/^www\./, "");
          } catch {
            /* keep empty host */
          }
          return (
            <a
              key={`${h.url}-${i}`}
              href={h.url || undefined}
              target="_blank"
              rel="noreferrer"
              className="group block px-3 py-1.5 hover:bg-[rgb(var(--card-elevated))]/50"
            >
              <p className="truncate text-[11px] font-medium text-[rgb(var(--accent))]">{host || h.title}</p>
              <p className="line-clamp-1 text-[11px] text-[rgb(var(--muted))]">{h.title}</p>
            </a>
          );
        })}
      </div>
    </details>
  );
}
