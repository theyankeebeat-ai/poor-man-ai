import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Bot,
  User,
  Sparkles,
  Paperclip,
  ChevronDown,
  Trash2,
  Cpu,
  StopCircle,
  Wrench
} from 'lucide-react';
import { streamChat, uploadFile } from './api';
import { useTheme } from './ThemeContext';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  thoughtProcess?: string;
  toolCalls?: { name: string; args?: any; result?: string }[];
  plan?: string;
  tokens?: number;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-1',
    sender: 'system',
    content: 'Poor Man AI Agent Initialized. Live Python backend connected at http://127.0.0.1:8000. Autonomous tool execution enabled.',
    timestamp: 'Ready'
  }
];

export const AIChatInterface: React.FC = () => {
  const { colors } = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [mode, setMode] = useState<'agent' | 'code'>('agent');
  const [showThoughts, setShowThoughts] = useState<Record<string, boolean>>({});
  const [statusText, setStatusText] = useState<string>('');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, statusText]);

  // Check if there was a website reader prompt passed via sessionStorage
  useEffect(() => {
    const pendingPrompt = sessionStorage.getItem('pending_chat_prompt');
    if (pendingPrompt) {
      sessionStorage.removeItem('pending_chat_prompt');
      setInput(pendingPrompt);
    }
  }, []);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setStatusText('');
  };

  const handleSend = async () => {
    if (!input.trim() || isGenerating) return;

    const userText = input.trim();
    const userMsgId = `usr-${Date.now()}`;
    const assistantMsgId = `ast-${Date.now() + 1}`;

    const newMessages: ChatMessage[] = [
      ...messages,
      {
        id: userMsgId,
        sender: 'user',
        content: userText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      },
      {
        id: assistantMsgId,
        sender: 'assistant',
        content: '',
        timestamp: 'Streaming...'
      }
    ];

    setMessages(newMessages);
    setInput('');
    setIsGenerating(true);
    setStatusText('Initiating reasoning sequence...');

    const historyPayload = messages
      .filter((m) => m.sender !== 'system')
      .map((m) => ({
        role: m.sender,
        text: m.content
      }));

    abortControllerRef.current = new AbortController();

    try {
      await streamChat(
        userText,
        10,
        abortControllerRef.current.signal,
        (ev) => {
          if (ev.type === 'plan') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      plan: ev.text,
                      thoughtProcess: (m.thoughtProcess || '') + `\n[Plan]: ${ev.text}`
                    }
                  : m
              )
            );
          } else if (ev.type === 'tool') {
            setStatusText(`Executing tool: ${ev.name}...`);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      toolCalls: [
                        ...(m.toolCalls || []),
                        { name: ev.name, args: ev.args }
                      ]
                    }
                  : m
              )
            );
          } else if (ev.type === 'observation') {
            setStatusText(`Received observation from ${ev.name}`);
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantMsgId) return m;
                const calls = [...(m.toolCalls || [])];
                if (calls.length > 0) {
                  calls[calls.length - 1].result = ev.text;
                }
                return {
                  ...m,
                  toolCalls: calls,
                  thoughtProcess:
                    (m.thoughtProcess || '') + `\n[Obs ${ev.name}]: ${ev.text.slice(0, 150)}...`
                };
              })
            );
          } else if (ev.type === 'token') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: m.content + ev.text
                    }
                  : m
              )
            );
          } else if (ev.type === 'done') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: m.content || ev.text
                    }
                  : m
              )
            );
            setIsGenerating(false);
            setStatusText('');
          } else if (ev.type === 'error') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: m.content + `\n\n[Error: ${ev.text}]`
                    }
                  : m
              )
            );
          }
        },
        historyPayload,
        { mode: mode }
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content:
                    m.content ||
                    `Connection error: Unable to reach backend at http://127.0.0.1:8000. Make sure the server is running (yarn dev). Error: ${err.message}`
                }
              : m
          )
        );
      }
    } finally {
      setIsGenerating(false);
      setStatusText('');
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setStatusText(`Uploading ${file.name}...`);
      const res = await uploadFile(file);
      setInput((prev) => `${prev} [Attached file: ${res.filename} (${res.url})]`);
      setStatusText('');
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
      setStatusText('');
    }
  };

  const toggleThoughts = (id: string) => {
    setShowThoughts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const clearChat = () => {
    setMessages([INITIAL_MESSAGES[0]]);
  };

  return (
    <div className={`flex flex-col h-full w-full ${colors.bgMain} ${colors.textPrimary} font-sans overflow-hidden`}>
      {/* --- Top Sub-Bar --- */}
      <div className={`flex items-center justify-between px-6 py-3 border-b ${colors.border} ${colors.bgPanel} backdrop-blur-md text-xs`}>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-2.5 py-1 rounded-lg ${colors.badgeBg} border ${colors.border}`}>
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-semibold">Mode:</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
              className="bg-transparent border-none text-cyan-400 focus:outline-none cursor-pointer text-xs pr-1 font-medium"
            >
              <option value="agent" className="bg-zinc-900 text-zinc-100">Autonomous Agent (Research/Crew)</option>
              <option value="code" className="bg-zinc-900 text-zinc-100">Code Agent (Workspace Tools)</option>
            </select>
          </div>

          <span className={`hidden sm:inline-flex items-center gap-1.5 ${colors.textMuted}`}>
            <span className={`w-2 h-2 rounded-full ${isGenerating ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`}></span>
            {isGenerating ? statusText || 'Agent Reasoning...' : 'Live Backend Ready (127.0.0.1:8000)'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isGenerating && (
            <button
              onClick={handleStop}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-rose-400 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 transition-all text-xs"
            >
              <StopCircle className="w-3.5 h-3.5" />
              <span>Halt Agent</span>
            </button>
          )}
          <button
            onClick={clearChat}
            title="Clear Chat History"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg ${colors.textMuted} hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all text-xs`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        </div>
      </div>

      {/* --- Message Feed --- */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar">
        {messages.map((msg) => {
          if (msg.sender === 'system') {
            return (
              <div key={msg.id} className="flex justify-center my-2">
                <span className={`text-[11px] font-mono px-3 py-1 rounded-full ${colors.badgeBg} ${colors.border} border text-center text-cyan-400`}>
                  {msg.content}
                </span>
              </div>
            );
          }

          const isAssistant = msg.sender === 'assistant';

          return (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-4xl ${isAssistant ? 'mr-auto' : 'ml-auto flex-row-reverse'}`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-md ${
                  isAssistant
                    ? 'bg-gradient-to-tr from-cyan-600 to-indigo-600 text-white ring-1 ring-cyan-400/30'
                    : `${colors.badgeBg} border ${colors.border}`
                }`}
              >
                {isAssistant ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
              </div>

              {/* Message Container */}
              <div
                className={`flex flex-col space-y-2 max-w-[88%] md:max-w-[82%] ${
                  isAssistant ? 'items-start' : 'items-end'
                }`}
              >
                <div className={`flex items-center gap-2 text-[11px] ${colors.textMuted} px-1`}>
                  <span className="font-medium">
                    {isAssistant ? (mode === 'code' ? 'Code Agent' : 'Poor Man AI') : 'You'}
                  </span>
                  <span>&bull;</span>
                  <span>{msg.timestamp}</span>
                </div>

                {/* Cognitive Reasoning Accordion */}
                {isAssistant && (msg.thoughtProcess || (msg.toolCalls && msg.toolCalls.length > 0)) && (
                  <div className={`w-full rounded-lg ${colors.bgCard} border ${colors.border} text-xs overflow-hidden`}>
                    <button
                      onClick={() => toggleThoughts(msg.id)}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-[11px] ${colors.textMuted} hover:${colors.textPrimary} ${colors.badgeBg}`}
                    >
                      <span className="flex items-center gap-1.5 text-cyan-400 font-medium">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                        Execution Trace &amp; Reasoning Log
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded ${colors.accentMuted}`}>
                            {msg.toolCalls.length} tool {msg.toolCalls.length === 1 ? 'call' : 'calls'}
                          </span>
                        )}
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${
                          showThoughts[msg.id] ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    {showThoughts[msg.id] && (
                      <div className={`p-3 font-mono text-[11px] ${colors.badgeBg} border-t ${colors.border} space-y-2 max-h-60 overflow-y-auto`}>
                        {msg.plan && (
                          <div className={`p-2 rounded ${colors.accentMuted}`}>
                            <strong>[Plan]:</strong> {msg.plan}
                          </div>
                        )}
                        {msg.toolCalls?.map((t, idx) => (
                          <div key={idx} className={`p-2 rounded ${colors.bgCard} border ${colors.border}`}>
                            <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                              <Wrench className="w-3 h-3 text-amber-400" />
                              <span>{t.name}</span>
                            </div>
                            {t.args && (
                              <pre className={`text-[10px] ${colors.textMuted} mt-1 overflow-x-auto`}>
                                {JSON.stringify(t.args, null, 2)}
                              </pre>
                            )}
                            {t.result && (
                              <div className="mt-1 text-emerald-400 text-[10px] line-clamp-3">
                                {t.result}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Message Bubble */}
                <div
                  className={`rounded-2xl p-4 text-sm leading-relaxed ${
                    isAssistant
                      ? `${colors.bgCard} border ${colors.border} shadow-sm`
                      : `${colors.accent} rounded-tr-sm shadow-md`
                  }`}
                >
                  {msg.content ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <span className={`${colors.textMuted} italic`}>Thinking and synthesizing answer...</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {isGenerating && (
          <div className="flex gap-3 max-w-2xl mr-auto">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-white animate-pulse" />
            </div>
            <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl ${colors.bgCard} border ${colors.border} text-xs ${colors.textMuted}`}>
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
              <span>{statusText || 'Streaming agent response...'}</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* --- Chat Input Box --- */}
      <div className={`p-4 border-t ${colors.border} ${colors.bgPanel} backdrop-blur-md`}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
        />
        <div className={`max-w-4xl mx-auto relative rounded-2xl border ${colors.border} ${colors.bgCard} focus-within:ring-1 focus-within:ring-cyan-500/30 transition-all shadow-lg`}>
          <textarea
            ref={textareaRef}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === 'code'
                ? "Enter coding prompt, e.g. 'Build a counter in React' or 'Check test coverage'..."
                : "Ask anything, research a topic, or instruct the agent... (Shift+Enter for newline)"
            }
            className={`w-full bg-transparent px-4 pt-3 pb-12 text-sm ${colors.textPrimary} placeholder:${colors.textMuted} focus:outline-none resize-none`}
          />

          <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between">
            <div className={`flex items-center gap-1.5 ${colors.textMuted} text-xs`}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`p-1.5 rounded-lg hover:${colors.badgeBg} hover:${colors.textPrimary} transition-colors`}
                title="Attach file to analyze"
              >
                <Paperclip className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className={`text-[11px] ${colors.textMuted} hidden sm:inline`}>Enter to send</span>
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || isGenerating}
                className={`flex items-center justify-center p-2 rounded-xl ${colors.accent} ${colors.accentHover} disabled:opacity-40 font-medium transition-all shadow-md`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIChatInterface;
