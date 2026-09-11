import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTTSVoices, synthesizeTTS } from "../api";
import { unwrapAnswerPayload } from "../lib/formatResults";
import { detectLanguage, findBestVoiceForLanguage, type DetectedLanguage, SUPPORTED_LANGUAGES } from "../lib/langDetect";

const VOICE_KEY = "ra-voice-uri";
const VOICE_SPEED_KEY = "ra-voice-speed";
const VOICE_READ_PUNCT_KEY = "ra-voice-read-punct";
const VOICE_AUTO_LANG_KEY = "ra-voice-auto-lang";

type Rec = {
  start: () => void;
  stop: () => void;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};

export type VoiceChoice = {
  uri: string;
  label: string;
  lang: string;
  provider?: string;
  isNeural?: boolean;
};

const DEFAULT_NEURAL_VOICES: VoiceChoice[] = [
  // English
  { uri: "en-US-AriaNeural", label: "Aria (English · Expressive, Warm)", lang: "en-US", provider: "Neural Studio", isNeural: true },
  { uri: "en-US-JennyNeural", label: "Jenny (English · Conversational)", lang: "en-US", provider: "Neural Studio", isNeural: true },
  { uri: "en-US-GuyNeural", label: "Guy (English · Deep, Confident)", lang: "en-US", provider: "Neural Studio", isNeural: true },
  { uri: "en-GB-SoniaNeural", label: "Sonia (English UK · Sophisticated)", lang: "en-GB", provider: "Neural Studio", isNeural: true },
  
  // French (Français)
  { uri: "fr-FR-DeniseNeural", label: "Denise (Français · Chaleureuse & Claire)", lang: "fr-FR", provider: "Neural Studio", isNeural: true },
  { uri: "fr-FR-HenriNeural", label: "Henri (Français · Posé & Naturel)", lang: "fr-FR", provider: "Neural Studio", isNeural: true },
  { uri: "fr-FR-EloiseNeural", label: "Éloïse (Français · Expressive)", lang: "fr-FR", provider: "Neural Studio", isNeural: true },

  // Russian (Русский)
  { uri: "ru-RU-SvetlanaNeural", label: "Светлана (Русский · Естественная и четкая)", lang: "ru-RU", provider: "Neural Studio", isNeural: true },
  { uri: "ru-RU-DmitryNeural", label: "Дмитрий (Русский · Уверенный и спокойный)", lang: "ru-RU", provider: "Neural Studio", isNeural: true },

  // Spanish (Español)
  { uri: "es-ES-ElviraNeural", label: "Elvira (Español · Clara y Natural)", lang: "es-ES", provider: "Neural Studio", isNeural: true },
  { uri: "es-ES-AlvaroNeural", label: "Álvaro (Español · Expresivo y Fluido)", lang: "es-ES", provider: "Neural Studio", isNeural: true },
  { uri: "es-MX-DaliaNeural", label: "Dalia (Español México · Cálida y Amable)", lang: "es-MX", provider: "Neural Studio", isNeural: true },

  // German (Deutsch)
  { uri: "de-DE-SeraphinaMultilingualNeural", label: "Seraphina (Deutsch · Natürlich)", lang: "de-DE", provider: "Neural Studio", isNeural: true },
  { uri: "de-DE-FlorianMultilingualNeural", label: "Florian (Deutsch · Klar)", lang: "de-DE", provider: "Neural Studio", isNeural: true },

  // Italian (Italiano)
  { uri: "it-IT-GiuseppeMultilingualNeural", label: "Giuseppe (Italiano · Caldo)", lang: "it-IT", provider: "Neural Studio", isNeural: true },
  { uri: "it-IT-DiegoNeural", label: "Diego (Italiano · Naturale)", lang: "it-IT", provider: "Neural Studio", isNeural: true },

  // Portuguese (Português)
  { uri: "pt-BR-ThalitaMultilingualNeural", label: "Thalita (Português Brasil · Expressiva)", lang: "pt-BR", provider: "Neural Studio", isNeural: true },
  { uri: "pt-BR-AntonioNeural", label: "Antonio (Português Brasil · Claro)", lang: "pt-BR", provider: "Neural Studio", isNeural: true },

  // Chinese (中文)
  { uri: "zh-CN-XiaoxiaoNeural", label: "晓晓 (中文 · 自然流畅)", lang: "zh-CN", provider: "Neural Studio", isNeural: true },
  { uri: "zh-CN-YunxiNeural", label: "云希 (中文 · 生动有力)", lang: "zh-CN", provider: "Neural Studio", isNeural: true },

  // Japanese (日本語)
  { uri: "ja-JP-NanamiNeural", label: "Nanami (日本語 · 丁寧で自然)", lang: "ja-JP", provider: "Neural Studio", isNeural: true },
  { uri: "ja-JP-KeitaNeural", label: "Keita (日本語 · 明瞭で穏やか)", lang: "ja-JP", provider: "Neural Studio", isNeural: true },

  // Korean (한국어)
  { uri: "ko-KR-SunHiNeural", label: "선히 (한국어 · 차분하고 친근한)", lang: "ko-KR", provider: "Neural Studio", isNeural: true },

  // Arabic (العربية)
  { uri: "ar-SA-ZariyahNeural", label: "Zariyah (العربية · واضحة)", lang: "ar-SA", provider: "Neural Studio", isNeural: true },

  // Hindi (हिन्दी)
  { uri: "hi-IN-SwaraNeural", label: "Swara (हिन्दी · मधुर)", lang: "hi-IN", provider: "Neural Studio", isNeural: true },

  // Turkish (Türkçe)
  { uri: "tr-TR-EmelNeural", label: "Emel (Türkçe · Doğal)", lang: "tr-TR", provider: "Neural Studio", isNeural: true },

  // Dutch (Nederlands)
  { uri: "nl-NL-ColetteNeural", label: "Colette (Nederlands · Vriendelijk)", lang: "nl-NL", provider: "Neural Studio", isNeural: true },

  // Polish (Polski)
  { uri: "pl-PL-ZofiaNeural", label: "Zofia (Polski · Czysty)", lang: "pl-PL", provider: "Neural Studio", isNeural: true },

  // Swedish (Svenska)
  { uri: "sv-SE-SofieNeural", label: "Sofie (Svenska · Naturlig)", lang: "sv-SE", provider: "Neural Studio", isNeural: true },

  // Ukrainian (Українська)
  { uri: "uk-UA-PolinaNeural", label: "Поліна (Українська · Природна)", lang: "uk-UA", provider: "Neural Studio", isNeural: true },
];


