import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useAgent } from "../hooks/useAgent";
import { useVoice } from "../hooks/useVoice";
import {
  parseSearchHits,
  parseWeather,
  splitCitations,
  toolLabel,
  type SearchHit,
} from "../lib/formatResults";
import { SearchHits } from "./SearchHits";
import { loadHistory, saveHistory, titleFromMessages } from "../lib/history";
import { uploadFile } from "../api";
import type { ChatMessage, Conversation, UploadedAttachment } from "../types";
import { ToolCallCard } from "./ToolCallCard";
import { HistoryRail } from "./HistoryRail";
import { Message } from "./Message";
import { ThoughtProcess } from "./ThoughtProcess";
import {
  AudioWaveIcon,
  CloseIcon,
  DownloadIcon,
  FileTextIcon,
  MicIcon,
  PaperclipIcon,
  SendIcon,
  ShareIcon,
  SparklesIcon,
  StopIcon,
  VolumeOffIcon,
  VolumeUpIcon,
} from "./icons";

function groupTurns(messages: ChatMessage[]) {
  const order: string[] = [];
  const map = new Map<string, ChatMessage[]>();
  for (const m of messages) {
    const id = m.turnId || m.id;
    if (!map.has(id)) {
      map.set(id, []);
      order.push(id);
    }
    map.get(id)!.push(m);
  }
  return order.map((id) => map.get(id)!);
}

