import React, { useState } from 'react';
import {
  Search,
  Globe,
  ExternalLink,
  Sparkles,
  ArrowRight,
  Database,
  Check,
  RotateCcw,
  BookOpen,
  Copy,
  MessageSquare
} from 'lucide-react';
import { useTheme } from '../ThemeContext';
import { liveWebSearch, SearchEngineType } from '../services/liveWebSearch';
import { AISearchResponse } from '../mcp/common';
import { useNavigate } from 'react-router-dom';
import { readWebsiteUrl, WebReaderResult } from '../api';
import { localDb } from '../db/localIndexDb';

export const WebBrowserEngine: React.FC = () => {
  const { colors } = useTheme();
  const navigate = useNavigate();

  // Mode: Search vs Website Reader
  const [activeTab, setActiveTab] = useState<'reader' | 'search'>('reader');

  // Search state
  const [query, setQuery] = useState('');
  const [selectedEngine, setSelectedEngine] = useState<SearchEngineType>('duckduckgo');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<AISearchResponse | null>(null);
  const [searchAutoSaved, setSearchAutoSaved] = useState(false);

  // Website Reader state
  const [readerUrl, setReaderUrl] = useState('https://fastapi.tiangolo.com');
  const [renderJs, setRenderJs] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [readerResult, setReaderResult] = useState<WebReaderResult | null>(null);
  const [readerError, setReaderError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'clean' | 'raw'>('clean');
  const [copied, setCopied] = useState(false);
  const [dbSaved, setDbSaved] = useState(false);

  const engines: { id: SearchEngineType; name: string; badge: string; color: string }[] = [
    { id: 'duckduckgo', name: 'DuckDuckGo AI', badge: 'DuckAssist', color: 'border-orange-500/40 text-orange-400' },
    { id: 'google', name: 'Google AI', badge: 'AI Overview', color: 'border-blue-500/40 text-blue-400' },
    { id: 'bing', name: 'Bing Copilot', badge: 'Copilot Mode', color: 'border-cyan-500/40 text-cyan-300' },
    { id: 'yandex', name: 'Yandex Neuro', badge: 'Neuro AI', color: 'border-rose-500/40 text-rose-400' }
  ];

  const quickPresets = [
    { label: 'FastAPI Docs', url: 'https://fastapi.tiangolo.com' },
    { label: 'React.dev', url: 'https://react.dev' },
    { label: 'Hacker News', url: 'https://news.ycombinator.com' },
    { label: 'Wikipedia AI', url: 'https://en.wikipedia.org/wiki/Artificial_intelligence' },
    { label: 'Python.org', url: 'https://python.org' }
  ];

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim() || isSearching) return;

    setIsSearching(true);
    setSearchResults(null);
    setSearchAutoSaved(false);

    try {
      const res = await liveWebSearch.search(query.trim(), selectedEngine);

      setSearchResults(res);

      if (res.aiOverviewText) {
        try {
          await localDb.save({
            id: `rec-${res.engine}-${Date.now()}`,
            category: `${selectedEngine}-ai` as any,
            title: `${selectedEngine.toUpperCase()} AI: ${query.slice(0, 40)}`,
            query: query.trim(),
            content: res.aiOverviewText,
            sourceUrl: res.sources[0]?.url,
            tags: ['ai-search', selectedEngine, 'consensus'],
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
          setSearchAutoSaved(true);
        } catch {
          // ignore cache err
        }
      }
    } catch (err) {
      console.error('Search query failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleReadWebsite = async (overrideUrl?: string) => {
    const targetUrl = (overrideUrl || readerUrl).trim();
    if (!targetUrl || isReading) return;

    setIsReading(true);
    setReaderError(null);
    setReaderResult(null);
    setDbSaved(false);

    try {
      const result = await readWebsiteUrl(targetUrl, renderJs, forceRefresh);
      setReaderResult(result);

      if (result.markdown) {
        try {
          await localDb.save({
            id: `webpage-${Date.now()}`,
            category: 'duckduckgo-ai',
            title: result.title || `Scraped Page: ${targetUrl.slice(0, 30)}`,
            query: targetUrl,
            content: result.markdown.slice(0, 3000),
            sourceUrl: result.url,
            tags: ['web-reader', result.method, 'page-extract'],
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
          setDbSaved(true);
        } catch {
          // ignore db save error
        }
      }
    } catch (err: any) {
      setReaderError(err.message || 'Failed to read website');
    } finally {
      setIsReading(false);
    }
  };

  const copyToClipboard = () => {
    if (!readerResult?.markdown) return;
    navigator.clipboard.writeText(readerResult.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendToChatForAnalysis = () => {
    if (!readerResult) return;
    const prompt = `Please summarize and analyze this website:\n\nURL: ${readerResult.url}\nTitle: ${readerResult.title}\n\nKey Content:\n${readerResult.markdown.slice(0, 6000)}`;
    sessionStorage.setItem('pending_chat_prompt', prompt);
    navigate('/chat');
  };

  const isUrlLike = (text: string) => {
    return /^https?:\/\//i.test(text.trim()) || /^[a-z0-9-]+\.[a-z]{2,}/i.test(text.trim());
  };

  return (
    <div className={`h-full flex flex-col p-6 space-y-6 overflow-y-auto ${colors.bgMain} ${colors.textPrimary}`}>
      {/* Header */}
      <div className={`flex flex-wrap items-center justify-between gap-4 border-b pb-4 ${colors.border}`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-600 text-white shadow-lg shadow-cyan-500/20">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">Web Browser &amp; Reader Engine</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Skills: web-reader + playwright
              </span>
            </div>
            <p className={`text-xs ${colors.textMuted}`}>
              Full-featured website scraper, DOM content extractor, JavaScript SPA browser, and multi-engine AI search
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Main Mode Tabs */}
          <div className={`flex ${colors.badgeBg} border ${colors.border} p-1 rounded-xl`}>
            <button
              onClick={() => setActiveTab('reader')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'reader'
                  ? `${colors.accent} font-bold shadow-md`
                  : `${colors.textMuted} hover:${colors.textPrimary}`
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Website Reader</span>
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'search'
                  ? `${colors.accent} font-bold shadow-md`
                  : `${colors.textMuted} hover:${colors.textPrimary}`
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Multi-Engine Search</span>
            </button>
          </div>

          <button
            onClick={() => navigate('/database')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${colors.border} hover:opacity-80 ${colors.badgeBg} text-xs ${colors.textMuted} transition-colors`}
          >
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span>Saved Pages</span>
          </button>
        </div>
      </div>

      {/* ================= MODE 1: WEBSITE READER ================= */}
      {activeTab === 'reader' && (
        <div className="space-y-6">
          <div className={`p-5 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-4 shadow-sm`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`text-xs ${colors.textMuted} font-mono uppercase flex items-center gap-1.5`}>
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                <span>Direct Website Reader &amp; Clean Content Parser</span>
              </span>

              {/* Toggles */}
              <div className="flex items-center gap-4 text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={renderJs}
                    onChange={(e) => setRenderJs(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-zinc-700 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className={renderJs ? 'text-cyan-400 font-medium' : colors.textMuted}>
                    Render JavaScript (Playwright Chromium)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={forceRefresh}
                    onChange={(e) => setForceRefresh(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-zinc-700 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className={forceRefresh ? 'text-amber-400 font-medium' : colors.textMuted}>
                    Bypass Cache
                  </span>
                </label>
              </div>
            </div>

            {/* URL Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleReadWebsite();
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <Globe className={`w-4 h-4 ${colors.textMuted} absolute left-3.5 top-3.5`} />
                <input
                  type="url"
                  placeholder="https://example.com or any documentation URL..."
                  value={readerUrl}
                  onChange={(e) => setReaderUrl(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl ${colors.badgeBg} border ${colors.border} text-xs ${colors.textPrimary} placeholder:${colors.textMuted} focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-colors`}
                />
              </div>
              <button
                type="submit"
                disabled={!readerUrl.trim() || isReading}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl ${colors.accent} ${colors.accentHover} disabled:opacity-40 font-bold text-xs transition-all shadow-md`}
              >
                {isReading ? <RotateCcw className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                <span>{isReading ? 'Extracting...' : 'Read & Parse Website'}</span>
              </button>
            </form>

            {/* Quick Presets */}
            <div className={`flex flex-wrap items-center gap-2 text-[11px] ${colors.textMuted} pt-1`}>
              <span className="font-mono">Quick Sites:</span>
              {quickPresets.map((preset) => (
                <button
                  key={preset.url}
                  type="button"
                  onClick={() => {
                    setReaderUrl(preset.url);
                    handleReadWebsite(preset.url);
                  }}
                  className={`px-2.5 py-0.5 rounded-lg ${colors.badgeBg} border ${colors.border} hover:text-cyan-400 hover:border-cyan-500/30 transition-colors`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reading in progress */}
          {isReading && (
            <div className={`p-8 rounded-2xl border ${colors.border} ${colors.bgCard} flex flex-col items-center justify-center space-y-3`}>
              <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium">
                {renderJs ? 'Launching Playwright Chromium & rendering dynamic DOM...' : 'Fetching website & cleaning boilerplate with BeautifulSoup...'}
              </p>
              <span className={`text-[11px] ${colors.textMuted} font-mono`}>
                Extracting article text &bull; stripping scripts/ads &bull; formatting markdown
              </span>
            </div>
          )}

          {/* Reader Error */}
          {readerError && !isReading && (
            <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs">
              <span className="font-bold">Error reading website:</span> {readerError}
            </div>
          )}

          {/* Reader Result View */}
          {readerResult && !isReading && (
            <div className={`rounded-2xl border ${colors.border} ${colors.bgCard} overflow-hidden shadow-lg`}>
              {/* Result Meta Bar */}
              <div className={`p-4 border-b ${colors.border} ${colors.badgeBg} flex flex-wrap items-center justify-between gap-3`}>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold">{readerResult.title}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
                      method: {readerResult.method}
                    </span>
                    {dbSaved && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" /> Indexed
                      </span>
                    )}
                  </div>
                  <div className={`flex items-center gap-3 text-[11px] ${colors.textMuted}`}>
                    <a
                      href={readerResult.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-cyan-400 flex items-center gap-1 truncate max-w-md"
                    >
                      <span className="truncate">{readerResult.url}</span>
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                    <span>&bull;</span>
                    <span>{readerResult.chars.toLocaleString()} chars</span>
                    <span>&bull;</span>
                    <span>~{Math.round(readerResult.chars / 5)} words</span>
                  </div>
                </div>

                {/* Reader Action Buttons */}
                <div className="flex items-center gap-2">
                  <div className={`flex ${colors.badgeBg} border ${colors.border} p-0.5 rounded-lg text-xs`}>
                    <button
                      onClick={() => setViewMode('clean')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        viewMode === 'clean' ? `${colors.accentMuted} font-semibold` : `${colors.textMuted} hover:${colors.textPrimary}`
                      }`}
                    >
                      Formatted
                    </button>
                    <button
                      onClick={() => setViewMode('raw')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        viewMode === 'raw' ? `${colors.accentMuted} font-semibold` : `${colors.textMuted} hover:${colors.textPrimary}`
                      }`}
                    >
                      Markdown
                    </button>
                  </div>

                  <button
                    onClick={copyToClipboard}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${colors.badgeBg} border ${colors.border} text-xs ${colors.textMuted} hover:${colors.textPrimary} transition-colors`}
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>

                  <button
                    onClick={sendToChatForAnalysis}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-xs text-white font-bold transition-all shadow-md"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Analyze with Agent</span>
                  </button>
                </div>
              </div>

              {/* Reader Body */}
              <div className="p-6 max-h-[600px] overflow-y-auto">
                {viewMode === 'raw' ? (
                  <pre className={`text-xs font-mono whitespace-pre-wrap leading-relaxed ${colors.badgeBg} p-4 rounded-xl border ${colors.border}`}>
                    {readerResult.markdown}
                  </pre>
                ) : (
                  <div className="text-xs leading-relaxed whitespace-pre-wrap font-sans space-y-3">
                    {readerResult.markdown}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= MODE 2: MULTI-ENGINE SEARCH ================= */}
      {activeTab === 'search' && (
        <div className="space-y-6">
          {/* Engine Selection & Search Form */}
          <div className={`p-5 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-4 shadow-sm`}>
            {/* Engine selector tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs ${colors.textMuted} mr-2 font-mono uppercase`}>Select Engine:</span>
              {engines.map((eng) => {
                const isSelected = selectedEngine === eng.id;
                return (
                  <button
                    key={eng.id}
                    onClick={() => setSelectedEngine(eng.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                      isSelected
                        ? `${eng.color} ${colors.badgeBg} shadow-md font-semibold ring-1 ring-current`
                        : `${colors.border} ${colors.badgeBg}/60 ${colors.textMuted} hover:${colors.textPrimary}`
                    }`}
                  >
                    <span>{eng.name}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/30 font-mono">
                      {eng.badge}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search Input Bar */}
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className={`w-4 h-4 ${colors.textMuted} absolute left-3.5 top-3.5`} />
                <input
                  type="text"
                  placeholder="Enter any search question or research prompt..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl ${colors.badgeBg} border ${colors.border} text-xs ${colors.textPrimary} placeholder:${colors.textMuted} focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-colors`}
                />
              </div>
              <button
                type="submit"
                disabled={!query.trim() || isSearching}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl ${colors.accent} ${colors.accentHover} disabled:opacity-40 font-bold text-xs transition-all shadow-md`}
              >
                {isSearching ? <RotateCcw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                <span>{isSearching ? 'Browsing...' : 'Search & Synthesize'}</span>
              </button>
            </form>

            {/* Notice if query looks like a URL */}
            {isUrlLike(query) && (
              <div className={`flex items-center justify-between p-2.5 rounded-xl ${colors.accentMuted} border text-xs`}>
                <span>
                  Tip: That looks like a direct URL! Would you like to read and extract the page directly?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setReaderUrl(query);
                    setActiveTab('reader');
                    handleReadWebsite(query);
                  }}
                  className={`px-3 py-1 rounded-lg ${colors.accent} ${colors.accentHover} font-bold text-xs transition-colors`}
                >
                  Read Website Directly
                </button>
              </div>
            )}

            {/* Suggested Quick Queries */}
            <div className={`flex flex-wrap items-center gap-2 text-[11px] ${colors.textMuted} pt-1`}>
              <span className="font-mono">Quick tests:</span>
              {['Latest React 19 release', 'FastAPI best practices async', 'Quantum computing qubits 2026'].map(
                (q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      setQuery(q);
                    }}
                    className={`px-2.5 py-0.5 rounded-lg ${colors.badgeBg} border ${colors.border} hover:text-cyan-400 hover:border-cyan-500/30 transition-colors`}
                  >
                    {q}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Loading state */}
          {isSearching && (
            <div className={`p-8 rounded-2xl border ${colors.border} ${colors.bgCard} flex flex-col items-center justify-center space-y-3`}>
              <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs">Dispatching browser agent to {selectedEngine.toUpperCase()}...</p>
              <span className={`text-[11px] ${colors.textMuted} font-mono`}>Fetching page DOM &bull; parsing AI overview &bull; extracting citations</span>
            </div>
          )}

          {/* Answer & Results Section */}
          {searchResults && !isSearching && (
            <div className="space-y-6">
              {/* AI Synthesized Answer Card */}
              <div className={`p-6 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-3 relative shadow-lg`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">
                      {searchResults.engine} Synthesized Response
                    </h3>
                  </div>

                  {searchAutoSaved && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                      <Check className="w-3 h-3" /> Auto-Indexed in Local DB
                    </span>
                  )}
                </div>

                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {searchResults.aiOverviewText}
                </p>
              </div>

              {/* Web Reference Sources */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className={`text-xs font-semibold uppercase tracking-wider ${colors.textPrimary}`}>
                    Verified Web Sources ({searchResults.sources.length})
                  </h3>
                  <span className={`text-[11px] ${colors.textMuted} font-mono`}>Live Web Retrieval</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {searchResults.sources.map((src, i) => (
                    <div
                      key={i}
                      className={`p-4 rounded-xl border ${colors.border} ${colors.bgCard} space-y-2 hover:border-cyan-500/30 transition-all flex flex-col justify-between`}
                    >
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold leading-snug">{src.title}</h4>
                        <p className={`text-xs ${colors.textMuted} line-clamp-3 leading-relaxed`}>{src.snippet}</p>
                      </div>

                      <div className={`pt-2 border-t ${colors.border} flex items-center justify-between text-[11px]`}>
                        <span className={`${colors.textMuted} font-mono truncate max-w-[160px]`}>{src.url}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setReaderUrl(src.url);
                              setActiveTab('reader');
                              handleReadWebsite(src.url);
                            }}
                            className="text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1 font-medium"
                          >
                            <BookOpen className="w-3 h-3" />
                            <span>Read Page</span>
                          </button>
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${colors.textMuted} hover:${colors.textPrimary} flex items-center gap-1`}
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WebBrowserEngine;
