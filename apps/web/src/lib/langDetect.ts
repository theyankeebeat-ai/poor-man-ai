export type DetectedLanguage = {
  code: string;
  locale: string;
  name: string;
  nativeName: string;
};

export const SUPPORTED_LANGUAGES: Record<string, DetectedLanguage> = {
  en: { code: 'en', locale: 'en-US', name: 'English', nativeName: 'English' },
  fr: { code: 'fr', locale: 'fr-FR', name: 'French', nativeName: 'Français' },
  es: { code: 'es', locale: 'es-ES', name: 'Spanish', nativeName: 'Español' },
  ru: { code: 'ru', locale: 'ru-RU', name: 'Russian', nativeName: 'Русский' },
  de: { code: 'de', locale: 'de-DE', name: 'German', nativeName: 'Deutsch' },
  it: { code: 'it', locale: 'it-IT', name: 'Italian', nativeName: 'Italiano' },
  pt: { code: 'pt', locale: 'pt-BR', name: 'Portuguese', nativeName: 'Português' },
  zh: { code: 'zh', locale: 'zh-CN', name: 'Chinese', nativeName: '中文' },
  ja: { code: 'ja', locale: 'ja-JP', name: 'Japanese', nativeName: '日本語' },
  ko: { code: 'ko', locale: 'ko-KR', name: 'Korean', nativeName: '한국어' },
  ar: { code: 'ar', locale: 'ar-SA', name: 'Arabic', nativeName: 'العربية' },
  hi: { code: 'hi', locale: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी' },
  tr: { code: 'tr', locale: 'tr-TR', name: 'Turkish', nativeName: 'Türkçe' },
  nl: { code: 'nl', locale: 'nl-NL', name: 'Dutch', nativeName: 'Nederlands' },
  pl: { code: 'pl', locale: 'pl-PL', name: 'Polish', nativeName: 'Polski' },
  sv: { code: 'sv', locale: 'sv-SE', name: 'Swedish', nativeName: 'Svenska' },
  uk: { code: 'uk', locale: 'uk-UA', name: 'Ukrainian', nativeName: 'Українська' },
};

const DEFAULT_LANG: DetectedLanguage = {
  code: 'en',
  locale: 'en-US',
  name: 'English',
  nativeName: 'English',
};

const LANGUAGE_MARKERS: Record<string, RegExp[]> = {
  fr: [
    /\b(bonjour|salut|merci|beaucoup|s'il\s+vous\s+pla[iî]t|s'il\s+te\s+pla[iî]t|comment|pourquoi|parce\s+que|avec|dans|pour|mais|vous|nous|ils|elles|c'est|qu'est-ce|je\s+suis|j'ai|être|faire|pouvez-vous|peux-tu|bonsoir|au\s+revoir|aujourd'hui)\b/i,
    /[éèêëàâîïôûùçœæ]/i,
  ],
  es: [
    /\b(hola|gracias|muchas\s+gracias|por\s+favor|c[oó]mo|por\s*qu[eé]|porque|para|pero|est[aá]|est[oó]y|tambi[eé]n|qui[eé]n|d[oó]nde|cu[aá]ndo|puedes|podr[ií]as|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|adi[oó]s|hasta\s+luego)\b/i,
    /[¿¡áéíóúüñ]/i,
  ],
  ru: [
    /\b(привет|здравствуй|здравствуйте|спасибо|пожалуйста|как|почему|потому\s+что|где|когда|кто|что|меня|тебя|меня\s+зовут|добрый\s+день|доброе\s+утро|добрый\s+вечер|до\s+свидания|пока|помоги|помогите|сделай|скажи)\b/i,
  ],
  de: [
    /\b(hallo|guten\s+tag|guten\s+morgen|danke|bitte|wie|warum|weil|nicht|oder|aber|auch|haben|sein|k[oö]nnen|kannst\s+du|k[oö]nnen\s+sie|tsch[uü]ss|auf\s+wiedersehen)\b/i,
    /[äöüß]/i,
  ],
  it: [
    /\b(ciao|buongiorno|buonasera|grazie|mille|per\s+favore|come|perch[eé]|dove|quando|chi|cosa|sono|siamo|anche|questo|quello|puoi|potresti|arrivederci)\b/i,
    /\b(molto|tutto|sempre|ancora|bene|niente)\b/i,
  ],
  pt: [
    /\b(ol[aá]|bom\s+dia|boa\s+tarde|boa\s+noite|obrigado|obrigada|por\s+favor|como|por\s*que|porque|para|com|voc[eê]|est[aá]|estou|tamb[eé]m|onde|quando|tchau|at[eé]\s+logo)\b/i,
    /[ãõçáéíóúâêô]/i,
  ],
  zh: [
    /[\u4e00-\u9fff]/,
  ],
  ja: [
    /[\u3040-\u309f\u30a0-\u30ff]/,
  ],
  ko: [
    /[\uac00-\ud7af\u1100-\u11ff]/,
  ],
  ar: [
    /[\u0600-\u06ff]/,
  ],
  hi: [
    /[\u0900-\u097f]/,
  ],
  tr: [
    /\b(merhaba|selam|te[sş]ekk[uü]r|l[uü]tfen|nas[iı]l|neden|[cç][uü]nk[uü]|evet|hay[iı]r|g[oö]r[uü][sş][uü]r[uü]z|g[uü]nayd[iı]n|iyi\s+g[uü]nler)\b/i,
    /[çğıöşüÇĞİÖŞÜ]/,
  ],
  nl: [
    /\b(hallo|goedemorgen|goedenavond|dank\s+je|alstublieft|waarom|omdat|kun\s+je|kunt\s+u|tot\s+ziens|alsjeblieft|goedemiddag|alsjeblieft|graag\s+gedaan)\b/i,
  ],
  pl: [
    /\b(cze[sś][cć]|dzie[nń]\s+dobry|dzi[eę]kuj[eę]|prosz[eę]|jak|dlaczego|poniewa[zż]|gdzie|kiedy|jestem|mo[zż]esz|do\s+widzenia)\b/i,
    /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/,
  ],
  sv: [
    /\b(hej|hall[aå]|god\s+morgon|tack|sn[aä]lla|hur|varf[oö]r|eftersom|inte|eller|men|ocks[aå]|kan\s+du|hejd[aå])\b/i,
    /[åäöÅÄÖ]/,
  ],
  uk: [
    /\b(привіт|доброго\s+дня|добрий\s+ранок|дякую|будь\s+ласка|як|чому|тому\s+що|де|коли|хто|що|до\s+побачення|бувай)\b/i,
    /[іїєґІЇЄҐ]/,
  ],
};

export function detectLanguage(text: string): DetectedLanguage {
  if (!text || !text.trim()) {
    return DEFAULT_LANG;
  }

  const raw = text.trim();

  // 1. Script checks
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(raw)) {
    return SUPPORTED_LANGUAGES.ja ?? DEFAULT_LANG;
  }
  if (/[\uac00-\ud7af\u1100-\u11ff]/.test(raw)) {
    return SUPPORTED_LANGUAGES.ko ?? DEFAULT_LANG;
  }
  if (/[\u4e00-\u9fff]/.test(raw)) {
    return SUPPORTED_LANGUAGES.zh ?? DEFAULT_LANG;
  }
  if (/[\u0600-\u06ff]/.test(raw)) {
    return SUPPORTED_LANGUAGES.ar ?? DEFAULT_LANG;
  }
  if (/[\u0900-\u097f]/.test(raw)) {
    return SUPPORTED_LANGUAGES.hi ?? DEFAULT_LANG;
  }
  if (/[іїєґІЇЄҐ]/.test(raw)) {
    return SUPPORTED_LANGUAGES.uk ?? DEFAULT_LANG;
  }
  if (/[\u0400-\u04ff]/.test(raw)) {
    const ukMarkers = LANGUAGE_MARKERS.uk ?? [];
    for (const rx of ukMarkers) {
      if (rx.test(raw)) return SUPPORTED_LANGUAGES.uk ?? DEFAULT_LANG;
    }
    return SUPPORTED_LANGUAGES.ru ?? DEFAULT_LANG;
  }

  // 2. Distinctive Latin diacritics
  if (/[¿¡]/.test(raw)) {
    return SUPPORTED_LANGUAGES.es ?? DEFAULT_LANG;
  }
  if (/[ãõ]/.test(raw)) {
    return SUPPORTED_LANGUAGES.pt ?? DEFAULT_LANG;
  }
  if (/[çğıöşüÇĞİÖŞÜ]/.test(raw) && !/[éèàù]/i.test(raw)) {
    const trMarkers = LANGUAGE_MARKERS.tr ?? [];
    if (trMarkers.some((rx) => rx.test(raw))) {
      return SUPPORTED_LANGUAGES.tr ?? DEFAULT_LANG;
    }
  }
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(raw)) {
    return SUPPORTED_LANGUAGES.pl ?? DEFAULT_LANG;
  }
  if (/[äöüßÄÖÜ]/.test(raw) && !/[éèàùç]/.test(raw)) {
    return SUPPORTED_LANGUAGES.de ?? DEFAULT_LANG;
  }

  // 3. Keyword / stopword scoring
  const scores: Record<string, number> = {};
  for (const [code, patterns] of Object.entries(LANGUAGE_MARKERS)) {
    let score = 0;
    for (const rx of patterns) {
      const match = raw.match(rx);
      if (match) {
        score += match.length * 3;
      }
    }
    if (score > 0) {
      scores[code] = score;
    }
  }

  const enMatches = raw.match(
    /\b(the|is|are|was|were|have|has|what|how|where|when|why|who|can|you|please|build|create|write|hello|hi|thanks|thank\s+you|good|code|help|with|from|this|that|there)\b/gi,
  );
  if (enMatches) {
    scores.en = (scores.en || 0) + enMatches.length * 2;
  }

  let bestLang = 'en';
  let maxScore = 0;
  for (const [code, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestLang = code;
    }
  }

  return SUPPORTED_LANGUAGES[bestLang] ?? DEFAULT_LANG;
}

export function findBestVoiceForLanguage(
  langCode: string,
  availableVoices: Array<{ uri: string; lang: string; isNeural?: boolean }>,
): string | null {
  const code = langCode.toLowerCase().slice(0, 2);

  const neuralMatch = availableVoices.find(
    (v) => (v.isNeural || v.uri.includes('Neural')) && v.lang.toLowerCase().startsWith(code),
  );
  if (neuralMatch) return neuralMatch.uri;

  const anyMatch = availableVoices.find((v) => v.lang.toLowerCase().startsWith(code));
  if (anyMatch) return anyMatch.uri;

  return null;
}
