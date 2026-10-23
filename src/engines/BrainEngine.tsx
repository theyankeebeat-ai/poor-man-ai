import React, { useState, useEffect } from 'react';
import {
  Brain as BrainIcon,
  Sparkles,
  Zap,
  Activity,
  Database,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';
import { useTheme } from '../ThemeContext';
import { fetchMemory, API } from '../api';
import type { MemoryFact } from '../types';

interface HfFile {
  path: string;
  bytes: number;
  kind: string;
  url: string;
}

interface HfCatalog {
  root: string;
  exists: boolean;
  absolute?: string;
  files: HfFile[];
  file_count?: number;
  total_bytes?: number;
}

interface HfPreview {
  path: string;
  bytes: number;
  kind: string;
  url: string;
  text?: string;
  rows?: number;
  lines?: number;
  truncated?: boolean;
}

export const BrainEngine: React.FC = () => {
  const { colors } = useTheme();
  const [temperature, setTemperature] = useState<number>(0.7);
  const [topP, setTopP] = useState<number>(0.95);
  const [activeReasoningMode, setActiveReasoningMode] = useState<'deep' | 'balanced' | 'fast'>('deep');
  const [neurons, setNeurons] = useState<any>(null);
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [hfCatalog, setHfCatalog] = useState<HfCatalog | null>(null);
  const [hfPreview, setHfPreview] = useState<HfPreview | null>(null);
  const [hfQuery, setHfQuery] = useState('');
  const [hfAnswer, setHfAnswer] = useState<string | null>(null);
  const [hfBusy, setHfBusy] = useState(false);
  const [cloudNote, setCloudNote] = useState<string | null>(null);

  const loadBrainData = async () => {
    setLoading(true);
    try {
      const memoryFacts = await fetchMemory();
      setFacts(memoryFacts);

      const nRes = await fetch(`${API}/mcp/neurons`);
      if (nRes.ok) {
        const nData = await nRes.json();
        setNeurons(nData);
      }

      const hfRes = await fetch(`${API}/api/brain/hf`);
      if (hfRes.ok) {
        setHfCatalog(await hfRes.json());
      }

      const cloudRes = await fetch(`${API}/api/backends`);
      if (cloudRes.ok) {
        const cloud = await cloudRes.json();
        const appwriteFiles = cloud.appwrite?.files;
        const supabaseFiles = cloud.supabase?.files;
        setCloudNote(
          `Appwrite hf: ${cloud.appwrite?.ok ? `${appwriteFiles ?? 0} files` : 'offline'} · Supabase hf: ${cloud.supabase?.ok ? `${supabaseFiles ?? 0} files` : 'offline'} · API: ${cloud.render?.url || 'Render'}`
        );
      }
    } catch (err) {
      console.warn('Backend not yet reachable:', err);
    } finally {
      setLoading(false);
    }
  };

  const openHfFile = async (path: string) => {
    setHfBusy(true);
    try {
      const res = await fetch(`${API}/api/brain/hf/file?path=${encodeURIComponent(path)}`);
      if (res.ok) setHfPreview(await res.json());
    } finally {
      setHfBusy(false);
    }
  };

  const runHfQuery = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = hfQuery.trim();
    if (!query) return;
    setHfBusy(true);
    setHfAnswer(null);
    try {
      const res = await fetch(`${API}/api/webai/hf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      if (!res.ok) {
        setHfAnswer(`Snapshot query failed (${res.status}).`);
        return;
      }
      const data = await res.json();
      setHfAnswer(data.answer as string);
    } catch (err) {
      setHfAnswer('The API on port 8000 did not answer.');
    } finally {
      setHfBusy(false);
    }
  };

  useEffect(() => {
    loadBrainData();
  }, []);

  return (
    <div className={`h-full flex flex-col p-6 space-y-6 overflow-y-auto ${colors.bgMain} ${colors.textPrimary}`}>
      {/* Header */}
      <div className={`flex flex-wrap items-center justify-between gap-4 border-b pb-4 ${colors.border}`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/20">
            <BrainIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Brain Engine (Cognitive Core &amp; Memory)</h2>
            <p className={`text-xs ${colors.textMuted}`}>Neural routing banks, persistent memory JSONL store, and cognitive hyperparameters</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadBrainData}
            disabled={loading}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs ${colors.accentMuted} hover:opacity-80 transition-colors`}
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>Reload Brain State</span>
          </button>
        </div>
      </div>

      {/* Grid: Reasoning Controls & Memory State */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Parametric Hyperparameters */}
        <div className={`p-5 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-5 shadow-sm`}>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">Cognitive Controls</h3>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <div className="flex justify-between mb-1.5">
                <span className={colors.textMuted}>Temperature (Variance)</span>
                <span className="font-mono text-purple-400 font-bold">{temperature}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1.5">
                <span className={colors.textMuted}>Top-P Nucleus Sampling</span>
                <span className="font-mono text-purple-400 font-bold">{topP}</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={topP}
                onChange={(e) => setTopP(parseFloat(e.target.value))}
                className="w-full accent-purple-500 cursor-pointer"
              />
            </div>

            <div>
              <span className={`block mb-2 ${colors.textMuted}`}>Thought Depth Strategy</span>
              <div className="grid grid-cols-3 gap-2">
                {(['fast', 'balanced', 'deep'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setActiveReasoningMode(mode)}
                    className={`py-2 rounded-lg text-xs capitalize font-medium border transition-all ${
                      activeReasoningMode === mode
                        ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                        : `${colors.badgeBg} ${colors.border} ${colors.textMuted} hover:${colors.textPrimary}`
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Context & Attention Map */}
        <div className={`p-5 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-4 shadow-sm`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold uppercase tracking-wider">Neural Routing Banks</h3>
            </div>
            <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
              <CheckCircle2 className="w-3 h-3" /> Ready
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {neurons?.banks ? (
              (Array.isArray(neurons.banks) ? neurons.banks : Object.keys(neurons.banks)).map(
                (bankName: string) => (
                <div key={bankName} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="capitalize">{String(bankName).replace(/^crew:/, 'crew ')} net</span>
                    <span className="font-mono text-indigo-400">
                      {neurons.arch || '14x32x16x1'}
                      {neurons.params_per_net ? ` · ${neurons.params_per_net}w` : ''}
                    </span>
                  </div>
                  <div className={`w-full h-1.5 rounded-full ${colors.badgeBg} overflow-hidden`}>
                    <div className="h-full bg-indigo-500 rounded-full w-4/5" />
                  </div>
                </div>
              ))
            ) : (
              <div className={`${colors.textMuted} italic py-4`}>
                Local routing neural nets will display here once server is active.
              </div>
            )}
          </div>
        </div>

        {/* Brain Architecture Spec */}
        <div className={`p-5 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-4 shadow-sm`}>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">Architecture Insights</h3>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className={`p-3 rounded-xl ${colors.badgeBg} border ${colors.border}`}>
              <span className="font-mono text-purple-400 font-bold block mb-1">Local Heuristic Brain</span>
              <p className={`text-[11px] ${colors.textMuted}`}>
                Operates without paid keys for simple queries, routing to local reasoner, calc, memory recall, and search.
              </p>
            </div>

            <div className={`p-3 rounded-xl ${colors.badgeBg} border ${colors.border}`}>
              <span className="font-mono text-cyan-400 font-bold block mb-1">Crew Specialist Mesh</span>
              <p className={`text-[11px] ${colors.textMuted}`}>
                Coordinates specialists (facts, howto, gap, debate, skeptic, verifier) on one shared blackboard.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className={`p-5 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-4`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-fuchsia-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">
              Hugging Face snapshot
              {hfCatalog?.file_count != null ? ` (${hfCatalog.file_count} files)` : ''}
            </h3>
          </div>
          <span className={`text-xs ${colors.textMuted} font-mono`}>
            {hfCatalog?.absolute || 'hf/'}
            {hfCatalog?.total_bytes != null ? ` · ${(hfCatalog.total_bytes / 1_000_000).toFixed(1)} MB` : ''}
          </span>
        </div>
        {cloudNote && (
          <p className={`text-[11px] font-mono ${colors.textMuted}`}>{cloudNote}</p>
        )}

        <form onSubmit={runHfQuery} className="flex gap-2">
          <input
            value={hfQuery}
            onChange={(e) => setHfQuery(e.target.value)}
            placeholder="Query BERT-tiny tokenizer against WikiText-2"
            className={`flex-1 px-3 py-2 rounded-xl border text-xs ${colors.border} ${colors.badgeBg} ${colors.textPrimary}`}
          />
          <button
            type="submit"
            disabled={hfBusy}
            className="px-3 py-2 rounded-xl text-xs font-medium bg-purple-600 text-white disabled:opacity-50"
          >
            Run
          </button>
        </form>
        {hfAnswer && (
          <pre className={`text-[11px] whitespace-pre-wrap max-h-48 overflow-y-auto p-3 rounded-xl border ${colors.border} ${colors.badgeBg}`}>
            {hfAnswer}
          </pre>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {hfCatalog?.files?.length ? (
              hfCatalog.files.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => openHfFile(file.path)}
                  className={`w-full text-left px-3 py-2 rounded-xl border text-[11px] font-mono ${colors.border} ${colors.badgeBg} hover:border-purple-500/40`}
                >
                  <span className="text-purple-300">{file.kind}</span>
                  <span className="mx-2">{file.path}</span>
                  <span className={colors.textMuted}>{(file.bytes / 1000).toFixed(0)} KB</span>
                </button>
              ))
            ) : (
              <p className={`text-xs italic ${colors.textMuted}`}>
                hf/ is not visible. Start the API on port 8000 and reload.
              </p>
            )}
          </div>
          <div className={`p-3 rounded-xl border ${colors.border} ${colors.badgeBg} max-h-72 overflow-y-auto`}>
            {hfPreview ? (
              <div className="space-y-2 text-[11px]">
                <div className="flex items-center justify-between gap-2 font-mono">
                  <span>{hfPreview.path}</span>
                  <a className="text-cyan-400 hover:underline" href={`${API}${hfPreview.url}`} target="_blank" rel="noreferrer">
                    open file
                  </a>
                </div>
                <p className={colors.textMuted}>
                  {hfPreview.kind}
                  {hfPreview.rows != null ? ` · ${hfPreview.rows} rows` : ''}
                  {hfPreview.lines != null ? ` · ${hfPreview.lines} lines` : ''}
                  {hfPreview.truncated ? ' · preview truncated' : ''}
                </p>
                <pre className="whitespace-pre-wrap">{hfPreview.text}</pre>
              </div>
            ) : (
              <p className={`text-xs italic ${colors.textMuted}`}>Select a file to read it from hf/.</p>
            )}
          </div>
        </div>
      </div>

      {/* Persistent Long-Term Memory Section */}
      <div className={`p-5 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">
              Persistent Knowledge Memory (JSONL: {facts.length} Facts)
            </h3>
          </div>
          <span className={`text-xs ${colors.textMuted} font-mono`}>Location: server/data/memory.jsonl</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto">
          {facts.length > 0 ? (
            facts.map((fact, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-xl border ${colors.border} ${colors.badgeBg} hover:border-purple-500/40 transition-colors text-xs space-y-1`}
              >
                <div className={`flex items-center justify-between text-[10px] ${colors.textMuted} font-mono`}>
                  <span>Fact #{idx + 1}</span>
                  <span>{fact.ts || 'Saved'}</span>
                </div>
                <p className="leading-snug">{fact.fact}</p>
                {fact.source_url && (
                  <a
                    href={fact.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-cyan-400 hover:underline truncate block"
                  >
                    {fact.source_url}
                  </a>
                )}
              </div>
            ))
          ) : (
            <div className={`p-6 text-center ${colors.textMuted} italic col-span-2`}>
              No memories recorded yet. Ask the agent to remember facts or run research queries to accumulate memory.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BrainEngine;
