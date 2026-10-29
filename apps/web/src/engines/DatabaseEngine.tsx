import React, { useState, useEffect } from 'react';
import {
  Database,
  Search,
  Trash2,
  ExternalLink,
  Plus,
  Clock
} from 'lucide-react';
import { useTheme } from '../ThemeContext';
import { localDb, IndexRecord, SourceEngineCategory } from '../db/localIndexDb';

const SEED_DATA: Omit<IndexRecord, 'createdAt'>[] = [
  {
    id: 'rec-ddg-1',
    category: 'duckduckgo-ai',
    title: 'TypeScript 5.5 Decorators & Type Checking Improvements',
    query: 'TypeScript 5.5 new features',
    content: 'DuckAssist Overview: TypeScript 5.5 introduces inferred type predicates in control flow analysis, isolated declarations for rapid build outputs, and optimized editor startup latency.',
    sourceUrl: 'https://duckduckgo.com/?q=typescript+5.5&ia=chat',
    tags: ['typescript', 'dev', 'compiler'],
    timestamp: 'Today at 04:10 AM'
  },
  {
    id: 'rec-goog-1',
    category: 'google-ai',
    title: 'Vite 5 Bundle Splitting & ESM Dynamic Imports',
    query: 'Vite 5 bundle optimization techniques',
    content: 'Google AI Overview: Vite uses Rollup under the hood during build. Configure build.rollupOptions.output.manualChunks to slice large vendor modules like Lucide and React into distinct chunks.',
    sourceUrl: 'https://google.com/search?q=vite+5+bundle+optimization',
    tags: ['vite', 'performance', 'bundling'],
    timestamp: 'Today at 04:12 AM'
  },
  {
    id: 'rec-bing-1',
    category: 'bing-copilot',
    title: 'CVE-2023-45857 Axios SSRF Mitigation Path',
    query: 'Axios 0.21.1 CVE fix',
    content: 'Copilot AI Answer: Upgrade axios to version 1.7.4 or higher. Ensure request url validation happens before passing user inputs to axios instances.',
    sourceUrl: 'https://bing.com/copilot',
    tags: ['security', 'cve', 'npm'],
    timestamp: 'Today at 04:13 AM'
  },
  {
    id: 'rec-yandex-1',
    category: 'yandex-neuro',
    title: 'IndexedDB Performance & Multi-Index Key Ranges',
    query: 'IndexedDB compound indexes fast query',
    content: 'Yandex Neuro Summary: Compound indexes allow fast range scans without in-memory array filtering. Keep object store versions incremented cleanly in upgradeneeded events.',
    sourceUrl: 'https://yandex.com/search?text=indexeddb+indexes',
    tags: ['database', 'indexeddb', 'storage'],
    timestamp: 'Today at 04:14 AM'
  }
];