function getRecognizer(): Rec | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Rec;
    webkitSpeechRecognition?: new () => Rec;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  return new Ctor();
}

function scoreVoice(v: SpeechSynthesisVoice): number {
  const n = `${v.name} ${v.voiceURI} ${v.lang}`;
  if (/desktop|david\b|mark\b|hazel|susan|espeak|microsoft sam/i.test(n)) return -8;
  if (/zira/i.test(n)) return 1;
  let s = 0;
  if (/neural|natural|online|premium|enhanced|wavenet|studio/i.test(n)) s += 16;
  if (/google/i.test(n)) s += 10;
  if (/aria|jenny|guy|sonia|sara|ava|andrew|emma|libby|nova|samantha|allison|karen|moira|tessa|fiona/i.test(n))
    s += 8;
  if (/en-US|en_US/.test(v.lang)) s += 5;
  else if (/^en/i.test(v.lang)) s += 2;
  if (v.localService === false) s += 6;
  return s;
}

function prettyLabel(v: SpeechSynthesisVoice): { label: string; provider: string } {
  const name = v.name
    .replace(/^Microsoft\s+/i, "")
    .replace(/\s+Online\s*\(Natural\)/i, "")
    .replace(/\s+Neural/i, "")
    .replace(/\s+-\s+English\s*\(.*\)$/i, "")
    .replace(/^Google\s+/i, "");

  const provider = /google/i.test(v.name)
    ? "Google"
    : /microsoft/i.test(v.name)
    ? "Microsoft"
    : /apple/i.test(v.name)
    ? "Apple"
    : "System";

  if (/aria/i.test(name)) return { label: "Aria (Expressive, Natural)", provider };
  if (/jenny/i.test(name)) return { label: "Jenny (Warm, Conversational)", provider };
  if (/\bguy\b/i.test(name)) return { label: "Guy (Deep, Confident)", provider };
  if (/samantha/i.test(name)) return { label: "Samantha (Clear, Crisp)", provider };
  if (/nova/i.test(name)) return { label: "Nova (Warm, Expressive)", provider };
  return { label: name.split(" — ")[0] || name, provider };
}

