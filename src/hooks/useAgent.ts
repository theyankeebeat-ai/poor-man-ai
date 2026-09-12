import { useCallback, useRef, useState } from "react";
import { streamChat, staticUrl } from "../api";
import type { AgentEvent, ChatMessage } from "../types";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function extractImages(text: string): { urls: string[]; queued?: string } {
  const urls: string[] = [];
  let queued: string | undefined;
  try {
    const j = JSON.parse(text) as {
      path?: string;
      status?: string;
      url?: string;
    };
    if (j.path?.endsWith(".png") || j.path?.endsWith(".jpg") || j.path?.endsWith(".webp")) {
      urls.push(staticUrl(j.path));
    }
    if (j.url && /\.(png|jpg|jpeg|webp)(\?|$)/i.test(j.url)) {
      urls.push(staticUrl(j.url));
    }
    if ((j.status === "queued_json_only" || j.status === "placeholder_png") && j.path) {
      if (j.status === "placeholder_png" && j.path.match(/\.(png|jpg|jpeg|webp)$/i)) {
        urls.push(staticUrl(j.path));
      } else {
        queued = staticUrl(j.path);
      }
    }
  } catch {
    const m = text.match(/\/static\/images\/[\w.-]+/g);
    if (m) urls.push(...m.map(staticUrl));
  }
  return { urls, queued };
}

export function useAgent(initial: ChatMessage[] = []) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [running, setRunning] = useState(false);
  const [livePlan, setLivePlan] = useState<string>("");
  const [liveStatus, setLiveStatus] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);
  const lastAssistantText = useRef("");
  const messagesHold = useRef(messages);
  messagesHold.current = messages;

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setLiveStatus("Stopped");
  }, []);

  const reset = useCallback((next: ChatMessage[] = []) => {
    stop();
    setMessages(next);
    setLivePlan("");
    setLiveStatus("");
    lastAssistantText.current = "";
  }, [stop]);

  const send = useCallback(async (
    text: string,
    maxSteps = 8,
    opts: {
      workspace?: string;
      mode?: string;
      attachments?: import("../types").UploadedAttachment[];
    } = {},
  ) => {
    abortRef.current?.abort();
    const turnId = uid();
    const user: ChatMessage = {
      id: uid(),
      role: "user",
      text,
      turnId,
      attachments: opts.attachments && opts.attachments.length > 0 ? opts.attachments : undefined,
    };
    const aid = uid();
    lastAssistantText.current = "";
    const prior = messagesHold.current
      .filter((m) => m.role === "user" || m.role === "assistant")
      .filter((m) => m.text.trim())
      .slice(-16)
      .map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, user, { id: aid, role: "assistant", text: "", turnId }]);
    setLivePlan("");
    setLiveStatus("Thinking…");
    setRunning(true);
    const ac = new AbortController();
    abortRef.current = ac;

    const patchAssistant = (fn: (prev: ChatMessage) => ChatMessage) => {
      setMessages((all) => all.map((msg) => (msg.id === aid ? fn(msg) : msg)));
    };

    try {
      await streamChat(text, maxSteps, ac.signal, (ev: AgentEvent) => {
        if (ev.type === "plan") {
          setLivePlan(ev.text);
          setLiveStatus("Planning…");
          patchAssistant((p) => ({ ...p, plan: ev.text }));
        } else if (ev.type === "tool") {
          setLiveStatus(ev.name);
          setMessages((all) => [
            ...all,
            {
              id: uid(),
              role: "tool",
              text: JSON.stringify(ev.args),
              toolName: ev.name,
              turnId,
            },
          ]);
        } else if (ev.type === "observation") {
          setLiveStatus("Thinking…");
          const { urls, queued } = extractImages(ev.text);
          setMessages((all) => {
            const next = [...all];
            // FIFO: first unmatched tool card with this name (server emits tools then obs in call order).
            for (let i = 0; i < next.length; i++) {
              const row = next[i];
              if (row && row.role === "tool" && row.toolName === ev.name && !row.observation) {
                next[i] = {
                  ...row,
                  observation: ev.text,
                  imageUrls: urls.length ? urls : row.imageUrls,
                  queuedJson: queued ?? row.queuedJson,
                };
                break;
              }
            }
            return next;
          });
        } else if (ev.type === "token") {
          setLiveStatus("");
          lastAssistantText.current += ev.text;
          patchAssistant((p) => ({ ...p, text: p.text + ev.text }));
        } else if (ev.type === "done") {
          lastAssistantText.current = ev.text || lastAssistantText.current;
          patchAssistant((p) => ({ ...p, text: ev.text || p.text }));
        } else if (ev.type === "error") {
          const t = lastAssistantText.current
            ? `${lastAssistantText.current}\n\nError: ${ev.text}`
            : `Error: ${ev.text}`;
          lastAssistantText.current = t;
          patchAssistant((p) => ({ ...p, text: t }));
        }
      }, prior, opts);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        patchAssistant((p) => ({
          ...p,
          text: `Error: ${(e as Error).message}`,
        }));
      }
    } finally {
      setRunning(false);
      setLiveStatus("");
      abortRef.current = null;
    }
    return lastAssistantText.current;
  }, []);

  return { messages, running, livePlan, liveStatus, send, stop, reset };
}
