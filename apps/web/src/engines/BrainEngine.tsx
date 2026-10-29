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

export const BrainEngine: React.FC = () => {
  const { colors } = useTheme();
  const [temperature, setTemperature] = useState<number>(0.7);
  const [topP, setTopP] = useState<number>(0.95);
  const [activeReasoningMode, setActiveReasoningMode] = useState<'deep' | 'balanced' | 'fast'>('deep');
  const [neurons, setNeurons] = useState<any>(null);
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

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
    } catch (err) {
      console.warn('Backend not yet reachable:', err);
    } finally {
      setLoading(false);
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

      {/* Persistent Long-Term Memory Section */}
      <div className={`p-5 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">
              Persistent Knowledge Memory (JSONL: {facts.length} Facts)
            </h3>
          </div>
          <span className={`text-xs ${colors.textMuted} font-mono`}>Location: data/memory.jsonl</span>
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
