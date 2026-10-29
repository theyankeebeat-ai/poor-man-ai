import { useState } from "react";
import type { ChatMessage } from "../types";
import { splitCitations } from "../lib/formatResults";
import { RichText } from "./RichText";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  FileTextIcon,
  ShareIcon,
  VolumeUpIcon,
} from "./icons";

export function Message({
  msg,
  onSpeak,
  isSpeaking,
}: {
  msg: ChatMessage;
  onSpeak?: (text: string) => void;
  isSpeaking?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  if (msg.role === "tool") return null;
  const mine = msg.role === "user";
  if (!mine && !msg.text) return null;

  const { body } = splitCitations(msg.text);
  const rawText = body || msg.text;

  const copyToClipboard = () => {
    if (!rawText) return;
    navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!rawText) return;
    const title = mine ? "User Prompt" : "Assistant Response";
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: rawText,
        });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
        return;
      } catch {
        /* fallback */
      }
    }
    navigator.clipboard.writeText(`### ${title}\n\n${rawText}`);
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  };

  const handleDownload = () => {
    if (!rawText) return;
    const filename = `${mine ? "prompt" : "response"}-${Date.now().toString().slice(-6)}.md`;
    const blob = new Blob([rawText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (mine) {
    return (
      <div className="flex flex-col items-end group">
        <div className="relative max-w-[85%] sm:max-w-[75%] rounded-3xl rounded-tr-md bg-gradient-to-br from-[rgb(var(--user))] to-[rgb(var(--accent))] px-5 py-3.5 text-sm text-[rgb(var(--accent-fg))] shadow-md shadow-[rgb(var(--user))/0.15]">
          {/* Attachments if any */}
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="mb-2.5 flex flex-wrap gap-2">
              {msg.attachments.map((att, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-xl bg-black/20 px-2.5 py-1.5 backdrop-blur-sm"
                >
                  {att.isImage ? (
                    <img
                      src={att.url}
                      alt={att.filename}
                      className="h-12 w-12 rounded-lg object-cover border border-white/20"
                    />
                  ) : (
                    <FileTextIcon className="h-5 w-5 text-white/90" />
                  )}
                  <div className="text-left text-[11px] leading-tight text-white">
                    <p className="font-semibold max-w-[140px] truncate">{att.filename}</p>
                    <p className="text-[10px] text-white/70">{(att.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="whitespace-pre-wrap leading-relaxed selection:bg-white/30">{msg.text}</p>
        </div>

        {/* User message hover action toolbar */}
        <div className="mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity px-2 text-[11px] text-[rgb(var(--muted))]">
          <button
            type="button"
            onClick={copyToClipboard}
            title="Copy question"
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-[rgb(var(--card-elevated))] hover:text-[rgb(var(--fg))] transition-colors"
          >
            {copied ? (
              <>
                <CheckIcon className="h-3 w-3 text-emerald-500" />
                <span className="text-emerald-500 font-medium">Copied</span>
              </>
            ) : (
              <>
                <CopyIcon className="h-3 w-3" />
                <span>Copy</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleShare}
            title="Share question"
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-[rgb(var(--card-elevated))] hover:text-[rgb(var(--fg))] transition-colors"
          >
            {shared ? (
              <span className="text-emerald-500 font-medium">Shared</span>
            ) : (
              <>
                <ShareIcon className="h-3 w-3" />
                <span>Share</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            title="Download question"
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-[rgb(var(--card-elevated))] hover:text-[rgb(var(--fg))] transition-colors"
          >
            <DownloadIcon className="h-3 w-3" />
            <span>Export</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start group">
      <div className="relative w-full max-w-3xl rounded-3xl rounded-tl-md border border-[rgb(var(--line))] bg-[rgb(var(--card))] px-6 py-5 shadow-sm backdrop-blur-md transition-all hover:border-[rgb(var(--accent))]/40 hover:shadow-md">
        <div className="mb-3 flex items-center justify-between text-[11px] font-medium text-[rgb(var(--muted))] border-b border-[rgb(var(--line))]/40 pb-2.5">
          <div className="flex items-center gap-2 font-semibold text-[rgb(var(--fg))]">
            <span className="inline-block h-2 w-2 rounded-full bg-[rgb(var(--accent))] ring-4 ring-[rgb(var(--accent))]/20" />
            <span className="tracking-tight">Assistant</span>
          </div>

          {/* Action buttons: Read aloud, Copy, Share, Download */}
          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
            {onSpeak && (
              <button
                type="button"
                onClick={() => onSpeak(rawText)}
                title={isSpeaking ? "Stop playback" : "Read aloud"}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition-colors ${
                  isSpeaking
                    ? "bg-[rgb(var(--accent))]/15 text-[rgb(var(--accent))] font-medium"
                    : "text-[rgb(var(--muted))] hover:bg-[rgb(var(--card-elevated))] hover:text-[rgb(var(--fg))]"
                }`}
              >
                <VolumeUpIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{isSpeaking ? "Speaking" : "Listen"}</span>
              </button>
            )}

            <button
              type="button"
              onClick={copyToClipboard}
              title="Copy answer"
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[rgb(var(--muted))] transition-colors hover:bg-[rgb(var(--card-elevated))] hover:text-[rgb(var(--fg))]"
            >
              {copied ? (
                <>
                  <CheckIcon className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-emerald-500 font-medium">Copied</span>
                </>
              ) : (
                <>
                  <CopyIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Copy</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleShare}
              title="Share answer"
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[rgb(var(--muted))] transition-colors hover:bg-[rgb(var(--card-elevated))] hover:text-[rgb(var(--fg))]"
            >
              {shared ? (
                <>
                  <CheckIcon className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-emerald-500 font-medium">Shared</span>
                </>
              ) : (
                <>
                  <ShareIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Share</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownload}
              title="Download answer as Markdown (.md)"
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[rgb(var(--muted))] transition-colors hover:bg-[rgb(var(--card-elevated))] hover:text-[rgb(var(--fg))]"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>

        <div className="text-base leading-7 text-[rgb(var(--fg))]">
          <RichText text={body || msg.text} />
        </div>
      </div>
    </div>
  );
}
