import type { Conversation } from "../types";

const KEY = "ra-history";

export function loadHistory(): Conversation[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHistory(items: Conversation[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function titleFromMessages(messages: Conversation["messages"]): string {
  const user = messages.find((m) => m.role === "user");
  const t = (user?.text || "New chat").replace(/\s+/g, " ").trim();
  return t.length > 42 ? t.slice(0, 42) + "…" : t;
}