function listLocalVoices(): VoiceChoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  const raw = window.speechSynthesis.getVoices();
  const ranked = [...raw].sort((a, b) => scoreVoice(b) - scoreVoice(a));
  const modern = ranked.filter((v) => scoreVoice(v) >= 0);
  return (modern.length ? modern : ranked).slice(0, 12).map((v) => {
    const meta = prettyLabel(v);
    return {
      uri: v.voiceURI,
      label: meta.label,
      provider: meta.provider,
      lang: v.lang,
      isNeural: false,
    };
  });
}

function pickLocalVoice(uri?: string | null): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const all = window.speechSynthesis.getVoices();
  if (!all.length) return null;
  if (uri) {
    const hit = all.find((v) => v.voiceURI === uri);
    if (hit) return hit;
  }
  return [...all].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ?? null;
}

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function sayNumber(n: number): string {
  if (n < 0) return `negative ${sayNumber(-n)}`;
  if (n < 20) return ONES[n] ?? String(n);
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    const ten = TENS[t] ?? String(t * 10);
    const one = ONES[o] ?? String(o);
    return o ? `${ten}-${one}` : ten;
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rem = n % 100;
    return rem ? `${ONES[hundreds]} hundred ${sayNumber(rem)}` : `${ONES[hundreds]} hundred`;
  }
  if (n < 1000000) {
    const thousands = Math.floor(n / 1000);
    const rem = n % 1000;
    return rem ? `${sayNumber(thousands)} thousand ${sayNumber(rem)}` : `${sayNumber(thousands)} thousand`;
  }
  return String(n);
}

function sayClock(hour: number, minute: number, ap: string): string {
  const h12 = hour % 12 || 12;
  const meridiem = /p/i.test(ap) ? "P.M." : "A.M.";
  const h = sayNumber(h12);
  if (minute === 0) return `${h} o'clock ${meridiem}`;
  if (minute === 15) return `quarter past ${h} ${meridiem}`;
  if (minute === 30) return `half past ${h} ${meridiem}`;
  if (minute === 45) return `quarter to ${sayNumber((h12 % 12) + 1)} ${meridiem}`;
  const mins = minute < 10 ? `oh ${sayNumber(minute)}` : sayNumber(minute);
  return `${h} ${mins} ${meridiem}`;
}

