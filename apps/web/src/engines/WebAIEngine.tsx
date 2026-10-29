import React, { useState } from 'react';
import {
  Network,
  Sparkles,
  Boxes,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Zap,
  RotateCcw,
  Database
} from 'lucide-react';
import { useTheme } from '../ThemeContext';
import { webAIOrchestrator, WebAISynthesis } from '../models/WebAI';
import { useNavigate } from 'react-router-dom';

export const WebAIEngine: React.FC = () => {
  const { colors } = useTheme();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [isFormulating, setIsFormulating] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<string | null>(null);
  const [synthesis, setSynthesis] = useState<WebAISynthesis | null>(null);

  const mcpNodes = [
    { id: 'duckduckgo', name: 'DuckDuckGo AI MCP', protocol: 'Stdio', status: 'Ready' },
    { id: 'google', name: 'Google AI Overview MCP', protocol: 'Stdio', status: 'Ready' },
    { id: 'bing', name: 'Bing Copilot MCP', protocol: 'SSE', status: 'Ready' },
    { id: 'yandex', name: 'Yandex Neuro MCP', protocol: 'Stdio', status: 'Ready' }
  ];

  const handleSynthesize = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim() || isFormulating) return;

    setIsFormulating(true);
    setSynthesis(null);
    setPipelineStage('Initiating Inter-MCP communication mesh...');

    try {
      const result = await webAIOrchestrator.formulateAnswer(query, (stage) => {
        setPipelineStage(stage);
      });
      setSynthesis(result);
    } catch (err) {
      console.error('Web AI synthesis failed:', err);
    } finally {
      setIsFormulating(false);
      setPipelineStage(null);
    }
  };

  return (
    <div className={`h-full flex flex-col p-6 space-y-6 overflow-y-auto ${colors.bgMain} ${colors.textPrimary}`}>
      {/* Header */}
      <div className={`flex flex-wrap items-center justify-between gap-4 border-b pb-4 ${colors.border}`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-fuchsia-600 text-white shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
            <Network className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">Web AI (Inter-MCP Consensus Model)</h2>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${colors.accentMuted} uppercase`}>
                Multi-Agent Mesh
              </span>
            </div>
            <p className={`text-xs ${colors.textMuted}`}>
              Coordinates parallel communication across DuckDuckGo, Google, Bing &amp; Yandex MCP nodes to formulate corroborated answers
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/database')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${colors.border} ${colors.badgeBg} text-xs ${colors.textMuted} hover:${colors.textPrimary} transition-colors`}
          >
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span>Indexed Consensus DB</span>
          </button>
        </div>
      </div>

      {/* Mesh Network Live Topology */}
      <div className={`p-5 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-4 shadow-sm`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider">
              Active Inter-MCP Bridge Topology
            </h3>
          </div>
          <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> 4/4 Nodes Linked
          </span>
        </div>

        {/* Node Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {mcpNodes.map((node) => (
            <div
              key={node.id}
              className={`p-3 rounded-xl ${colors.badgeBg} border ${colors.border} flex flex-col justify-between space-y-2 text-xs`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-cyan-400">{node.protocol}</span>
                <span className="text-[10px] text-emerald-400 font-mono">{node.status}</span>
              </div>
              <p className="font-semibold text-xs">{node.name}</p>
            </div>
          ))}
        </div>

        {/* Input Formulation Bar */}
        <form onSubmit={handleSynthesize} className="flex gap-2 pt-2">
          <div className="relative flex-1">
            <Sparkles className="w-4 h-4 text-cyan-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Ask Web AI anything (triggers cross-MCP multi-engine negotiation)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-2.5 rounded-xl ${colors.badgeBg} border ${colors.border} text-xs ${colors.textPrimary} placeholder:${colors.textMuted} focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-colors`}
            />
          </div>
          <button
            type="submit"
            disabled={!query.trim() || isFormulating}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl ${colors.accent} ${colors.accentHover} disabled:opacity-40 font-bold text-xs transition-all shadow-md`}
          >
            {isFormulating ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            <span>{isFormulating ? 'Formulating...' : 'Ask Web AI'}</span>
          </button>
        </form>

        {/* Quick query chips */}
        <div className={`flex flex-wrap items-center gap-2 text-[11px] ${colors.textMuted}`}>
          <span className="font-mono">Preset research prompts:</span>
          {[
            'Best practices for securing Node.js microservices',
            'Compare Next.js App Router vs Remix in 2026',
            'How does Model Context Protocol handle JSON-RPC streaming'
          ].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQuery(q)}
              className={`px-2.5 py-0.5 rounded-lg ${colors.badgeBg} border ${colors.border} hover:text-cyan-400 hover:border-cyan-500/30 transition-colors`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Live Formulation Progress Indicator */}
      {isFormulating && (
        <div className={`p-6 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-3`}>
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-semibold text-cyan-400">
              {pipelineStage || 'Formulating consensus...'}
            </span>
          </div>
          <div className={`w-full h-1.5 ${colors.badgeBg} rounded-full overflow-hidden`}>
            <div className="h-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-fuchsia-500 animate-pulse w-3/4 rounded-full" />
          </div>
        </div>
      )}

      {/* Formulated Multi-Engine Consensus Answer */}
      {synthesis && !isFormulating && (
        <div className="space-y-6">
          {/* Main Answer Card */}
          <div className={`p-6 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-4 shadow-xl`}>
            <div className={`flex items-center justify-between border-b ${colors.border} pb-3`}>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  Web AI Synthesized Consensus
                </h3>
              </div>
              <div className={`flex items-center gap-3 text-xs font-mono`}>
                <span className="text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Confidence: {(synthesis.confidenceScore * 100).toFixed(0)}%
                </span>
                <span className={colors.textMuted}>&bull;</span>
                <span className={colors.textMuted}>{synthesis.timestamp}</span>
              </div>
            </div>

            <div className="text-sm leading-relaxed whitespace-pre-wrap font-sans">
              {synthesis.consensusAnswer}
            </div>

            {/* Key Corroboration Takeaways */}
            <div className="pt-2">
              <span className="text-[11px] font-mono text-cyan-400 uppercase tracking-wider block mb-1.5">
                Consensus Verifications:
              </span>
              <ul className={`space-y-1 text-xs ${colors.textMuted}`}>
                {synthesis.keyInsights.map((insight, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Breakdown: Individual MCP Node Contributions */}
          <div className="space-y-3">
            <h3 className={`text-xs font-semibold uppercase tracking-wider ${colors.textPrimary}`}>
              Individual MCP Node Contributions ({synthesis.mcpContributions.length})
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {synthesis.mcpContributions.map((contrib, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border ${colors.border} ${colors.bgCard} space-y-2`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-cyan-400 font-mono">{contrib.engine}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${colors.badgeBg} border ${colors.border} ${colors.textMuted} font-mono`}>
                      Corroborated
                    </span>
                  </div>
                  <p className={`text-xs ${colors.textMuted} leading-relaxed`}>{contrib.keyPoints}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Aggregated Authoritative Citations */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className={`text-xs font-semibold uppercase tracking-wider ${colors.textPrimary}`}>
                Aggregated Authoritative Sources ({synthesis.aggregatedSources.length})
              </h3>
              <span className={`text-[11px] ${colors.textMuted} font-mono`}>Deduplicated Links</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {synthesis.aggregatedSources.map((src, i) => (
                <div
                  key={i}
                  className={`p-4 rounded-xl border ${colors.border} ${colors.bgCard} space-y-2 hover:border-cyan-500/30 transition-all flex flex-col justify-between`}
                >
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold leading-snug">{src.title}</h4>
                    <p className={`text-xs ${colors.textMuted} line-clamp-2 leading-relaxed`}>{src.snippet}</p>
                  </div>

                  <div className={`pt-2 border-t ${colors.border} flex items-center justify-between text-[11px]`}>
                    <span className={`${colors.textMuted} font-mono truncate max-w-[200px]`}>{src.url}</span>
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      <span>Citation</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebAIEngine;
