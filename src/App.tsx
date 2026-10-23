import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AIChatInterface from './AIChatInterface';
import { ThemeProvider, useTheme, THEMES, ThemeName } from './ThemeContext';
import { Palette, ChevronDown } from 'lucide-react';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme, setTheme, colors } = useTheme();
  const [showThemePicker, setShowThemePicker] = useState(false);

  return (
    <div className={`flex flex-col h-screen w-full ${colors.bgMain} ${colors.textPrimary} font-sans transition-colors duration-200`}>
      <header className={`flex items-center justify-between px-6 py-2.5 ${colors.bgPanel} border-b ${colors.border} z-20`}>
        <div className="text-sm font-semibold tracking-tight">Poor Man AI</div>

        {/* Right: Theme Selector Dropdown & Status */}
        <div className="flex items-center gap-3 shrink-0 ml-3">
          {/* Theme Selector Popover */}
          <div className="relative">
            <button
              onClick={() => setShowThemePicker(!showThemePicker)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${colors.badgeBg} border ${colors.border} ${colors.textMuted} hover:${colors.textPrimary} transition-colors`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{THEMES[theme].name}</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {showThemePicker && (
              <div className={`absolute right-0 mt-2 w-48 rounded-xl ${colors.bgPanel} border ${colors.border} shadow-2xl p-1.5 z-50 text-xs space-y-1`}>
                <div className={`px-2 py-1 text-[10px] font-mono uppercase tracking-wider ${colors.textMuted}`}>
                  Select Theme
                </div>
                {(Object.keys(THEMES) as ThemeName[]).map((tKey) => {
                  const t = THEMES[tKey];
                  const isSelected = tKey === theme;
                  return (
                    <button
                      key={tKey}
                      onClick={() => {
                        setTheme(tKey);
                        setShowThemePicker(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                        isSelected
                          ? `${colors.accentMuted} font-medium`
                          : `${colors.textMuted} hover:${colors.textPrimary} hover:bg-black/10`
                      }`}
                    >
                      <span>{t.name}</span>
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className={`text-[11px] font-mono ${colors.textMuted}`}>/chat</span>
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/chat" element={<AIChatInterface />} />
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ThemeProvider>
  );
};

export default App;
