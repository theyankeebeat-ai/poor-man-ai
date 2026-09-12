import React, { useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
  useLocation
} from 'react-router-dom';
import AIAgentInterface from './AIAgentInterface';
import AIChatInterface from './AIChatInterface';
import {
  BrainEngine,
  ServerEngine,
  MCPEngine,
  SkillEngine,
  ToolsEngine,
  DatabaseEngine,
  WebBrowserEngine,
  WebAIEngine,
  ArchitectureEngine,
  RealAIEngine
} from './engines';
import { ThemeProvider, useTheme, THEMES, ThemeName } from './ThemeContext';
import {
  MessageSquare,
  GitMerge,
  Palette,
  ChevronDown,
  Brain,
  Server,
  Boxes,
  GraduationCap,
  Wrench,
  Database,
  Globe,
  Network,
  Cpu,
  Sparkles
} from 'lucide-react';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme, setTheme, colors } = useTheme();
  const [showThemePicker, setShowThemePicker] = useState(false);
  const location = useLocation();

  const navItems = [
    { path: '/agent', label: 'Agent Workflow', icon: <GitMerge className="w-3.5 h-3.5" /> },
    { path: '/chat', label: 'Chat Assistant', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { path: '/real-ai', label: 'Real AI Studio', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { path: '/architecture', label: 'Architecture & Tuning', icon: <Cpu className="w-3.5 h-3.5" /> },
    { path: '/webai', label: 'Web AI', icon: <Network className="w-3.5 h-3.5" /> },
    { path: '/browser', label: 'Web Browser', icon: <Globe className="w-3.5 h-3.5" /> },
    { path: '/brain', label: 'Brain', icon: <Brain className="w-3.5 h-3.5" /> },
    { path: '/server', label: 'Server', icon: <Server className="w-3.5 h-3.5" /> },
    { path: '/mcp', label: 'MCP', icon: <Boxes className="w-3.5 h-3.5" /> },
    { path: '/skill', label: 'Skill', icon: <GraduationCap className="w-3.5 h-3.5" /> },
    { path: '/tools', label: 'Tools', icon: <Wrench className="w-3.5 h-3.5" /> },
    { path: '/database', label: 'Database', icon: <Database className="w-3.5 h-3.5" /> }
  ];

  return (
    <div className={`flex flex-col h-screen w-full ${colors.bgMain} ${colors.textPrimary} font-sans transition-colors duration-200`}>
      {/* Top Universal Navbar */}
      <header className={`flex items-center justify-between px-6 py-2.5 ${colors.bgPanel} border-b ${colors.border} z-20`}>
        {/* Navigation Routed Links */}
        <div className="flex items-center gap-2 overflow-x-auto py-0.5">
          <nav className={`flex items-center p-0.5 rounded-xl ${colors.badgeBg} text-xs shadow-inner space-x-0.5`}>
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all shrink-0 ${
                    isActive
                      ? `${colors.accentMuted} shadow-sm font-semibold`
                      : `${colors.textMuted} hover:${colors.textPrimary}`
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

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
            <span className={`text-[11px] font-mono ${colors.textMuted}`}>{location.pathname}</span>
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
            <Route path="/" element={<Navigate to="/agent" replace />} />
            <Route path="/agent" element={<AIAgentInterface />} />
            <Route path="/chat" element={<AIChatInterface />} />
            <Route path="/real-ai" element={<RealAIEngine />} />
            <Route path="/architecture" element={<ArchitectureEngine />} />
            <Route path="/webai" element={<WebAIEngine />} />
            <Route path="/browser" element={<WebBrowserEngine />} />
            <Route path="/brain" element={<BrainEngine />} />
            <Route path="/server" element={<ServerEngine />} />
            <Route path="/mcp" element={<MCPEngine />} />
            <Route path="/skill" element={<SkillEngine />} />
            <Route path="/tools" element={<ToolsEngine />} />
            <Route path="/database" element={<DatabaseEngine />} />
            <Route path="*" element={<Navigate to="/agent" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ThemeProvider>
  );
};

export default App;
