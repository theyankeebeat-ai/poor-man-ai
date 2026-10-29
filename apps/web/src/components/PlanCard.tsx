type Props = { text: string; live?: boolean };

export function PlanCard({ text, live }: Props) {
  if (!text) return null;
  return (
    <div className="flex items-start gap-2 text-xs text-zinc-500">
      {live && (
        <span className="mt-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
      )}
      <p className="leading-relaxed">{text}</p>
    </div>
  );
}
