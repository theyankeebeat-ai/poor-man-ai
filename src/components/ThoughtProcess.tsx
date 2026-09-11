import type { ChatMessage } from "../types";
import { ToolCallCard } from "./ToolCallCard";
import { BrainIcon, ChevronDownIcon } from "./icons";

const PHASES: { id: string; label: string; match: (name: string) => boolean }[] = [
  {
    id: "understand",
    label: "1 · Understand",
    match: (n) =>
      /thread|context|skill_router|resolve_thread|knowledge|consult_knowledge|brain:/.test(n),
  },
  {
    id: "plan",
    label: "2 · Plan",
    match: (n) => /planner|scout|howto|crew:time/.test(n),
  },
  {
    id: "gather",
    label: "3 · Gather",
    match: (n) =>
      /web_search|read_url|weather|followup_search|librarian|api|youtube|memory_search|generate_image|read_image/.test(
        n,
      ),
  },
  {
    id: "gaps",
    label: "4 · Fill gaps",
    match: (n) => /gap|logic|exchange|agent_talk/.test(n),
  },
  {
    id: "reason",
    label: "5 · Reason",
    match: (n) =>
      /facts|numbers|units|compare|skeptic|risk|citations|cite_pack|extract_claims|compare_sources|memory(?!_)/.test(
        n,
      ),
  },
  {
    id: "compose",
    label: "6 · Compose",
    match: (n) => /judge|final_answer/.test(n),
  },
  {
    id: "verify",
    label: "7 · Verify",
    match: (n) => /verif/.test(n),
  },
];

function phaseOf(name: string): string {
  const n = name.toLowerCase();
  for (const p of PHASES) {
    if (p.match(n)) return p.id;
  }
  return "gather";
}

export function ThoughtProcess({
  plan,
  tools,
  live,
}: {
  plan?: string;
  tools: ChatMessage[];
  live?: boolean;
}) {
  const visibleTools = tools.filter((t) => t.toolName !== "memory_write");
  if (!plan && visibleTools.length === 0 && !live) return null;
  const n = visibleTools.length;
  const grouped = PHASES.map((p) => ({
    ...p,
    items: visibleTools.filter((t) => phaseOf(t.toolName || "") === p.id),
  })).filter((g) => g.items.length > 0);

  return (
    <details
      open={live ? true : false}
      className="group rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--card))]/50"
    >
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-[11px] font-medium text-[rgb(var(--muted))]">
        <div
          className={`flex h-6 w-6 items-center justify-center rounded-lg border border-[rgb(var(--line))] bg-[rgb(var(--bg))] text-[rgb(var(--accent))] transition-transform ${
            live ? "animate-pulse" : ""
          }`}
        >
          <BrainIcon className="h-3.5 w-3.5" />
        </div>
        <span className="font-semibold text-[rgb(var(--fg))]">
          {live ? "Steps…" : "Steps"}
        </span>
        <span className="rounded-full bg-[rgb(var(--line))]/60 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--muted))]">
          {n} {n === 1 ? "step" : "steps"}
        </span>

        <div className="ml-auto text-[rgb(var(--muted))] transition-transform duration-200 details-chevron">
          <ChevronDownIcon className="h-4 w-4" />
        </div>
      </summary>

      <div className="max-h-56 space-y-2 overflow-y-auto border-t border-[rgb(var(--line))]/60 bg-[rgb(var(--bg))]/30 px-3 py-2">
        {plan && (
          <div className="rounded-xl border border-[rgb(var(--line))]/70 bg-[rgb(var(--card))] p-3 text-xs leading-relaxed text-[rgb(var(--muted))]">
            <span className="font-semibold text-[rgb(var(--fg))] block mb-1">
              Understand → plan → gather → gaps → compose → verify
            </span>
            {plan}
          </div>
        )}
        <div className="space-y-3">
          {grouped.map((g) => (
            <div key={g.id} className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">
                {g.label}
              </div>
              {g.items.map((t) => (
                <ToolCallCard key={t.id} msg={t} live={live && !t.observation} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
