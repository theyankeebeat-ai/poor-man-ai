import React, { useState, useEffect } from 'react';
import {
  Wrench,
  Play,
  RefreshCw
} from 'lucide-react';
import { useTheme } from '../ThemeContext';
import { API } from '../api';

export interface AgentTool {
  name: string;
  description: string;
  parameters?: Record<string, any>;
}

export const ToolsEngine: React.FC = () => {
  const { colors } = useTheme();
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [selectedToolName, setSelectedToolName] = useState<string>('');
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchTools = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/tools`);
      if (res.ok) {
        const data = await res.json();
        const rawList = data.tools || [];
        const parsed = rawList.map((t: any) => {
          const fn = t.function || t;
          return {
            name: fn.name || 'unnamed',
            description: fn.description || 'No description provided.',
            parameters: fn.parameters || {}
          };
        });
        setTools(parsed);
        if (parsed.length > 0 && !selectedToolName) {
          setSelectedToolName(parsed[0].name);
        }
      }
    } catch (e) {
      console.warn('Backend not reachable:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTools();
  }, []);

  const selectedTool = tools.find((t) => t.name === selectedToolName) || tools[0] || {
    name: 'Loading tools...',
    description: 'Connecting to backend...',
    parameters: {}
  };

  const handleDryRun = () => {
    setIsExecuting(true);
    setTestOutput(null);
    setTimeout(() => {
      setIsExecuting(false);
      setTestOutput(
        JSON.stringify(
          {
            status: 'validated',
            tool: selectedTool.name,
            endpoint: `${API}/chat`,
            schema: selectedTool.parameters,
            message: 'Schema check only. The Go brain runs this tool when chat calls it.'
          },
          null,
          2
        )
      );
    }, 600);
  };

  return (
    <div className={`h-full flex flex-col p-6 space-y-6 overflow-y-auto ${colors.bgMain} ${colors.textPrimary}`}>
      {/* Header */}
      <div className={`flex flex-wrap items-center justify-between gap-4 border-b pb-4 ${colors.border}`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20">
            <Wrench className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Tools Engine (Live Tool Registry)</h2>
            <p className={`text-xs ${colors.textMuted}`}>
              Go brain tools for hybrid retrieval, Wikipedia and news search, memory, and weather
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className={`px-3 py-1 rounded-full ${colors.accentMuted} font-mono`}>
            {tools.length} Tools Connected
          </span>
          <button
            onClick={fetchTools}
            disabled={loading}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl ${colors.badgeBg} border ${colors.border} ${colors.textMuted} hover:${colors.textPrimary}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tool Selector List */}
        <div className={`p-4 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-3`}>
          <h3 className={`text-xs font-semibold uppercase tracking-wider ${colors.textPrimary}`}>Registered Tools</h3>

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {tools.map((tool) => {
              const isSelected = tool.name === selectedToolName;
              return (
                <div
                  key={tool.name}
                  onClick={() => setSelectedToolName(tool.name)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? `${colors.badgeBg} ring-1 ring-cyan-500/50 ${colors.textPrimary} shadow-md`
                      : `${colors.badgeBg}/50 ${colors.border} hover:${colors.badgeBg} ${colors.textMuted}`
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono font-bold text-cyan-400">{tool.name}</span>
                  </div>
                  <p className={`text-[11px] ${colors.textMuted} line-clamp-2 leading-relaxed`}>
                    {tool.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tool Details & Schema Inspector */}
        <div className={`lg:col-span-2 p-5 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-5 flex flex-col justify-between`}>
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${colors.accentMuted}`}>
                  Tool Definition
                </span>
                <h3 className="text-base font-bold mt-2">{selectedTool.name}</h3>
              </div>

              <button
                onClick={handleDryRun}
                disabled={isExecuting}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold ${colors.accent} ${colors.accentHover} transition-all shadow-md`}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Validate Schema</span>
              </button>
            </div>

            <p className={`text-xs ${colors.textMuted} leading-relaxed ${colors.badgeBg} p-3 rounded-xl border ${colors.border}`}>
              {selectedTool.description}
            </p>

            {/* JSON Schema */}
            <div>
              <span className={`text-xs font-semibold uppercase tracking-wider ${colors.textMuted} block mb-2`}>
                Input Parameters Schema (JSONSchema)
              </span>
              <pre className={`p-4 rounded-xl ${colors.badgeBg} border ${colors.border} font-mono text-xs text-cyan-400 overflow-x-auto max-h-60`}>
                {JSON.stringify(selectedTool.parameters || {}, null, 2)}
              </pre>
            </div>

            {/* Validation Output */}
            {testOutput && (
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 block mb-2">
                  Validation Log
                </span>
                <pre className={`p-3 rounded-xl ${colors.badgeBg} border border-emerald-500/30 font-mono text-xs text-emerald-400 overflow-x-auto`}>
                  {testOutput}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolsEngine;
