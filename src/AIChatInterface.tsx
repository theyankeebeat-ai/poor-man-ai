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
  Wrench,
  Copy,
  Check,
  Plus,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Monitor,
  MonitorOff,
  Camera,
  Brain,
  Zap,
  Sliders,
  MessageSquare
} from 'lucide-react';
import { streamChat, uploadFile, synthesizeTTS } from './api';
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

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
  mode: 'agent' | 'code';
  thinkingLevel: 'low' | 'medium' | 'high';
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-init',
    sender: 'system',
    content: 'Poor Man AI Agent Initialized. Low-end Fast profile: PoorMan-Mini-1B INT4 (~0.60 GB) + Thinking Fast. Connected to 127.0.0.1:8000.',
    timestamp: 'Ready'
  }
];

const SESSIONS_STORAGE_KEY = 'poor_man_chat_sessions_v2';
const ACTIVE_SESSION_KEY = 'poor_man_active_session_v2';

export const AIChatInterface: React.FC = () => {
  const { colors } = useTheme();

  // Sessions management
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem(SESSIONS_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse saved sessions', e);
    }
    return [
      {
        id: 'session-default',
        title: 'New Conversation',
        updatedAt: Date.now(),
        messages: INITIAL_MESSAGES,
        mode: 'agent',
        thinkingLevel: 'medium'
      }
    ];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const saved = localStorage.getItem(ACTIVE_SESSION_KEY);
    return saved || 'session-default';
  });

  const [showSessionsDrawer, setShowSessionsDrawer] = useState(false);

  // Active session data
  const currentSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0] || {
      id: 'session-default',
      title: 'New Conversation',
      updatedAt: Date.now(),
      messages: INITIAL_MESSAGES,
      mode: 'agent',
      thinkingLevel: 'medium'
    };

  const [messages, setMessages] = useState<ChatMessage[]>(currentSession.messages);
  const [mode, setMode] = useState<'agent' | 'code'>(currentSession.mode || 'agent');
  const [thinkingLevel, setThinkingLevel] = useState<'low' | 'medium' | 'high'>(
    currentSession.thinkingLevel || 'medium'
  );

  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showThoughts, setShowThoughts] = useState<Record<string, boolean>>({});
  const [statusText, setStatusText] = useState<string>('');

  // Copy feedback states
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [chatCopied, setChatCopied] = useState(false);

  // Voice Mode & TTS state
  const [isListening, setIsListening] = useState(false);
  const [autoSpeakResponse, setAutoSpeakResponse] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // WebRTC Screen Sharing states
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [isCapturingScreen, setIsCapturingScreen] = useState(false);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const haltRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state when activeSessionId changes
  useEffect(() => {
    const session = sessions.find((s) => s.id === activeSessionId);
    if (session) {
      setMessages(session.messages);
      setMode(session.mode || 'agent');
      setThinkingLevel(session.thinkingLevel || 'medium');
    }
    localStorage.setItem(ACTIVE_SESSION_KEY, activeSessionId);
  }, [activeSessionId]);

  // Persist sessions
  useEffect(() => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? { ...s, messages, mode, thinkingLevel, updatedAt: Date.now() }
          : s
      )
    );
  }, [messages, mode, thinkingLevel, activeSessionId]);

  useEffect(() => {
    try {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.warn('Could not save sessions to localStorage', e);
    }
  }, [sessions]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, statusText]);

  // Check pending website reader prompt
  useEffect(() => {
    const pendingPrompt = sessionStorage.getItem('pending_chat_prompt');
    if (pendingPrompt) {
      sessionStorage.removeItem('pending_chat_prompt');
      setInput(pendingPrompt);
    }
  }, []);

  // Cleanup speech/media on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Attach screen stream to video ref whenever stream updates
  useEffect(() => {
    if (screenVideoRef.current && screenStreamRef.current) {
      screenVideoRef.current.srcObject = screenStreamRef.current;
    }
  }, [isSharingScreen]);

  // ==================== NEW CHAT & SESSION MANAGEMENT ====================
  const handleNewChat = () => {
    const newSessionId = `session-${Date.now()}`;
    const newSession: ChatSession = {
      id: newSessionId,
      title: `Conversation ${sessions.length + 1}`,
      updatedAt: Date.now(),
      messages: INITIAL_MESSAGES,
      mode: mode,
      thinkingLevel: thinkingLevel
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSessionId);
    setMessages(INITIAL_MESSAGES);
    setInput('');
    setShowSessionsDrawer(false);
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (sessions.length <= 1) {
      setMessages(INITIAL_MESSAGES);
      return;
    }
    const remaining = sessions.filter((s) => s.id !== id);
    setSessions(remaining);
    if (activeSessionId === id) {
      setActiveSessionId(remaining[0].id);
    }
  };

  // ==================== COPY FUNCTIONS ====================
  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Clipboard copy failed', err);
    }
  };

  const copyEntireChat = async () => {
    const fullText = messages
      .filter((m) => m.sender !== 'system')
      .map(
        (m) =>
          `### ${m.sender === 'user' ? 'User' : 'Poor Man AI Assistant'} (${m.timestamp})\n\n${m.content}\n`
      )
      .join('\n---\n\n');
    try {
      await navigator.clipboard.writeText(fullText);
      setChatCopied(true);
      setTimeout(() => setChatCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy chat transcript', err);
    }
  };

  // ==================== VOICE MODE & TTS ====================
  const toggleListening = () => {
    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch (e) {}
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (e: any) => {
        let transcript = '';
        for (let i = 0; i < e.results.length; i++) {
          transcript += e.results[i][0].transcript;
        }
        setInput(transcript);
      };

      rec.onerror = (e: any) => {
        console.warn('Speech recognition warning:', e);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
      setIsListening(true);
    } catch (err: any) {
      console.error('Microphone activation failed', err);
      setIsListening(false);
    }
  };

  const playTTS = async (msgId: string, text: string) => {
    if (playingAudioId === msgId) {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setPlayingAudioId(null);
      return;
    }

    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    setPlayingAudioId(msgId);

    const cleanText = text
      .replace(/```[\s\S]*?```/g, 'Code block omitted.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .slice(0, 1800);

    try {
      const blob = await synthesizeTTS(cleanText);
      if (blob) {
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        currentAudioRef.current = audio;
        audio.onended = () => {
          setPlayingAudioId(null);
          URL.revokeObjectURL(audioUrl);
        };
        audio.onerror = () => {
          setPlayingAudioId(null);
        };
        await audio.play();
        return;
      }
    } catch (e) {
      console.warn('Backend TTS offline, falling back to Web Speech API', e);
    }

    if ('speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(cleanText);
      utter.onend = () => setPlayingAudioId(null);
      utter.onerror = () => setPlayingAudioId(null);
      window.speechSynthesis.speak(utter);
    } else {
      setPlayingAudioId(null);
    }
  };

  // ==================== WEBRTC SCREEN SHARING ====================
  const startScreenShare = async () => {
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { cursor: 'always' },
        audio: false
      });
      screenStreamRef.current = stream;
      setIsSharingScreen(true);
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
      }
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
    } catch (err) {
      console.warn('Screen share cancelled or failed', err);
    }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }
    setIsSharingScreen(false);
  };

  const captureScreenSnapshot = async () => {
    if (!screenVideoRef.current || isCapturingScreen) return;
    setIsCapturingScreen(true);
    try {
      const video = screenVideoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not initialize canvas context');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob) {
          setIsCapturingScreen(false);
          return;
        }
        try {
          const file = new File([blob], `screenshare_${Date.now()}.png`, { type: 'image/png' });
          setStatusText('Capturing and uploading screen frame...');
          const res = await uploadFile(file);
          setInput((prev) => {
            const prefix = prev ? `${prev}\n` : '';
            return `${prefix}[Attached image: ${res.url}] Please look at what is shown on my screen and help me with it: `;
          });
          setStatusText('');
        } catch (e: any) {
          alert('Failed to upload screen snapshot: ' + e.message);
          setStatusText('');
        } finally {
          setIsCapturingScreen(false);
        }
      }, 'image/png');
    } catch (err: any) {
      alert('Snapshot failed: ' + err.message);
      setIsCapturingScreen(false);
    }
  };

  // ==================== AGENT INVOCATION ====================
  const handleStop = () => {
    haltRef.current = true;
    const ac = abortControllerRef.current;
    abortControllerRef.current = null;
    try {
      ac?.abort();
    } catch {
      /* ignore */
    }
    try {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    setPlayingAudioId(null);
    setIsGenerating(false);
    setStatusText('Stopped');
    setMessages((prev) => {
      const last = [...prev].reverse().find((m) => m.sender === 'assistant');
      if (!last) return prev;
      return prev.map((m) =>
        m.id === last.id
          ? {
              ...m,
              content: (m.content || '').trim()
                ? `${m.content.replace(/\s*\[Stopped\]\s*$/, '')}\n\n[Stopped]`
                : '[Stopped — thinking cancelled]',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          : m
      );
    });
  };

  const handleSend = async () => {
    if (!input.trim() || isGenerating) return;

    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch (e) {}
      setIsListening(false);
    }

    const userText = input.trim();
    const userMsgId = `usr-${Date.now()}`;
    const assistantMsgId = `ast-${Date.now() + 1}`;

    // Auto-update session title if it's the initial default name
    if (messages.length <= 1) {
      const newTitle = userText.slice(0, 32) + (userText.length > 32 ? '...' : '');
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? { ...s, title: newTitle } : s))
      );
    }

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
    setStatusText(
      thinkingLevel === 'high'
        ? 'Deep reflection & multi-step cognitive reasoning...'
        : thinkingLevel === 'low'
        ? 'Rapid synthesis...'
        : 'Initiating reasoning sequence...'
    );

    const historyPayload = messages
      .filter((m) => m.sender !== 'system')
      .map((m) => ({
        role: m.sender,
        text: m.content
      }));

    haltRef.current = false;
    abortControllerRef.current = new AbortController();

    const maxStepsMap = {
      low: 4,
      medium: 10,
      high: 18
    };

    let fullAssistantResponse = '';

    try {
      await streamChat(
        userText,
        maxStepsMap[thinkingLevel],
        abortControllerRef.current.signal,
        (ev) => {
          if (haltRef.current) return;
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
                      toolCalls: [...(m.toolCalls || []), { name: ev.name, args: ev.args }]
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
            fullAssistantResponse += ev.text;
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
            const finalContent = fullAssistantResponse || ev.text || '';
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: m.content || finalContent
                    }
                  : m
              )
            );
            setIsGenerating(false);
            setStatusText('');

            // Auto-speak in voice mode if enabled
            if (autoSpeakResponse && finalContent) {
              playTTS(assistantMsgId, finalContent);
            }
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
        { mode: mode, thinking_level: thinkingLevel }
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

  const clearCurrentChat = () => {
    setMessages(INITIAL_MESSAGES);
  };

  return (
    <div className={`flex flex-col h-full w-full ${colors.bgMain} ${colors.textPrimary} font-sans overflow-hidden relative`}>
      {/* ================= TOP CONTROLS & SUB-BAR ================= */}
      <div className={`flex flex-wrap items-center justify-between gap-2 px-4 md:px-6 py-2.5 border-b ${colors.border} ${colors.bgPanel} backdrop-blur-md text-xs z-10`}>
        {/* Left Side: Sessions Drawer Toggle, Mode & Thinking Level */}
        <div className="flex items-center flex-wrap gap-2">
          {/* New Chat Button */}
          <button
            onClick={handleNewChat}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${colors.accent} ${colors.accentHover} font-medium text-xs shadow-sm transition-all`}
            title="Start fresh conversation"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="font-semibold">New Chat</span>
          </button>

          {/* Sessions Selector Popover Toggle */}
          <div className="relative">
            <button
              onClick={() => setShowSessionsDrawer(!showSessionsDrawer)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${colors.badgeBg} border ${colors.border} ${colors.textMuted} hover:${colors.textPrimary} transition-colors`}
              title="View Chat Sessions"
            >
              <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
              <span className="max-w-[130px] truncate font-medium">{currentSession.title}</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {/* Sessions Dropdown Modal */}
            {showSessionsDrawer && (
              <div className={`absolute left-0 mt-2 w-72 rounded-2xl ${colors.bgPanel} border ${colors.border} shadow-2xl p-2 z-50 text-xs space-y-1 backdrop-blur-xl animate-in fade-in`}>
                <div className="flex items-center justify-between px-2 py-1 border-b border-white/5 pb-2 mb-1">
                  <span className={`text-[10px] font-mono uppercase tracking-wider ${colors.textMuted}`}>
                    Saved Conversations ({sessions.length})
                  </span>
                  <button
                    onClick={handleNewChat}
                    className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> New
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1 custom-scrollbar">
                  {sessions.map((s) => {
                    const isSelected = s.id === activeSessionId;
                    return (
                      <div
                        key={s.id}
                        onClick={() => {
                          setActiveSessionId(s.id);
                          setShowSessionsDrawer(false);
                        }}
                        className={`group flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all ${
                          isSelected
                            ? `${colors.accentMuted} font-medium border border-cyan-500/30`
                            : `hover:bg-white/5 ${colors.textMuted} hover:${colors.textPrimary}`
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <MessageSquare className="w-3.5 h-3.5 shrink-0 text-cyan-400/80" />
                          <div className="truncate">
                            <div className="truncate text-xs">{s.title}</div>
                            <div className="text-[10px] opacity-60">
                              {new Date(s.updatedAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        {sessions.length > 1 && (
                          <button
                            onClick={(e) => deleteSession(e, s.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 transition-opacity"
                            title="Delete session"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Mode Selector */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${colors.badgeBg} border ${colors.border}`}>
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
              className="bg-transparent border-none text-cyan-400 focus:outline-none cursor-pointer text-xs pr-1 font-medium"
            >
              <option value="agent" className="bg-zinc-900 text-zinc-100">Autonomous Agent</option>
              <option value="code" className="bg-zinc-900 text-zinc-100">Code Debugger &amp; Workspace</option>
            </select>
          </div>

          {/* Thinking Level Selector */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${colors.badgeBg} border ${colors.border}`}>
            <Sliders className="w-3.5 h-3.5 text-indigo-400" />
            <span className={`text-[11px] font-medium ${colors.textMuted}`}>Thinking:</span>
            <div className="flex items-center bg-black/20 p-0.5 rounded-md gap-0.5">
              {(['low', 'medium', 'high'] as const).map((lvl) => {
                const isActive = thinkingLevel === lvl;
                const label = lvl === 'low' ? 'Fast' : lvl === 'medium' ? 'Standard' : 'Deep';
                const icon =
                  lvl === 'low' ? (
                    <Zap className="w-2.5 h-2.5" />
                  ) : lvl === 'medium' ? (
                    <Cpu className="w-2.5 h-2.5" />
                  ) : (
                    <Brain className="w-2.5 h-2.5" />
                  );

                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setThinkingLevel(lvl)}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all ${
                      isActive
                        ? lvl === 'high'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                          : lvl === 'low'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                          : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : `${colors.textMuted} hover:${colors.textPrimary}`
                    }`}
                    title={`Reasoning effort: ${lvl.toUpperCase()}`}
                  >
                    {icon}
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Side: Copy Chat, Screen Share, Voice Mode Toggle, Clear */}
        <div className="flex items-center gap-2">
          {/* Screen Share Button */}
          <button
            onClick={isSharingScreen ? stopScreenShare : startScreenShare}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all border ${
              isSharingScreen
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm animate-pulse'
                : `${colors.badgeBg} border ${colors.border} ${colors.textMuted} hover:${colors.textPrimary}`
            }`}
            title={isSharingScreen ? 'Stop Screen Sharing' : 'Share Screen with Poor Man AI'}
          >
            {isSharingScreen ? <MonitorOff className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5 text-cyan-400" />}
            <span className="hidden sm:inline">{isSharingScreen ? 'Screen Sharing' : 'Share Screen'}</span>
          </button>

          {/* Auto-Voice Response Toggle */}
          <button
            onClick={() => setAutoSpeakResponse(!autoSpeakResponse)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all border ${
              autoSpeakResponse
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-sm'
                : `${colors.badgeBg} border ${colors.border} ${colors.textMuted} hover:${colors.textPrimary}`
            }`}
            title={autoSpeakResponse ? 'Auto Voice Mode is ON (Poor Man speaks answers)' : 'Turn Auto Voice Mode ON'}
          >
            <Volume2 className={`w-3.5 h-3.5 ${autoSpeakResponse ? 'text-indigo-400' : ''}`} />
            <span className="hidden sm:inline">Voice Mode</span>
          </button>

          {/* Copy Entire Chat Button */}
          <button
            onClick={copyEntireChat}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-all border ${
              chatCopied
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : `${colors.badgeBg} border ${colors.border} ${colors.textMuted} hover:${colors.textPrimary}`
            }`}
            title="Copy whole chat transcript to clipboard"
          >
            {chatCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{chatCopied ? 'Copied Transcript!' : 'Copy Chat'}</span>
          </button>

          {/* Halt Agent if Generating */}
          {isGenerating && (
            <button
              onClick={handleStop}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-rose-400 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 transition-all text-xs"
              title="Halt current agent execution"
            >
              <StopCircle className="w-3.5 h-3.5" />
              <span>Halt</span>
            </button>
          )}

          {/* Clear Current Chat */}
          <button
            onClick={clearCurrentChat}
            title="Clear Current Conversation"
            className={`flex items-center gap-1 px-2 py-1 rounded-lg ${colors.textMuted} hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all text-xs`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ================= SCREEN SHARE LIVE DOCK (IF ACTIVE) ================= */}
      {isSharingScreen && (
        <div className={`mx-4 mt-3 p-3 rounded-2xl ${colors.bgCard} border border-amber-500/30 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 z-10`}>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative w-36 h-20 bg-black rounded-lg overflow-hidden border border-white/10 shrink-0 shadow-inner">
              <video
                ref={screenVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-bold tracking-wider uppercase animate-pulse">
                LIVE
              </span>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                <Monitor className="w-3.5 h-3.5 text-amber-400" />
                Screen Feed Connected
              </h4>
              <p className={`text-[11px] ${colors.textMuted} mt-0.5`}>
                Poor Man AI can inspect your active workspace, browser, or code windows.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={captureScreenSnapshot}
              disabled={isCapturingScreen}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-black font-semibold text-xs transition-all shadow-md ${
                isCapturingScreen ? 'opacity-50 cursor-wait' : ''
              }`}
              title="Take a snapshot of current screen frame and ask AI about it"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{isCapturingScreen ? 'Analyzing Screen...' : 'Capture & Ask AI'}</span>
            </button>

            <button
              onClick={stopScreenShare}
              className={`px-2.5 py-1.5 rounded-xl ${colors.badgeBg} border ${colors.border} text-xs text-rose-400 hover:bg-rose-500/10 transition-colors`}
            >
              Disconnect
            </button>
          </div>
        </div>
      )}

      {/* ================= MESSAGE FEED ================= */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar">
        {messages.map((msg) => {
          if (msg.sender === 'system') {
            return (
              <div key={msg.id} className="flex justify-center my-2">
                <span className={`text-[11px] font-mono px-3 py-1 rounded-full ${colors.badgeBg} ${colors.border} border text-center text-cyan-400 flex items-center gap-2 shadow-sm`}>
                  <Sparkles className="w-3 h-3" />
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
                className={`flex flex-col space-y-2 max-w-[90%] md:max-w-[85%] ${
                  isAssistant ? 'items-start' : 'items-end'
                }`}
              >
                {/* Header info & Action buttons */}
                <div className={`flex items-center gap-2 text-[11px] ${colors.textMuted} px-1`}>
                  <span className="font-medium">
                    {isAssistant
                      ? mode === 'code'
                        ? 'Poor Man Code Agent'
                        : 'Poor Man AI'
                      : 'You'}
                  </span>
                  <span>&bull;</span>
                  <span>{msg.timestamp}</span>

                  {/* Actions for messages */}
                  <div className="flex items-center gap-1 ml-2">
                    {/* Copy Button */}
                    <button
                      onClick={() => copyToClipboard(msg.content, msg.id)}
                      className={`p-1 rounded hover:${colors.badgeBg} hover:${colors.textPrimary} transition-colors`}
                      title="Copy content"
                    >
                      {copiedId === msg.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>

                    {/* TTS Speaker button for assistant answers */}
                    {isAssistant && msg.content && (
                      <button
                        onClick={() => playTTS(msg.id, msg.content)}
                        className={`p-1 rounded hover:${colors.badgeBg} hover:${colors.textPrimary} transition-colors ${
                          playingAudioId === msg.id ? 'text-indigo-400 animate-pulse' : ''
                        }`}
                        title={playingAudioId === msg.id ? 'Stop voice reading' : 'Read aloud with Neural Voice'}
                      >
                        {playingAudioId === msg.id ? (
                          <VolumeX className="w-3 h-3 text-rose-400" />
                        ) : (
                          <Volume2 className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Cognitive Reasoning Accordion */}
                {isAssistant &&
                  (msg.thoughtProcess || (msg.toolCalls && msg.toolCalls.length > 0)) && (
                    <div
                      className={`w-full rounded-xl ${colors.bgCard} border ${colors.border} text-xs overflow-hidden shadow-sm`}
                    >
                      <button
                        onClick={() => toggleThoughts(msg.id)}
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-[11px] ${colors.textMuted} hover:${colors.textPrimary} ${colors.badgeBg}`}
                      >
                        <span className="flex items-center gap-1.5 text-cyan-400 font-medium">
                          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                          Execution Trace &amp; Reasoning Log
                          {msg.toolCalls && msg.toolCalls.length > 0 && (
                            <span
                              className={`ml-1 text-[10px] px-1.5 py-0.5 rounded ${colors.accentMuted}`}
                            >
                              {msg.toolCalls.length}{' '}
                              {msg.toolCalls.length === 1 ? 'call' : 'calls'}
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
                        <div
                          className={`p-3 font-mono text-[11px] ${colors.badgeBg} border-t ${colors.border} space-y-2 max-h-60 overflow-y-auto custom-scrollbar`}
                        >
                          {msg.plan && (
                            <div className={`p-2 rounded ${colors.accentMuted}`}>
                              <strong>[Plan]:</strong> {msg.plan}
                            </div>
                          )}
                          {msg.toolCalls?.map((t, idx) => (
                            <div
                              key={idx}
                              className={`p-2 rounded ${colors.bgCard} border ${colors.border}`}
                            >
                              <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                                <Wrench className="w-3 h-3 text-amber-400" />
                                <span>{t.name}</span>
                              </div>
                              {t.args && (
                                <pre
                                  className={`text-[10px] ${colors.textMuted} mt-1 overflow-x-auto`}
                                >
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
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <div className="flex items-center gap-2 text-cyan-400 italic text-xs">
                      <Sparkles className="w-3.5 h-3.5 animate-spin" />
                      <span>
                        {thinkingLevel === 'high'
                          ? 'Engaging deep multi-step reflection...'
                          : 'Synthesizing response...'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {isGenerating && (
          <div className="flex gap-3 max-w-2xl mr-auto">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center shrink-0 shadow-md">
              <Bot className="w-4 h-4 text-white animate-pulse" />
            </div>
            <div
              className={`flex items-center gap-2 px-4 py-3 rounded-2xl ${colors.bgCard} border ${colors.border} text-xs ${colors.textMuted} shadow-sm`}
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
              <span>{statusText || 'Streaming agent response...'}</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* ================= CHAT INPUT BOX & VOICE BAR ================= */}
      <div className={`p-4 border-t ${colors.border} ${colors.bgPanel} backdrop-blur-md`}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
        />
        <div
          className={`max-w-4xl mx-auto relative rounded-2xl border ${colors.border} ${colors.bgCard} focus-within:ring-1 focus-within:ring-cyan-500/40 transition-all shadow-xl`}
        >
          <textarea
            ref={textareaRef}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isListening
                ? 'Listening to your voice... (speak now)'
                : mode === 'code'
                ? "Enter coding prompt, e.g. 'Fix lint error in src/api.ts' or 'Build a new dashboard component'..."
                : "Ask anything, research a topic, or share your screen... (Shift+Enter for newline)"
            }
            className={`w-full bg-transparent px-4 pt-3 pb-12 text-sm ${colors.textPrimary} placeholder:${colors.textMuted} focus:outline-none resize-none`}
          />

          <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between">
            {/* Action Tools Left */}
            <div className={`flex items-center gap-1.5 ${colors.textMuted} text-xs`}>
              {/* File Attachment */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`p-1.5 rounded-lg hover:${colors.badgeBg} hover:${colors.textPrimary} transition-colors`}
                title="Attach file, document, or code to analyze"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              {/* Voice Input Microphone */}
              <button
                type="button"
                onClick={toggleListening}
                className={`p-1.5 rounded-lg transition-all ${
                  isListening
                    ? 'bg-rose-500/20 text-rose-400 ring-2 ring-rose-500/50 animate-pulse'
                    : `hover:${colors.badgeBg} hover:${colors.textPrimary}`
                }`}
                title={isListening ? 'Stop Speech-to-Text' : 'Talk with Voice (Speech Recognition)'}
              >
                {isListening ? <MicOff className="w-4 h-4 text-rose-400" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* Screen Snapshot Button if Screen Share Active */}
              {isSharingScreen && (
                <button
                  type="button"
                  onClick={captureScreenSnapshot}
                  disabled={isCapturingScreen}
                  className={`p-1.5 rounded-lg hover:${colors.badgeBg} text-amber-400 hover:${colors.textPrimary} transition-colors`}
                  title="Capture screen frame and attach to prompt"
                >
                  <Camera className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Send & Status Right */}
            <div className="flex items-center gap-2">
              <span className={`text-[11px] ${colors.textMuted} hidden sm:inline`}>
                Enter to send
              </span>
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || isGenerating}
                className={`flex items-center justify-center p-2 rounded-xl ${colors.accent} ${colors.accentHover} disabled:opacity-40 font-medium transition-all shadow-md`}
                title="Send message"
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