export const DatabaseEngine: React.FC = () => {
  const { colors } = useTheme();
  const [records, setRecords] = useState<IndexRecord[]>([]);
  const [activeCategory, setActiveCategory] = useState<SourceEngineCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newQuery, setNewQuery] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<SourceEngineCategory>('duckduckgo-ai');
  const [newTags, setNewTags] = useState('');

  const loadRecords = async () => {
    try {
      const all = await localDb.getAll(activeCategory === 'all' ? undefined : activeCategory);
      if (all.length === 0 && activeCategory === 'all') {
        for (const item of SEED_DATA) {
          await localDb.save(item);
        }
        const seeded = await localDb.getAll();
        setRecords(seeded);
      } else {
        setRecords(all);
      }
    } catch (e) {
      console.error('Failed to load records from IndexedDB:', e);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [activeCategory]);

  const handleSaveNewRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    await localDb.save({
      id: `manual-${Date.now()}`,
      category: newCategory,
      title: newTitle.trim(),
      query: newQuery.trim(),
      content: newContent.trim(),
      tags: newTags.split(',').map((t) => t.trim()).filter(Boolean),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    setNewTitle('');
    setNewQuery('');
    setNewContent('');
    setNewTags('');
    setShowAddModal(false);
    loadRecords();
  };

  const handleDelete = async (id: string) => {
    await localDb.delete(id);
    loadRecords();
  };

  const handleClearAll = async () => {
    if (confirm('Wipe all local IndexedDB cached knowledge?')) {
      await localDb.clearAll();
      setRecords([]);
    }
  };

  const getCategoryBadge = (cat: SourceEngineCategory) => {
    switch (cat) {
      case 'duckduckgo-ai':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-orange-500/10 text-orange-400 border border-orange-500/20">DuckDuckGo AI</span>;
      case 'google-ai':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">Google AI</span>;
      case 'bing-copilot':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">Bing Copilot</span>;
      case 'yandex-neuro':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20">Yandex Neuro</span>;
      case 'brain-memory':
        return <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-purple-500/10 text-purple-300 border border-purple-500/20">Brain Core</span>;
      default:
        return <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${colors.badgeBg} ${colors.textMuted} border ${colors.border}`}>General</span>;
    }
  };

  const filteredRecords = records.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.title.toLowerCase().includes(q) ||
      r.content.toLowerCase().includes(q) ||
      r.query.toLowerCase().includes(q) ||
      r.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className={`h-full flex flex-col p-6 space-y-6 overflow-y-auto ${colors.bgMain} ${colors.textPrimary}`}>
      {/* Header */}
      <div className={`flex flex-wrap items-center justify-between gap-4 border-b pb-4 ${colors.border}`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-600 to-emerald-600 text-white shadow-lg shadow-cyan-500/20">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Local Database (Categorized Information Index)</h2>
            <p className={`text-xs ${colors.textMuted}`}>Client-side IndexedDB storage partitioning answers &amp; citations by origin search engine</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(!showAddModal)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold ${colors.accent} ${colors.accentHover} shadow-md transition-all`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Index Entry</span>
          </button>
          <button
            onClick={handleClearAll}
            className={`p-1.5 rounded-xl border ${colors.border} ${colors.textMuted} hover:text-rose-400 hover:bg-rose-500/10 transition-colors`}
            title="Wipe IndexedDB database"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Add Entry Modal Form */}
      {showAddModal && (
        <form onSubmit={handleSaveNewRecord} className={`p-5 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-4`}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Save Information to Local Index</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Title / Summary Topic"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className={`p-2.5 rounded-xl ${colors.badgeBg} border ${colors.border} text-xs ${colors.textPrimary} focus:outline-none focus:ring-1 focus:ring-cyan-500`}
              required
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as SourceEngineCategory)}
              className={`p-2.5 rounded-xl ${colors.badgeBg} border ${colors.border} text-xs ${colors.textPrimary} focus:outline-none focus:ring-1 focus:ring-cyan-500`}
            >
              <option value="duckduckgo-ai">DuckDuckGo AI</option>
              <option value="google-ai">Google AI Overview</option>
              <option value="bing-copilot">Bing Copilot AI</option>
              <option value="yandex-neuro">Yandex Neuro AI</option>
              <option value="brain-memory">Brain Memory</option>
              <option value="manual-entry">Manual Entry</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Original query used"
              value={newQuery}
              onChange={(e) => setNewQuery(e.target.value)}
              className={`p-2.5 rounded-xl ${colors.badgeBg} border ${colors.border} text-xs ${colors.textPrimary} focus:outline-none focus:ring-1 focus:ring-cyan-500`}
            />
            <input
              type="text"
              placeholder="Tags (comma separated, e.g. dev, api, fix)"
              value={newTags}
              onChange={(e) => setNewTags(e.target.value)}
              className={`p-2.5 rounded-xl ${colors.badgeBg} border ${colors.border} text-xs ${colors.textPrimary} focus:outline-none focus:ring-1 focus:ring-cyan-500`}
            />
          </div>

          <textarea
            rows={3}
            placeholder="Synthesized content / snippet body..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            className={`w-full p-2.5 rounded-xl ${colors.badgeBg} border ${colors.border} text-xs ${colors.textPrimary} focus:outline-none focus:ring-1 focus:ring-cyan-500`}
            required
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className={`px-3 py-1.5 rounded-lg text-xs ${colors.textMuted} hover:${colors.textPrimary}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-4 py-1.5 rounded-lg text-xs ${colors.accent} ${colors.accentHover} font-semibold`}
            >
              Commit to IndexedDB
            </button>
          </div>
        </form>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Category Pills */}
        <div className={`flex flex-wrap items-center gap-1.5 p-1 rounded-xl ${colors.badgeBg} border ${colors.border} text-xs`}>
          {(
            [
              { id: 'all', label: 'All Sources' },
              { id: 'duckduckgo-ai', label: 'DuckDuckGo AI' },
              { id: 'google-ai', label: 'Google AI' },
              { id: 'bing-copilot', label: 'Bing Copilot' },
              { id: 'yandex-neuro', label: 'Yandex Neuro' },
              { id: 'brain-memory', label: 'Brain' }
            ] as const
          ).map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id as any)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                activeCategory === cat.id
                  ? `${colors.accentMuted} font-semibold shadow-sm`
                  : `${colors.textMuted} hover:${colors.textPrimary}`
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search filter input */}
        <div className="relative min-w-[220px]">
          <Search className={`w-3.5 h-3.5 ${colors.textMuted} absolute left-3 top-3`} />
          <input
            type="text"
            placeholder="Search index keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-8 pr-3 py-1.5 rounded-xl ${colors.badgeBg} border ${colors.border} text-xs ${colors.textPrimary} focus:outline-none focus:ring-1 focus:ring-cyan-500`}
          />
        </div>
      </div>

      {/* Index Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredRecords.map((record) => (
          <div
            key={record.id}
            className={`p-5 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-3.5 flex flex-col justify-between shadow-sm hover:border-cyan-500/30 transition-all`}
          >
            <div className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {getCategoryBadge(record.category)}
                    <span className={`text-[11px] ${colors.textMuted} flex items-center gap-1 font-mono`}>
                      <Clock className="w-3 h-3" /> {record.timestamp}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold leading-snug">{record.title}</h3>
                </div>

                <button
                  onClick={() => handleDelete(record.id)}
                  className={`${colors.textMuted} hover:text-rose-400 transition-colors p-1`}
                  title="Remove from index"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {record.query && (
                <div className={`text-[11px] ${colors.textMuted} font-mono ${colors.badgeBg} px-2.5 py-1 rounded-lg border ${colors.border}`}>
                  <span>Query: </span>
                  <span className="text-cyan-400">"{record.query}"</span>
                </div>
              )}

              <p className={`text-xs ${colors.textMuted} leading-relaxed`}>{record.content}</p>
            </div>

            <div className={`flex items-center justify-between pt-3 border-t ${colors.border} text-[11px]`}>
              <div className="flex flex-wrap gap-1.5">
                {record.tags.map((t, idx) => (
                  <span
                    key={idx}
                    className={`px-2 py-0.5 rounded text-[10px] ${colors.badgeBg} border ${colors.border} ${colors.textMuted} font-mono`}
                  >
                    #{t}
                  </span>
                ))}
              </div>

              {record.sourceUrl && (
                <a
                  href={record.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <span>Source</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        ))}

        {filteredRecords.length === 0 && (
          <div className={`col-span-full p-12 text-center border border-dashed ${colors.border} rounded-2xl`}>
            <p className={`text-sm ${colors.textMuted}`}>No indexed records found matching this category filter.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DatabaseEngine;
