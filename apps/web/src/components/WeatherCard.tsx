import type { WeatherView } from "../lib/formatResults";

function Temp({ value }: { value?: number }) {
  if (value == null) return <span className="text-[rgb(var(--muted))]">—</span>;
  return (
    <span className="tabular-nums font-semibold">
      {Math.round(value * 10) / 10}
      <span className="text-xl font-normal text-[rgb(var(--muted))]">°C</span>
    </span>
  );
}

export function WeatherCard({ data }: { data: WeatherView }) {
  const headline = data.sources.map((s) => s.temp).filter((n): n is number => n != null);
  const mid =
    headline.length > 0
      ? headline.reduce((a, b) => a + b, 0) / headline.length
      : undefined;

  return (
    <div className="overflow-hidden rounded-3xl border border-[rgb(var(--line))] bg-gradient-to-b from-[rgb(var(--card))] to-[rgb(var(--bg))] shadow-md">
      <div className="flex items-end justify-between px-6 pb-4 pt-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
              Real-time Weather
            </p>
          </div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[rgb(var(--fg))]">
            {data.place}
          </h2>
        </div>
        <div className="text-5xl font-light tracking-tight text-[rgb(var(--fg))]">
          <Temp value={mid} />
        </div>
      </div>

      {data.spread != null && (
        <div className="flex items-center justify-between border-t border-[rgb(var(--line))]/40 px-6 py-2.5 bg-[rgb(var(--bg))]/40 text-xs text-[rgb(var(--muted))]">
          <span>Multi-source variance</span>
          <span className="font-medium text-[rgb(var(--fg))]">
            Within {data.spread}°C ({data.min}° – {data.max}°)
          </span>
        </div>
      )}

      <div className="grid gap-px bg-[rgb(var(--line))] sm:grid-cols-3">
        {data.sources.map((s) => (
          <div key={s.name} className="bg-[rgb(var(--card))] px-4.5 py-3.5 transition-colors hover:bg-[rgb(var(--card-elevated))]">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-semibold text-[rgb(var(--muted))]">{s.name}</p>
              <p className="text-base font-semibold text-[rgb(var(--fg))]">
                <Temp value={s.temp} />
              </p>
            </div>
            {s.error ? (
              <p className="mt-1.5 text-xs text-rose-400">Sensor Unavailable</p>
            ) : (
              <p className="mt-1.5 text-xs text-[rgb(var(--muted))]">
                {[s.desc, s.humidity != null ? `${s.humidity}% humidity` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {s.url && (
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-medium text-[rgb(var(--accent))] hover:underline"
              >
                Source details ↗
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