export function Chat() {
  const [history, setHistory] = useState<Conversation[]>(() => loadHistory());
  const [activeId, setActiveId] = useState<string | null>(
    () => loadHistory()[0]?.id ?? null,
  );
  const initial = history.find((c) => c.id === activeId)?.messages ?? [];
  const { messages, running, livePlan, liveStatus, send, stop, reset } = useAgent(initial);
  const [input, setInput] = useState("");
  const [maxSteps, setMaxSteps] = useState(8);
  const [workspace, setWorkspace] = useState(() => localStorage.getItem("grok_workspace") || "");
  const [forceCode, setForceCode] = useState(() => localStorage.getItem("grok_force_code") === "true");
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const voice = useVoice();

  // Auto scroll down smoothly
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, livePlan, running, voice.transcriptInterim]);

  // Persist conversations
  useEffect(() => {
    if (!messages.length) return;
    setHistory((prev) => {
      const id = activeId ?? crypto.randomUUID();
      if (!activeId) setActiveId(id);
      const next: Conversation = {
        id,
        title: titleFromMessages(messages),
        updatedAt: Date.now(),
        messages,
      };
      const rest = prev.filter((c) => c.id !== id);
      const all = [next, ...rest];
      saveHistory(all);
      return all;
    });
  }, [messages, activeId]);

  const turns = useMemo(() => groupTurns(messages), [messages]);

  const onNew = () => {
    setActiveId(null);
    reset([]);
    setInput("");
    setAttachments([]);
    voice.stopSpeaking();
  };

  const onOpen = (id: string) => {
    const c = history.find((x) => x.id === id);
    setActiveId(id);
    reset(c?.messages ?? []);
    setAttachments([]);
    voice.stopSpeaking();
  };

  const onDelete = (id: string) => {
    const next = history.filter((c) => c.id !== id);
    saveHistory(next);
    setHistory(next);
    if (activeId === id) {
      const first = next[0];
      setActiveId(first?.id ?? null);
      reset(first?.messages ?? []);
    }
  };

  const onClear = () => {
    saveHistory([]);
    setHistory([]);
    setActiveId(null);
    reset([]);
    setAttachments([]);
    voice.stopSpeaking();
  };

  // Upload handler for files & pasted images
  const handleProcessFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const uploadedList: UploadedAttachment[] = [];
    for (const file of Array.from(files)) {
      try {
        const item = await uploadFile(file);
        uploadedList.push(item);
      } catch (err) {
        console.error("Upload error:", err);
      }
    }
    if (uploadedList.length > 0) {
      setAttachments((prev) => [...prev, ...uploadedList]);
    }
    setUploading(false);
  };

  // Clipboard paste handler (pasted images & text files)
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const filesToUpload: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item && item.kind === "file") {
        const file = item.getAsFile();
        if (file) filesToUpload.push(file);
      }
    }
    if (filesToUpload.length > 0) {
      e.preventDefault();
      void handleProcessFiles(filesToUpload);
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleProcessFiles(e.dataTransfer.files);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleShareEntireChat = async () => {
    const exportText = messages
      .filter((m) => m.role !== "tool")
      .map((m) => `### ${m.role === "user" ? "User" : "Assistant"}\n\n${m.text}`)
      .join("\n\n---\n\n");
    if (!exportText) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Grok AI Conversation",
          text: exportText,
        });
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2500);
        return;
      } catch {
        /* fallback */
      }
    }
    navigator.clipboard.writeText(exportText);
    setShareToast(true);
    setTimeout(() => setShareToast(false), 2500);
  };

  const handleDownloadEntireChat = () => {
    if (!messages.length) return;
    const title = titleFromMessages(messages) || "chat";
    const exportText = messages
      .filter((m) => m.role !== "tool")
      .map((m) => `### ${m.role === "user" ? "User" : "Assistant"}\n\n${m.text}`)
      .join("\n\n---\n\n");
    const blob = new Blob([`# ${title}\n\n${exportText}`], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.slice(0, 32).replace(/[^a-z0-9_-]/gi, "_")}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const runText = async (text: string) => {
    const t = text.trim();
    if ((!t && attachments.length === 0) || running) return;

    // Compose prompt text including references to uploaded files/images if any
    let composedText = t;
    if (attachments.length > 0) {
      const attDescriptions = attachments
        .map((a) => {
          if (a.preview) {
            return `[Uploaded File: ${a.filename} (${a.url})]\n\`\`\`\n${a.preview}\n\`\`\``;
          }
          return `[Attached ${a.isImage ? "Image" : "File"}: ${a.filename} at ${a.url}]`;
        })
        .join("\n\n");
      composedText = t ? `${t}\n\n${attDescriptions}` : attDescriptions;
    }

    // Detect language from text inputs to automatically switch voice and language persona
    if (t) {
      voice.updateLanguageFromText(t);
    }

    const currentAttachments = [...attachments];
    setInput("");
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    const looksCode =
      forceCode ||
      /\b(pytest|refactor|apply_patch|fastapi|add a (?:route|endpoint|test)|fix (?:the )?(?:test|bug|build)|failing tests|create (?:a |the )?(?:vite|react|app|website|project|file)|build (?:a |the )?(?:vite|react|app|website)|generate (?:the )?(?:files|vite|react)|scaffold|yarn\s+(?:lint|install|add|ci|run)|npm\s+(?:run\s+\w+|install|ci|i\b|add)|pnpm\s+(?:lint|install|i\b|add|run)|(?:can you |please )?(?:run|execute)\s+(?:yarn|npm|pnpm|pytest|npx))\b/i.test(
        composedText,
      );
    const steps = looksCode ? Math.max(maxSteps, 16) : maxSteps;
    const answer = await send(composedText, steps, {
      workspace: workspace.trim() || undefined,
      mode: looksCode ? "code" : undefined,
      attachments: currentAttachments,
    });
    if (voice.voiceMode && answer) {
      voice.speak(splitCitations(answer).body || answer);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runText(input);
  };

  const onDictate = () => {
    if (voice.listening) {
      voice.stopListen();
      return;
    }
    voice.start((finalTranscript) => {
      // Voice input auto language detection
      if (finalTranscript) {
        voice.updateLanguageFromText(finalTranscript);
      }
      if (voice.voiceMode) {
        void runText(finalTranscript);
      } else {
        setInput((prev) => (prev ? `${prev} ${finalTranscript}` : finalTranscript));
        textareaRef.current?.focus();
      }
    });
  };

  const handleSpeakMessage = (msgId: string, text: string) => {
    if (speakingMsgId === msgId && voice.speaking) {
      voice.stopSpeaking();
      setSpeakingMsgId(null);
    } else {
      setSpeakingMsgId(msgId);
      voice.speak(text);
    }
  };

  const quickPrompts = [
    { label: "Say hi (chat)", prompt: "Hi — what can you do without an API key?" },
    { label: "Remember (memory)", prompt: "Remember that this project uses one local brain and a crew board." },
    { label: "Local math", prompt: "What is 24 * 7 + 3?" },
    { label: "How-to", prompt: "How do I write a Hello World in Java?" },
    { label: "Code (workspace)", prompt: "add a /health route and a pytest for it" },
  ];

  return (
    <div className="flex h-full overflow-hidden bg-[rgb(var(--bg))]">
      <HistoryRail
        items={history}
        activeId={activeId}
        onNew={onNew}
        onOpen={onOpen}
        onDelete={onDelete}
        onClear={onClear}
        workspace={workspace}
        onWorkspaceChange={(path) => {
          setWorkspace(path);
          localStorage.setItem("grok_workspace", path);
        }}
        forceCode={forceCode}
        onForceCodeChange={(force) => {
          setForceCode(force);
          localStorage.setItem("grok_force_code", String(force));
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header */}
        <header className="flex h-14 items-center justify-between border-b border-[rgb(var(--line))] bg-[rgb(var(--card))]/80 px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-tr from-[rgb(var(--accent))] to-[rgb(var(--user))] text-[rgb(var(--accent-fg))] shadow-sm">
              <SparklesIcon className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xs font-bold tracking-tight text-[rgb(var(--fg))]">
                  Interactive Intelligence
                </h1>
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Engine
                </span>
                {workspace && (
                  <span
                    className="hidden lg:flex items-center gap-1.5 rounded-full border border-[rgb(var(--line))] bg-[rgb(var(--card-elevated))]/60 px-2.5 py-0.5 text-[10px] text-[rgb(var(--muted))]"
                    title={`Workplace: ${workspace}`}
                  >
                    <span>📁</span>
                    <span className="font-mono max-w-[12rem] truncate">
                      {workspace.replace(/\\/g, "/").split("/").filter(Boolean).pop() || workspace}
                    </span>
                    {forceCode && (
                      <span className="rounded bg-[rgb(var(--accent))]/20 px-1 py-0.2 text-[9px] font-semibold text-[rgb(var(--accent))]">
                        code
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--card-elevated))]/70 px-2.5 py-1 text-xs">
              <span className="text-[11px] font-medium text-[rgb(var(--muted))]">Steps:</span>
              <span className="font-semibold tabular-nums text-[rgb(var(--accent))]">{maxSteps}</span>
              <input
                id="max-steps"
                type="range"
                min={1}
                max={24}
                value={maxSteps}
                onChange={(e) => setMaxSteps(Number(e.target.value))}
                className="h-1.5 w-16 accent-[rgb(var(--accent))] cursor-pointer opacity-80 hover:opacity-100"
              />
            </div>

            {/* Voice Mode Toggle Pill */}
            <button
              type="button"
              onClick={voice.toggleVoiceMode}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                voice.voiceMode
                  ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/15 text-[rgb(var(--accent))] shadow-xs"
                  : "border-[rgb(var(--line))] bg-[rgb(var(--card-elevated))]/60 text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]"
              }`}
            >
              <AudioWaveIcon className="h-3.5 w-3.5" />
              <span>Voice Mode</span>
              <span
                className={`h-2 w-2 rounded-full ${
                  voice.voiceMode ? "bg-[rgb(var(--accent))] animate-pulse" : "bg-[rgb(var(--line))]"
                }`}
              />
            </button>

            {/* Global Share & Export chat buttons */}
            {messages.length > 0 && (
              <div className="flex items-center gap-1 border-l border-[rgb(var(--line))] pl-2">
                <button
                  type="button"
                  onClick={handleShareEntireChat}
                  title="Share entire conversation"
                  className="flex items-center gap-1 rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--card-elevated))]/60 px-2.5 py-1.5 text-xs font-medium text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] hover:bg-[rgb(var(--card-elevated))] transition-colors"
                >
                  <ShareIcon className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Share</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadEntireChat}
                  title="Export conversation to Markdown (.md)"
                  className="flex items-center gap-1 rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--card-elevated))]/60 px-2.5 py-1.5 text-xs font-medium text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))] hover:bg-[rgb(var(--card-elevated))] transition-colors"
                >
                  <DownloadIcon className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Export</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Share toast popup */}
        {shareToast && (
          <div className="fixed top-16 right-8 z-50 flex items-center gap-2 rounded-2xl border border-[rgb(var(--accent))]/50 bg-[rgb(var(--card))] px-4 py-2.5 text-xs font-semibold text-[rgb(var(--fg))] shadow-xl backdrop-blur-md animate-fade-in">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[rgb(var(--accent))] text-[rgb(var(--accent-fg))]">
              ✓
            </span>
            <span>Conversation copied to clipboard!</span>
          </div>
        )}

        {/* Messages Feed Area */}
        <div ref={scroller} className="flex-1 space-y-6 overflow-y-auto px-4 sm:px-8 py-6">
          {messages.length === 0 && !running && (
            <div className="mx-auto max-w-2xl pt-14 pb-8 text-center animate-fade-in">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-tr from-[rgb(var(--card-elevated))] to-[rgb(var(--card))] text-[rgb(var(--accent))] shadow-lg ring-1 ring-[rgb(var(--line))]">
                <SparklesIcon className="h-8 w-8" />
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight text-[rgb(var(--fg))]">
                Welcome to Grok Agent
              </h2>
              <p className="mx-auto mt-2.5 max-w-lg text-sm leading-relaxed text-[rgb(var(--muted))]">
                Local-first autonomous agent: thinking, iterative tool calls, code execution, and web research with real-time streaming feedback.
              </p>

              {/* Quick suggestions */}
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                {quickPrompts.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => void runText(item.prompt)}
                    className="flex flex-col rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--card))]/70 p-4 text-xs backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgb(var(--accent))]/60 hover:bg-[rgb(var(--card-elevated))] hover:shadow-md group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[rgb(var(--fg))] group-hover:text-[rgb(var(--accent))] transition-colors">
                        {item.label}
                      </span>
                      <span className="text-[rgb(var(--muted))] opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-xs">
                        →
                      </span>
                    </div>
                    <span className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-[rgb(var(--muted))]">
                      {item.prompt}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn) => {
            const visible = turn.filter((m) => m.role !== "tool");
            const tools = turn.filter((m) => m.role === "tool");
            const weatherTools = tools.filter((t) => parseWeather(t.observation || ""));
            const hits: SearchHit[] = [];
            const seen = new Set<string>();
            for (const t of tools) {
              for (const h of parseSearchHits(t.observation || "")) {
                const k = h.url || h.title;
                if (k && !seen.has(k)) {
                  seen.add(k);
                  hits.push(h);
                }
              }
            }
            for (const m of visible) {
              if (m.role !== "assistant") continue;
              for (const url of splitCitations(m.text).urls) {
                if (!seen.has(url)) {
                  seen.add(url);
                  let host = url;
                  try {
                    host = new URL(url).hostname.replace(/^www\./, "");
                  } catch {
                    /* keep url */
                  }
                  hits.push({ title: host, url, snippet: "" });
                }
              }
            }
            const plan = turn.find((m) => m.plan)?.plan;
            const last = turn[turn.length - 1];
            const isLive = running && last?.turnId === turn[0]?.turnId;
            const users = visible.filter((m) => m.role === "user");
            const assistants = visible.filter((m) => m.role === "assistant");

            return (
              <div key={turn[0]?.id} className="space-y-3 max-w-4xl mx-auto">
                {users.map((m) => (
                  <Message
                    key={m.id}
                    msg={m}
                    onSpeak={(txt) => handleSpeakMessage(m.id, txt)}
                    isSpeaking={speakingMsgId === m.id && voice.speaking}
                  />
                ))}
                {assistants.map((m) => (
                  <Message
                    key={m.id}
                    msg={m}
                    onSpeak={(txt) => handleSpeakMessage(m.id, txt)}
                    isSpeaking={speakingMsgId === m.id && voice.speaking}
                  />
                ))}
                {weatherTools.map((t) => (
                  <ToolCallCard key={t.id} msg={t} live={isLive && !t.observation} />
                ))}
                <div className="grid gap-2 sm:grid-cols-2 max-w-3xl">
                  <SearchHits hits={hits} compact />
                  <ThoughtProcess
                    plan={isLive ? livePlan || plan : plan}
                    tools={tools.filter((t) => !parseSearchHits(t.observation || "").length)}
                    live={isLive}
                  />
                </div>
              </div>
            );
          })}

          {/* Dictation Interim Display */}
          {voice.listening && (
            <div className="max-w-4xl mx-auto flex items-center gap-3 rounded-2xl border border-[rgb(var(--accent))]/40 bg-[rgb(var(--accent))]/10 p-3.5 backdrop-blur-sm animate-fade-in">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--accent))] text-[rgb(var(--accent-fg))] shadow-sm pulse-listening">
                <MicIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[rgb(var(--accent))]">Listening to voice...</span>
                  <div className="flex items-center gap-0.5">
                    <span className="w-1 bg-[rgb(var(--accent))] rounded-full sound-bar-1" />
                    <span className="w-1 bg-[rgb(var(--accent))] rounded-full sound-bar-2" />
                    <span className="w-1 bg-[rgb(var(--accent))] rounded-full sound-bar-3" />
                    <span className="w-1 bg-[rgb(var(--accent))] rounded-full sound-bar-4" />
                  </div>
                </div>
                <p className="mt-0.5 text-xs text-[rgb(var(--fg))] italic">
                  {voice.transcriptInterim ? `"${voice.transcriptInterim}"` : "Speak clearly into your microphone..."}
                </p>
              </div>
              <button
                type="button"
                onClick={voice.stopListen}
                className="rounded-lg border border-[rgb(var(--line))] bg-[rgb(var(--card))] px-2.5 py-1 text-xs font-medium hover:bg-[rgb(var(--card-elevated))]"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Assistant Speaking Status Indicator */}
          {voice.speaking && (
            <div className="max-w-4xl mx-auto flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-600 dark:text-emerald-400">
              <div className="flex items-center gap-2">
                <VolumeUpIcon className="h-4 w-4 animate-bounce" />
                <span className="font-semibold">Playing voice response</span>
                {voice.readPunctuation && (
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                    reading punctuation
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={voice.stopSpeaking}
                className="flex items-center gap-1 rounded-md px-2 py-0.5 font-medium hover:bg-emerald-500/20"
              >
                <VolumeOffIcon className="h-3.5 w-3.5" />
                <span>Stop playback</span>
              </button>
            </div>
          )}
        </div>

        {/* Input Bar & Controls */}
        <div className="border-t border-[rgb(var(--line))] bg-[rgb(var(--card))]/90 p-4 backdrop-blur-xl">
          {running && (
            <div className="mx-auto mb-2.5 flex max-w-3xl items-center gap-2 px-1 text-xs text-[rgb(var(--muted))]">
              <span className="inline-block h-2 w-2 animate-ping rounded-full bg-[rgb(var(--accent))]" />
              <span className="font-semibold text-[rgb(var(--fg))]">
                {liveStatus && liveStatus.includes("…")
                  ? liveStatus
                  : liveStatus
                  ? toolLabel(liveStatus, true)
                  : "Synthesizing response…"}
              </span>
            </div>
          )}

          <form onSubmit={onSubmit} className="mx-auto max-w-3xl">
            {/* Attachment Preview Chips */}
            {attachments.length > 0 && (
              <div className="mb-2.5 flex flex-wrap gap-2 px-1">
                {attachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 rounded-2xl border border-[rgb(var(--line))] bg-[rgb(var(--card-elevated))] p-1.5 pr-2.5 shadow-sm transition-all hover:border-[rgb(var(--accent))]/50"
                  >
                    {att.isImage ? (
                      <img
                        src={att.url}
                        alt={att.filename}
                        className="h-9 w-9 rounded-xl object-cover border border-[rgb(var(--line))]"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgb(var(--card))] text-[rgb(var(--accent))] border border-[rgb(var(--line))]">
                        <FileTextIcon className="h-4 w-4" />
                      </div>
                    )}
                    <div className="min-w-0 max-w-[150px]">
                      <p className="truncate text-xs font-medium text-[rgb(var(--fg))]">
                        {att.filename}
                      </p>
                      <p className="text-[10px] text-[rgb(var(--muted))]">
                        {(att.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(idx)}
                      title="Remove attachment"
                      className="ml-1 rounded-full p-1 text-[rgb(var(--muted))] hover:bg-[rgb(var(--line))] hover:text-rose-500 transition-colors"
                    >
                      <CloseIcon className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Uploading Status Badge */}
            {uploading && (
              <div className="mb-2 flex items-center gap-2 text-xs text-[rgb(var(--accent))]">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <span>Uploading and processing attachment…</span>
              </div>
            )}

            {/* Hidden native file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => {
                if (e.target.files) void handleProcessFiles(e.target.files);
                e.target.value = "";
              }}
              className="hidden"
            />

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex items-end gap-1.5 rounded-3xl border bg-[rgb(var(--bg))] p-2 shadow-lg transition-all focus-within:border-[rgb(var(--accent))]/70 focus-within:ring-2 focus-within:ring-[rgb(var(--accent))]/20 ${
                isDragOver
                  ? "border-dashed border-[rgb(var(--accent))] ring-4 ring-[rgb(var(--accent))]/15 bg-[rgb(var(--card-elevated))]"
                  : "border-[rgb(var(--line))]"
              }`}
            >
              {/* File / Image Upload Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Upload file or image (or paste image / drag & drop)"
                aria-label="Upload file"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[rgb(var(--muted))] hover:bg-[rgb(var(--card-elevated))] hover:text-[rgb(var(--fg))] transition-all active:scale-95"
              >
                <PaperclipIcon className="h-4 w-4" />
              </button>

              {/* Dictation Mic Button */}
              <button
                type="button"
                onClick={onDictate}
                disabled={!voice.supported}
                title={
                  !voice.supported
                    ? "Dictation not supported in this browser"
                    : voice.listening
                    ? "Stop listening"
                    : "Start voice dictation"
                }
                aria-label="Voice dictation"
                className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-all ${
                  voice.listening
                    ? "bg-rose-500 text-white shadow-md pulse-listening"
                    : "text-[rgb(var(--muted))] hover:bg-[rgb(var(--card-elevated))] hover:text-[rgb(var(--fg))]"
                }`}
              >
                <MicIcon className="h-4 w-4" />
                {voice.listening && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
                  </span>
                )}
              </button>

              {/* Text Area with Paste support */}
              <textarea
                ref={textareaRef}
                id="research-goal"
                name="message"
                rows={1}
                value={input}
                onPaste={handlePaste}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void runText(input);
                  }
                }}
                placeholder={
                  isDragOver
                    ? "Drop files or images here…"
                    : voice.listening
                    ? "Listening... Speak now"
                    : voice.voiceMode
                    ? "Voice mode active — speak or type a prompt…"
                    : "Ask anything, search, paste images (Ctrl+V) or attach files…"
                }
                className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent py-2.5 px-2 text-sm outline-none placeholder:text-[rgb(var(--muted))] selection:bg-[rgb(var(--accent))]/30"
              />

              {/* Send or Stop Action Button */}
              {running ? (
                <button
                  type="button"
                  onClick={stop}
                  aria-label="Stop generation"
                  title="Stop generating"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-all active:scale-95"
                >
                  <StopIcon className="h-4 w-4 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() && attachments.length === 0}
                  aria-label="Send message"
                  title="Send message"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--accent))] text-[rgb(var(--accent-fg))] shadow-sm transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
                >
                  <SendIcon className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Voice & Sound Control Footbar */}
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-2 text-[11px] text-[rgb(var(--muted))]">
              <div className="flex flex-wrap items-center gap-3">
                {/* Voice Selection */}
                <div className="flex items-center gap-1.5">
                  <span>Voice:</span>
                  <select
                    id="voice-select"
                    value={voice.voiceUri}
                    onChange={(e) => {
                      const nextUri = e.target.value;
                      voice.setVoiceUri(nextUri);
                      // Pass uri so Auto Lang does not override the voice the user just picked
                      // with a detection pass over this English preview sentence.
                      voice.speak(
                        "Hello! I speak naturally with conversational pacing, and I can read all punctuation if you like.",
                        nextUri,
                      );
                    }}
                    className="max-w-[13rem] truncate rounded-lg border border-[rgb(var(--line))] bg-[rgb(var(--card-elevated))] px-2 py-1 text-[11px] text-[rgb(var(--fg))] outline-none focus:border-[rgb(var(--accent))]"
                  >
                    {voice.voices.length === 0 && (
                      <option value="">Loading voices…</option>
                    )}
                    {voice.voices.map((v) => (
                      <option key={v.uri} value={v.uri}>
                        {v.isNeural || v.provider === "Neural Studio"
                          ? v.label
                          : `${v.label}${v.provider ? ` · ${v.provider}` : ""}`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Speed Selection */}
                <div className="flex items-center gap-1">
                  <span>Speed:</span>
                  <select
                    value={voice.speed}
                    onChange={(e) => voice.setSpeed(Number(e.target.value))}
                    className="rounded-lg border border-[rgb(var(--line))] bg-[rgb(var(--card-elevated))] px-1.5 py-1 text-[11px] text-[rgb(var(--fg))] outline-none"
                  >
                    <option value={0.85}>Calm (0.85x)</option>
                    <option value={0.95}>Natural (0.95x)</option>
                    <option value={1.05}>Brisk (1.05x)</option>
                    <option value={1.2}>Fast (1.2x)</option>
                    <option value={1.4}>Very fast (1.4x)</option>
                  </select>
                </div>

                {/* Read Punctuations Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !voice.readPunctuation;
                    voice.setReadPunctuation(next);
                    voice.speak(
                      next
                        ? "Punctuation reading enabled: comma, period, question mark, and exclamation mark will be spoken aloud."
                        : "Punctuation reading turned off. Natural speech flow restored.",
                      voice.voiceUri,
                      next,
                    );
                  }}
                  title="Toggle vocalizing punctuations like commas, question marks, periods, and brackets"
                  className={`flex items-center gap-1 rounded-lg border px-2 py-1 transition-all ${
                    voice.readPunctuation
                      ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/15 text-[rgb(var(--accent))] font-semibold"
                      : "border-[rgb(var(--line))] bg-[rgb(var(--card-elevated))] text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]"
                  }`}
                >
                  <span className="font-mono text-xs leading-none">“.”</span>
                  <span>Read Punctuations: {voice.readPunctuation ? "ON" : "OFF"}</span>
                </button>

                {/* Auto-Recognize Language Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !voice.autoLanguage;
                    voice.setAutoLanguage(next);
                    voice.speak(
                      next
                        ? "Auto language detection enabled. I will automatically recognize your spoken or typed language and reply in it."
                        : "Auto language detection turned off.",
                      voice.voiceUri,
                    );
                  }}
                  title="Automatically detect language from your text or voice input and switch response & voice language"
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 transition-all ${
                    voice.autoLanguage
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 font-semibold"
                      : "border-[rgb(var(--line))] bg-[rgb(var(--card-elevated))] text-[rgb(var(--muted))] hover:text-[rgb(var(--fg))]"
                  }`}
                >
                  <span className="text-xs">🌐</span>
                  <span>Auto Lang: {voice.autoLanguage ? "ON" : "OFF"}</span>
                  {voice.autoLanguage && (
                    <span className="rounded bg-emerald-500/20 px-1 py-0.2 text-[9px] font-bold text-emerald-300 uppercase">
                      {voice.currentLanguage.code} ({voice.currentLanguage.nativeName})
                    </span>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="hidden sm:inline text-[10px]">Press Enter ↵ to send · Shift+Enter for new line</span>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