/** Translate punctuation symbols and formatting into natural spoken names when reading punctuations. */
function punctuateExplicitly(text: string): string {
  return text
    // Ellipsis & multi-period
    .replace(/\.{3,}|…/g, ", ellipsis, ")
    // Questions and Exclamations
    .replace(/\?/g, ", question mark. ")
    .replace(/!/g, ", exclamation mark! ")
    // Colon & Semicolon
    .replace(/;/g, ", semicolon, ")
    .replace(/:/g, ", colon, ")
    // Quotes
    .replace(/"([^"]+)"/g, ", quote, $1, unquote, ")
    .replace(/'([^']+)'/g, ", single quote, $1, end quote, ")
    // Parentheses & Brackets
    .replace(/\(([^)]+)\)/g, ", open parenthesis, $1, close parenthesis, ")
    .replace(/\[([^\]]+)\]/g, ", open bracket, $1, close bracket, ")
    // Common symbols
    .replace(/&/g, " and ")
    .replace(/@/g, " at ")
    .replace(/#/g, " hash ")
    .replace(/\$/g, " dollar sign ")
    .replace(/%/g, " percent ")
    .replace(/\+/g, " plus ")
    .replace(/=/g, " equals ")
    .replace(/\//g, " slash ")
    // Periods (excluding standard decimals handled earlier)
    .replace(/\.(?=\s|$)/g, ", period. ")
    // Commas
    .replace(/,/g, ", comma, ");
}

/** Prepares text for human-like spoken cadence and natural inflection. */
function prepareHumanSpeechPhrases(raw: string, readPunctuation = false): string[] {
  if (!raw) return [];

  let text = raw.split(/\n+Citations:\s*\n/i)[0] || raw;

  // Clean code blocks & web URLs
  text = text
    .replace(/https?:\/\/(?:www\.)?([^/\s]+)(?:\/[^\s]*)?/gi, "")
    .replace(/```[\s\S]*?```/g, ". Code sample omitted. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\[\^?\d+\]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/[>_~|#]/g, " ")
    .replace(/[÷]/g, " divided by ")
    .replace(/[×x]\s*(?=\d)/gi, " times ")
    .replace(/\bmph\b/gi, "miles per hour")
    .replace(/\bkm\/h\b/gi, "kilometers per hour")
    .replace(/\bmi\b/gi, "miles")
    .replace(/\bvs\.?\b/gi, "versus")
    .replace(/\be\.g\.\b/gi, "for example,")
    .replace(/\bi\.e\.\b/gi, "that is,")
    .replace(/\betc\.\b/gi, "et cetera.")
    .replace(/\bapprox\.?\b/gi, "approximately")
    .replace(/\bmin\b/gi, "minutes")
    .replace(/\bsec\b/gi, "seconds")
    .replace(/\bhr\b/gi, "hours")
    .replace(/—|–/g, ", ");

  // Spoken clocks and numbers
  text = text.replace(
    /\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)\b/gi,
    (_m, h, min, ap) => sayClock(Number(h), Number(min), ap),
  );
  text = text.replace(
    /\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)\b/gi,
    (_m, h, ap) => sayClock(Number(h), 0, ap),
  );

  // If reading punctuations is toggled on, vocalize commas, periods, quotes, colons, etc.
  if (readPunctuation) {
    text = punctuateExplicitly(text);
  } else {
    text = text.replace(/\.{3,}/g, "…");
  }

  // Normalize spaces and linebreaks
  text = text.replace(/\n+/g, ". ").replace(/[ \t]+/g, " ").trim();

  // Natural clause splitting: pause naturally at commas, dashes, and sentence ends
  // for conversational flow rather than a robotic monotone stream.
  const sentenceUnits = text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const phrases: string[] = [];

  for (const sentence of sentenceUnits) {
    // If reading punctuation, preserve punctuation tokens; otherwise break long clauses at commas/semicolons
    if (!readPunctuation && sentence.length > 120 && /[,;]/.test(sentence)) {
      const parts = sentence.split(/(?<=[,;])\s+/);
      let subBuf = "";
      for (const p of parts) {
        if ((subBuf + " " + p).trim().length > 110 && subBuf) {
          phrases.push(subBuf.trim());
          subBuf = p;
        } else {
          subBuf = subBuf ? `${subBuf} ${p}` : p;
        }
      }
      if (subBuf) phrases.push(subBuf.trim());
    } else {
      let s = sentence;
      if (!/[.!?…]$/.test(s)) {
        s = /\?/.test(s) ? `${s}?` : `${s}.`;
      }
      phrases.push(s);
    }
  }

  return phrases.filter((p) => p.trim().length > 0).slice(0, 32);
}

