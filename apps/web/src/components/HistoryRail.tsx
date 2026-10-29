import { THEMES, useTheme } from "../theme";
import type { Conversation } from "../types";
import { PlusIcon, TrashIcon } from "./icons";

export function HistoryRail({
  items,
  activeId,
  onNew,
  onOpen,
  onDelete,
  onClear,
  workspace,
  onWorkspaceChange,
  forceCode,
  onForceCodeChange,
}: {
  items: Conversation[];
  activeId: string | null;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  workspace: string;
  onWorkspaceChange: (path: string) => void;
  forceCode: boolean;
  onForceCodeChange: (force: boolean) => void;
}) {
  const { theme, setTheme } = useTheme();

  return (
    <aside className="flex h-full w-[17rem] shrink-0 flex-col border-r border-[rgb(var(--line))] bg-[rgb(var(--card))]/95 backdrop-blur-md">
      {/* Header & New Chat button */}
      <div className="p-4 pb-3 border-b border-[rgb(var(--line))]/40">
        <div className="flex items-center justify-between mb-3 px-0.5">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-[rgb(var(--accent))] flex items-center justify-center text-[rgb(var(--accent-fg))] font-black text-xs">
              G
            </div>
            <span className="text-sm font-bold tracking-tight text-[rgb(var(--fg))]">Grok Agent</span>
          </div>
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[rgb(var(--line))] text-[rgb(var(--muted))]">
            v2.5
          </span>
        </div>

        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[rgb(var(--accent))] px-3.5 py-2.5 text-xs font-semibold text-[rgb(var(--accent-fg))] shadow-sm transition-all duration-150 hover:opacity-95 hover:shadow active:scale-[0.99]"
        >
          <PlusIcon className="h-4 w-4" />
          <span>New Conversation</span>
        </button>
      </div>

      {/* Workplace Configuration */}
      <div className="px-4 py-3 border-b border-[rgb(var(--line))]/30 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
            Workplace
          </span>
          <label className={`flex items-center gap-1.5 cursor-pointer text-[10px] font-medium transition-colors ${
            forceCode ? "text-[rgb(var(--accent))]" : "text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]"
          }`}>
            <input
              type="checkbox"
              checked={forceCode}
              onChange={(e) => onForceCodeChange(e.target.checked)}
              className="h-3 w-3 accent-[rgb(var(--accent))] rounded"
            />
            <span>Code Mode</span>
          </label>
        </div>

        <div className="relative">
          <input
            type="text"
            value={workspace}
            onChange={(e) => onWorkspaceChange(e.target.value)}
            placeholder="e.g. C:\projects\my-app"
            title="Workplace directory path for code editing and generation"
            className="w-full rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--card-elevated))]/80 px-3 py-1.5 text-xs text-[rgb(var(--fg))] placeholder:text-[rgb(var(--muted))]/70 focus:outline-none focus:border-[rgb(var(--accent))] focus:ring-1 focus:ring-[rgb(var(--accent))]/30 transition-all font-mono"
          />
          {workspace && (
            <div className="mt-1 flex items-center justify-between text-[10px] text-[rgb(var(--muted))]">
              <span className="truncate max-w-[13rem]" title={workspace}>
                📁 {workspace.replace(/\\/g, "/").split("/").filter(Boolean).pop() || workspace}
              </span>
              <button
                type="button"
                onClick={() => onWorkspaceChange("")}
                className="hover:text-rose-400 text-[10px] underline ml-1"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Theme Picker */}
      <div className="px-4 py-3 border-b border-[rgb(var(--line))]/30">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
          Theme Mode
        </p>
        <div className="grid grid-cols-6 gap-1">
          {THEMES.map((t) => {
            const isActive = theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                title={t.label}
                className={`flex flex-col items-center justify-center rounded-lg p-1.5 transition-all ${
                  isActive
                    ? "bg-[rgb(var(--card-elevated))] ring-2 ring-[rgb(var(--accent))] text-[rgb(var(--fg))]"
                    : "hover:bg-[rgb(var(--card-elevated))]/60 text-[rgb(var(--muted))]"
                }`}
              >
                <div
                  className={`h-4 w-4 rounded-full border border-black/20 ${
                    t.id === "cyber-dark"
                      ? "bg-[#0a0d14]"
                      : t.id === "midnight-blue"
                      ? "bg-[#090d16]"
                      : t.id === "matrix"
                      ? "bg-[#050d08]"
                      : t.id === "dracula"
                      ? "bg-[#120b1c]"
                      : t.id === "light"
                      ? "bg-slate-100"
                      : "bg-[#f5ede0]"
                  }`}
                />
                <span className="mt-1 text-[8px] font-medium leading-none truncate max-w-full">
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* History List Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
          Recent Threads
        </span>
        {items.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 text-[11px] text-[rgb(var(--muted))] transition-colors hover:text-rose-500"
          >
            <TrashIcon className="h-3 w-3" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Threads */}
      <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        {items.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-[rgb(var(--muted))]">
            No previous threads yet.
          </div>
        )}
        {items.map((c) => {
          const isActive = c.id === activeId;
          return (
            <div
              key={c.id}
              className={`group flex items-center justify-between rounded-xl px-3 py-2 text-xs transition-all ${
                isActive
                  ? "bg-[rgb(var(--card-elevated))] font-medium text-[rgb(var(--fg))] shadow-xs border border-[rgb(var(--line))]"
                  : "text-[rgb(var(--muted))] hover:bg-[rgb(var(--card-elevated))]/50 hover:text-[rgb(var(--fg))]"
              }`}
            >
              <button
                type="button"
                onClick={() => onOpen(c.id)}
                className="min-w-0 flex-1 truncate text-left"
              >
                {c.title}
              </button>
              <div className="ml-2 hidden items-center gap-0.5 group-hover:flex">
                <button
                  type="button"
                  aria-label="Export conversation"
                  title="Download conversation (.md)"
                  onClick={(e) => {
                    e.stopPropagation();
                    const md = c.messages
                      .filter((m) => m.role !== "tool")
                      .map((m) => `### ${m.role === "user" ? "User" : "Assistant"}\n\n${m.text}`)
                      .join("\n\n---\n\n");
                    const blob = new Blob([`# ${c.title}\n\n${md}`], { type: "text/markdown;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${c.title.slice(0, 30).replace(/[^a-z0-9_-]/gi, "_")}.md`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  className="rounded-md p-1 text-[rgb(var(--muted))] hover:bg-[rgb(var(--card))] hover:text-[rgb(var(--accent))] transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label="Delete thread"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(c.id);
                  }}
                  className="rounded-md p-1 text-[rgb(var(--muted))] hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
