import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeName = 'cyber-dark' | 'midnight-blue' | 'matrix' | 'dracula' | 'light' | 'beige';

export interface ThemeColors {
  id: ThemeName;
  name: string;
  bgMain: string;
  bgPanel: string;
  bgCard: string;
  border: string;
  textPrimary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  accentMuted: string;
  badgeBg: string;
}

export const THEMES: Record<ThemeName, ThemeColors> = {
  'cyber-dark': {
    id: 'cyber-dark',
    name: 'Cyber Dark (Default)',
    bgMain: 'bg-[#0a0d14]',
    bgPanel: 'bg-[#0d111a]',
    bgCard: 'bg-zinc-900/60',
    border: 'border-zinc-800/80',
    textPrimary: 'text-zinc-100',
    textMuted: 'text-zinc-400',
    accent: 'bg-cyan-500 text-zinc-950',
    accentHover: 'hover:bg-cyan-400',
    accentMuted: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    badgeBg: 'bg-zinc-900 border-zinc-800'
  },
  'midnight-blue': {
    id: 'midnight-blue',
    name: 'Midnight Deep Blue',
    bgMain: 'bg-[#090d16]',
    bgPanel: 'bg-[#0f172a]',
    bgCard: 'bg-[#1e293b]/60',
    border: 'border-blue-900/40',
    textPrimary: 'text-slate-100',
    textMuted: 'text-slate-400',
    accent: 'bg-blue-500 text-white',
    accentHover: 'hover:bg-blue-400',
    accentMuted: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    badgeBg: 'bg-slate-900 border-blue-900/60'
  },
  'matrix': {
    id: 'matrix',
    name: 'Matrix Emerald',
    bgMain: 'bg-[#050d08]',
    bgPanel: 'bg-[#09150d]',
    bgCard: 'bg-[#0c1c11]/70',
    border: 'border-emerald-900/40',
    textPrimary: 'text-emerald-50',
    textMuted: 'text-emerald-400/70',
    accent: 'bg-emerald-500 text-black font-semibold',
    accentHover: 'hover:bg-emerald-400',
    accentMuted: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    badgeBg: 'bg-emerald-950/60 border-emerald-900/50'
  },
  'dracula': {
    id: 'dracula',
    name: 'Synthwave Purple',
    bgMain: 'bg-[#120b1c]',
    bgPanel: 'bg-[#1a1028]',
    bgCard: 'bg-[#251838]/60',
    border: 'border-purple-900/40',
    textPrimary: 'text-purple-100',
    textMuted: 'text-purple-300/70',
    accent: 'bg-fuchsia-500 text-white',
    accentHover: 'hover:bg-fuchsia-400',
    accentMuted: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
    badgeBg: 'bg-purple-950/70 border-purple-900/50'
  },
  'light': {
    id: 'light',
    name: 'Clean Light',
    bgMain: 'bg-slate-50',
    bgPanel: 'bg-white',
    bgCard: 'bg-slate-100/90',
    border: 'border-slate-200',
    textPrimary: 'text-slate-900',
    textMuted: 'text-slate-500',
    accent: 'bg-indigo-600 text-white',
    accentHover: 'hover:bg-indigo-500',
    accentMuted: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    badgeBg: 'bg-slate-100 border-slate-200'
  },
  'beige': {
    id: 'beige',
    name: 'Warm Paper Beige',
    bgMain: 'bg-[#f5ede0]',
    bgPanel: 'bg-[#fcf6ec]',
    bgCard: 'bg-[#fffdfa]/90',
    border: 'border-[#e0ceb6]',
    textPrimary: 'text-[#3e3024]',
    textMuted: 'text-[#8c7660]',
    accent: 'bg-[#b07a4a] text-[#fffaf2]',
    accentHover: 'hover:bg-[#9a623a]',
    accentMuted: 'bg-[#b07a4a]/15 text-[#7c4d24] border-[#b07a4a]/30',
    badgeBg: 'bg-[#eee3d1] border-[#dfceb7]'
  }
};

const THEME_STORAGE_KEY = 'poor_man_ai_theme';

interface ThemeContextType {
  theme: ThemeName;
  colors: ThemeColors;
  setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'cyber-dark',
  colors: THEMES['cyber-dark'],
  setTheme: () => {}
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    const saved = (localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem('ra-theme')) as ThemeName | null;
    if (saved && THEMES[saved]) return saved;
    // Backwards compatibility mappings for older saved keys
    if (saved === ('dark' as any)) return 'cyber-dark';
    if (saved === ('midnight' as any)) return 'midnight-blue';
    if (saved === ('aurora' as any)) return 'dracula';
    return 'cyber-dark';
  });

  const setTheme = (newTheme: ThemeName) => {
    setThemeState(newTheme);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', theme !== 'light' && theme !== 'beige');
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    localStorage.setItem('ra-theme', theme);
  }, [theme]);

  const currentColors = THEMES[theme] || THEMES['cyber-dark'];

  return (
    <ThemeContext.Provider value={{ theme, colors: currentColors, setTheme }}>
      <div className={`w-full h-full ${currentColors.bgMain} ${currentColors.textPrimary} transition-colors duration-200`}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