export function useVoice() {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [transcriptInterim, setTranscriptInterim] = useState("");
  const [readPunctuation, setReadPunctuationState] = useState<boolean>(() => {
    return localStorage.getItem(VOICE_READ_PUNCT_KEY) === "true";
  });
  const [autoLanguage, setAutoLanguageState] = useState<boolean>(() => {
    const saved = localStorage.getItem(VOICE_AUTO_LANG_KEY);
    return saved !== null ? saved === "true" : true; // Default ON
  });
  const [speed, setSpeedState] = useState<number>(() => {
    const saved = localStorage.getItem(VOICE_SPEED_KEY);
    const n = saved ? parseFloat(saved) : 0.95;
    // Must match a Speed <select> option (0.85 / 0.95 / 1.05 / 1.2 / 1.4).
    const allowed = [0.85, 0.95, 1.05, 1.2, 1.4];
    const picked = allowed.includes(n) ? n : 0.95;
    if (!saved || !allowed.includes(n)) {
      localStorage.setItem(VOICE_SPEED_KEY, String(picked));
    }
    return picked;
  });
  const [voices, setVoices] = useState<VoiceChoice[]>(DEFAULT_NEURAL_VOICES);
  const [voiceUri, setVoiceUriState] = useState<string>(() => {
    const saved = localStorage.getItem(VOICE_KEY);
    return saved || DEFAULT_NEURAL_VOICES[0]?.uri || "en-US-AriaNeural";
  });
  const [currentLanguage, setCurrentLanguage] = useState<DetectedLanguage>(() => {
    const savedUri = localStorage.getItem(VOICE_KEY) || DEFAULT_NEURAL_VOICES[0]?.uri || "";
    const match = DEFAULT_NEURAL_VOICES.find((v) => v.uri === savedUri);
    const code = (match?.lang || "en-US").slice(0, 2).toLowerCase();
    return (
      SUPPORTED_LANGUAGES[code] ||
      SUPPORTED_LANGUAGES.en || {
        code: "en",
        locale: "en-US",
        name: "English",
        nativeName: "English",
      }
    );
  });

  const recRef = useRef<Rec | null>(null);
  const onFinal = useRef<(t: string) => void>(() => undefined);
  const uriRef = useRef(voiceUri);
  uriRef.current = voiceUri;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const readPunctRef = useRef(readPunctuation);
  readPunctRef.current = readPunctuation;
  const autoLangRef = useRef(autoLanguage);
  autoLangRef.current = autoLanguage;
  const voicesRef = useRef(voices);
  voicesRef.current = voices;

  const isSpeakingRef = useRef(false);
  const phraseIndexRef = useRef(0);
  const phraseListRef = useRef<string[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const playSeqRef = useRef(0);

  // Auto-switch voice based on detected language if autoLanguage is enabled
  const updateLanguageFromText = useCallback((text: string): DetectedLanguage => {
    const detected = detectLanguage(text);
    setCurrentLanguage(detected);
    if (autoLangRef.current) {
      const bestUri = findBestVoiceForLanguage(detected.code, voicesRef.current);
      if (bestUri && bestUri !== uriRef.current) {
        uriRef.current = bestUri;
        setVoiceUriState(bestUri);
        localStorage.setItem(VOICE_KEY, bestUri);
      }
    }
    return detected;
  }, []);

  // Initialize voices once (Neural + browser). voiceschanged only refreshes local list.
  useEffect(() => {
    const isSupp =
      typeof window !== "undefined" && ("speechSynthesis" in window || typeof Audio !== "undefined");
    setSupported(isSupp);

    let cancelled = false;

    const applyCombined = () => {
      if (cancelled) return;
      // Curated neural list only — remote edge-tts catalog is huge and locale-sorted
      // (ar/zh dominate), which cluttered the picker. Locals stay as a short fallback.
      const seen = new Set(DEFAULT_NEURAL_VOICES.map((x) => x.uri));
      const locals = listLocalVoices()
        .filter((v) => !seen.has(v.uri))
        .slice(0, 4);
      const combined = [...DEFAULT_NEURAL_VOICES, ...locals];
      setVoices(combined);
      setVoiceUriState((cur) => {
        if (cur && combined.some((v) => v.uri === cur)) return cur;
        // Drop stale remote URIs that are no longer in the curated list.
        const defaultUri = combined[0]?.uri || "en-US-AriaNeural";
        localStorage.setItem(VOICE_KEY, defaultUri);
        return defaultUri;
      });
    };

    // Warm the server/session voice cache; UI uses curated defaults only.
    void fetchTTSVoices().catch(() => undefined);
    applyCombined();

    const onVoicesChanged = () => applyCombined();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
    }

    return () => {
      cancelled = true;
      recRef.current?.stop();
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.src = "";
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const setVoiceUri = useCallback((uri: string) => {
    uriRef.current = uri;
    setVoiceUriState(uri);
    localStorage.setItem(VOICE_KEY, uri);
    const match = voicesRef.current.find((v) => v.uri === uri);
    if (match?.lang) {
      const code = match.lang.slice(0, 2).toLowerCase();
      const known = SUPPORTED_LANGUAGES[code];
      if (known) setCurrentLanguage(known);
    }
  }, []);

  const setAutoLanguage = useCallback((enabled: boolean) => {
    autoLangRef.current = enabled;
    setAutoLanguageState(enabled);
    localStorage.setItem(VOICE_AUTO_LANG_KEY, String(enabled));
  }, []);

  const setSpeed = useCallback((s: number) => {
    speedRef.current = s;
    setSpeedState(s);
    localStorage.setItem(VOICE_SPEED_KEY, s.toString());
  }, []);

  const setReadPunctuation = useCallback((enabled: boolean) => {
    readPunctRef.current = enabled;
    setReadPunctuationState(enabled);
    localStorage.setItem(VOICE_READ_PUNCT_KEY, String(enabled));
  }, []);

  const stopSpeaking = useCallback(() => {
    playSeqRef.current += 1;
    isSpeakingRef.current = false;
    phraseListRef.current = [];
    phraseIndexRef.current = 0;
    activeUtteranceRef.current = null;
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.src = "";
      } catch {
        /* ignore */
      }
      currentAudioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  // Web Speech fallback
  const speakWithWebSpeech = useCallback((chosenVoice: SpeechSynthesisVoice | null, seqId: number) => {
    if (!isSpeakingRef.current || seqId !== playSeqRef.current) return;

    const phrases = phraseListRef.current;
    const idx = phraseIndexRef.current;

    if (idx >= phrases.length) {
      isSpeakingRef.current = false;
      setSpeaking(false);
      return;
    }

    const phrase = phrases[idx];
    if (!phrase) {
      isSpeakingRef.current = false;
      setSpeaking(false);
      return;
    }
    phraseIndexRef.current = idx + 1;

    const u = new SpeechSynthesisUtterance(phrase);
    activeUtteranceRef.current = u;

    if (chosenVoice) {
      u.voice = chosenVoice;
      u.lang = chosenVoice.lang || "en-US";
    } else {
      u.lang = "en-US";
    }

    const base = speedRef.current;
    u.rate = Math.min(1.25, Math.max(0.75, base));
    u.volume = 1;

    const isQuestion = /\?/.test(phrase);
    const isExclamation = /!/.test(phrase) && !isQuestion;
    const isCommaClause = /[,;]\s*$/.test(phrase);

    if (isQuestion) {
      u.pitch = 1.12;
    } else if (isExclamation) {
      u.pitch = 1.08;
    } else if (isCommaClause) {
      u.pitch = 1.03;
    } else {
      u.pitch = 1.0;
    }

    u.onend = () => {
      if (!isSpeakingRef.current || seqId !== playSeqRef.current) return;
      const pauseMs = isQuestion ? 280 : isExclamation ? 240 : isCommaClause ? 120 : 200;
      window.setTimeout(() => {
        if (isSpeakingRef.current && seqId === playSeqRef.current) {
          speakWithWebSpeech(chosenVoice, seqId);
        }
      }, pauseMs);
    };

    u.onerror = () => {
      if (!isSpeakingRef.current || seqId !== playSeqRef.current) return;
      speakWithWebSpeech(chosenVoice, seqId);
    };

    try {
      window.speechSynthesis.resume();
    } catch {
      /* ignore */
    }
    window.speechSynthesis.speak(u);
  }, []);

  // Neural TTS stream/blob playback
  const playNeuralPhrases = useCallback(
    async (phrases: string[], selectedVoice: string, seqId: number) => {
      for (let i = 0; i < phrases.length; i++) {
        if (!isSpeakingRef.current || seqId !== playSeqRef.current) return;

        const phrase = phrases[i];
        if (!phrase || !phrase.trim()) continue;

        const speedPercent = Math.round((speedRef.current - 1.0) * 100);
        const rateParam = speedPercent >= 0 ? `+${speedPercent}%` : `${speedPercent}%`;

        try {
          const blob = await synthesizeTTS(phrase, selectedVoice, rateParam, "+0Hz");
          if (!isSpeakingRef.current || seqId !== playSeqRef.current) return;

          if (!blob) {
            phraseIndexRef.current = i;
            const fallbackVoice = pickLocalVoice();
            speakWithWebSpeech(fallbackVoice, seqId);
            return;
          }

          const audioUrl = URL.createObjectURL(blob);
          const audio = new Audio(audioUrl);
          currentAudioRef.current = audio;

          await new Promise<void>((resolve) => {
            audio.onended = () => {
              URL.revokeObjectURL(audioUrl);
              resolve();
            };
            audio.onerror = () => {
              URL.revokeObjectURL(audioUrl);
              resolve();
            };
            void audio.play().catch(() => resolve());
          });

          if (isSpeakingRef.current && seqId === playSeqRef.current && i < phrases.length - 1) {
            const pauseTime = /\?/.test(phrase) ? 220 : /[,;]/.test(phrase) ? 80 : 150;
            await new Promise((r) => setTimeout(r, pauseTime));
          }
        } catch {
          phraseIndexRef.current = i;
          const fallbackVoice = pickLocalVoice();
          speakWithWebSpeech(fallbackVoice, seqId);
          return;
        }
      }

      if (seqId === playSeqRef.current) {
        isSpeakingRef.current = false;
        setSpeaking(false);
      }
    },
    [speakWithWebSpeech],
  );

  const speak = useCallback(
    (text: string, uri?: string, explicitPunctuation?: boolean) => {
      if (typeof window === "undefined") return;
      stopSpeaking();

      // Prefer prose if a tool/JSON envelope leaked into the spoken text.
      text = unwrapAnswerPayload(text);

      // If auto-language is enabled and no explicit voice override was provided, auto-switch to matched language voice
      let chosenVoiceUri = uri ?? uriRef.current;
      if (autoLangRef.current && !uri && text) {
        const detected = detectLanguage(text);
        setCurrentLanguage(detected);
        const current = voicesRef.current.find((v) => v.uri === uriRef.current);
        const currentLang = (current?.lang || "").slice(0, 2).toLowerCase();
        // Keep the user's voice when it already matches the detected language
        // (e.g. Jenny vs Aria for English) instead of forcing the first match.
        if (currentLang === detected.code.toLowerCase()) {
          chosenVoiceUri = uriRef.current;
        } else {
          const best = findBestVoiceForLanguage(detected.code, voicesRef.current);
          if (best) {
            chosenVoiceUri = best;
            uriRef.current = best;
            setVoiceUriState(best);
            localStorage.setItem(VOICE_KEY, best);
          }
        }
      }

      const shouldReadPunct = explicitPunctuation ?? readPunctRef.current;
      const phrases = prepareHumanSpeechPhrases(text, shouldReadPunct);
      if (!phrases.length) return;

      const seqId = playSeqRef.current;
      phraseListRef.current = phrases;
      phraseIndexRef.current = 0;
      isSpeakingRef.current = true;
      setSpeaking(true);

      const targetUri = chosenVoiceUri;
      const isNeural =
        !targetUri ||
        targetUri.includes("Neural") ||
        DEFAULT_NEURAL_VOICES.some((v) => v.uri === targetUri);

      if (isNeural) {
        void playNeuralPhrases(phrases, targetUri || "en-US-AriaNeural", seqId);
      } else {
        const localVoice = pickLocalVoice(targetUri);
        speakWithWebSpeech(localVoice, seqId);
      }
    },
    [playNeuralPhrases, speakWithWebSpeech, stopSpeaking],
  );

  const start = useCallback(
    (cb: (t: string) => void) => {
      const rec = getRecognizer();
      if (!rec) return;
      stopSpeaking();
      setTranscriptInterim("");
      onFinal.current = cb;
      rec.continuous = false;
      rec.interimResults = true;
      
      // Adapt recognition language to match current selected voice or browser language
      const activeVoice = voices.find((v) => v.uri === uriRef.current);
      if (activeVoice?.lang) {
        rec.lang = activeVoice.lang;
      } else if (typeof navigator !== "undefined" && navigator.language) {
        rec.lang = navigator.language;
      } else {
        rec.lang = "en-US";
      }

      rec.onresult = (ev) => {
        let interim = "";
        for (let i = 0; i < ev.results.length; i++) {
          const item = ev.results[i];
          if (!item || !item[0]) continue;
          if (item.isFinal) {
            const finalTranscript = item[0].transcript.trim();
            if (autoLangRef.current && finalTranscript) {
              updateLanguageFromText(finalTranscript);
            }
            onFinal.current(finalTranscript);
            setTranscriptInterim("");
            return;
          } else {
            interim += item[0].transcript;
          }
        }
        if (interim) {
          setTranscriptInterim(interim);
        }
      };
      rec.onend = () => {
        setListening(false);
        setTranscriptInterim("");
      };
      rec.onerror = () => {
        setListening(false);
        setTranscriptInterim("");
      };
      recRef.current = rec;
      try {
        rec.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    },
    [stopSpeaking, updateLanguageFromText, voices],
  );

  const stopListen = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
    setTranscriptInterim("");
  }, []);

  const toggleVoiceMode = useCallback(() => {
    setVoiceMode((v) => {
      const next = !v;
      if (!next) {
        recRef.current?.stop();
        stopSpeaking();
        setListening(false);
        setSpeaking(false);
        setTranscriptInterim("");
      }
      return next;
    });
  }, [stopSpeaking]);

  return {
    supported,
    listening,
    transcriptInterim,
    voiceMode,
    speaking,
    voices,
    voiceUri,
    speed,
    readPunctuation,
    autoLanguage,
    currentLanguage,
    setAutoLanguage,
    updateLanguageFromText,
    setReadPunctuation,
    setSpeed,
    setVoiceUri,
    start,
    stopListen,
    stopSpeaking,
    toggleVoiceMode,
    speak,
  };
}
