import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  BookOpen,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { useTheme } from '../ThemeContext';
import { API } from '../api';

export interface SkillItem {
  name: string;
  description: string;
  hooks?: string[];
  tools?: string[];
  phase?: string;
  priority?: number;
  enabled?: boolean;
}

export const SkillEngine: React.FC = () => {
  const { colors } = useTheme();
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [knowledgePacks, setKnowledgePacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'skills' | 'knowledge'>('all');

  const fetchSkillsAndKnowledge = async () => {
    setLoading(true);
    try {
      const [skillsRes, knowRes] = await Promise.all([
        fetch(`${API}/mcp/skills`),
        fetch(`${API}/mcp/knowledge`)
      ]);
      if (skillsRes.ok) {
        const sData = await skillsRes.json();
        setSkills(sData.skills || []);
      }
      if (knowRes.ok) {
        const kData = await knowRes.json();
        setKnowledgePacks(kData.packs || []);
      }
    } catch (e) {
      console.warn('Backend not reachable:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSkillsAndKnowledge();
  }, []);

  return (
    <div className={`h-full flex flex-col p-6 space-y-6 overflow-y-auto ${colors.bgMain} ${colors.textPrimary}`}>
      {/* Header */}
      <div className={`flex flex-wrap items-center justify-between gap-4 border-b pb-4 ${colors.border}`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Skill Engine (MCP Skills &amp; Knowledge Packs)</h2>
            <p className={`text-xs ${colors.textMuted}`}>
              Curated SOPs, domain knowledge playbooks, hooks, and tool routing from server/mcp/
            </p>
          </div>
        </div>

        {/* Action & Filter Pills */}
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 p-1 rounded-xl ${colors.badgeBg} border ${colors.border} text-xs`}>
            {(['all', 'skills', 'knowledge'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilter(mode)}
                className={`px-3 py-1 rounded-lg capitalize font-medium transition-all ${
                  filter === mode
                    ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-sm'
                    : `${colors.textMuted} hover:${colors.textPrimary}`
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <button
            onClick={fetchSkillsAndKnowledge}
            disabled={loading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl ${colors.badgeBg} border ${colors.border} text-xs ${colors.textMuted} hover:${colors.textPrimary}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync MCP</span>
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(filter === 'all' || filter === 'skills') &&
          skills.map((skill) => (
            <div
              key={skill.name}
              className={`p-5 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-3 relative group transition-all hover:border-emerald-500/40`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Phase: {skill.phase || 'Execution'} &bull; Priority {skill.priority ?? 50}
                  </span>
                  <h3 className="text-sm font-semibold mt-1.5">{skill.name}</h3>
                </div>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              </div>

              <p className={`text-xs ${colors.textMuted} line-clamp-3 leading-relaxed`}>
                {skill.description}
              </p>

              {skill.tools && skill.tools.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {skill.tools.map((t) => (
                    <span
                      key={t}
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${colors.badgeBg} text-cyan-400 border ${colors.border}`}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

        {(filter === 'all' || filter === 'knowledge') &&
          knowledgePacks.map((pack) => (
            <div
              key={pack.name}
              className={`p-5 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-3 relative group transition-all hover:border-indigo-500/40`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    Knowledge Playbook
                  </span>
                  <h3 className="text-sm font-semibold mt-1.5">{pack.name}</h3>
                </div>
                <BookOpen className="w-4 h-4 text-indigo-400 shrink-0" />
              </div>

              <p className={`text-xs ${colors.textMuted} font-mono text-[11px] ${colors.badgeBg} p-2.5 rounded-lg border ${colors.border} line-clamp-3`}>
                {pack.excerpt}
              </p>

              {pack.topics && pack.topics.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {pack.topics.map((tp: string) => (
                    <span
                      key={tp}
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${colors.badgeBg} ${colors.textMuted} border ${colors.border}`}
                    >
                      #{tp}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
};

export default SkillEngine;
