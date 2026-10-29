const URL_RE = /(https?:\/\/[^\s)]+)/g;

export function RichText({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => !l.trim().startsWith("{"));
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        const parts = line.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g);
        return (
          <p key={i}>
            {parts.map((p, j) => {
              if (p.startsWith("**") && p.endsWith("**")) {
                return (
                  <strong key={j} className="font-semibold">
                    {p.slice(2, -2)}
                  </strong>
                );
              }
              if (URL_RE.test(p)) {
                URL_RE.lastIndex = 0;
                return (
                  <a
                    key={j}
                    href={p}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[rgb(var(--accent))] hover:underline"
                  >
                    {new URL(p).hostname.replace(/^www\./, "")}
                  </a>
                );
              }
              return <span key={j}>{p.replace(/^[-•]\s*/, line.trim().startsWith("-") ? "" : "")}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}
