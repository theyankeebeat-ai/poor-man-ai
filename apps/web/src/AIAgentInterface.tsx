import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Terminal,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronRight,
  ChevronDown,
  Layers,
  Sparkles,
  Bot,
  Copy,
  Check,
  Flame,
  ArrowRight,
  Radio,
  Share2,
  Scale
} from 'lucide-react';
import { useTheme } from './ThemeContext';

// --- Type Definitions ---

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ToolCall {
  id: string;
  name: string;
  params: Record<string, any>;
  result?: Record<string, any> | string;
  durationMs?: number;
}

export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  status: StepStatus;
  thoughtProcess?: string[];
  toolCalls?: ToolCall[];
  tokensUsed?: number;
  duration?: string;
  output?: string;
}

export interface AgentTask {
  id: string;
  title: string;
  model: string;
  prompt: string;
  createdAt: string;
  totalTokens: number;
  status: StepStatus;
  steps: WorkflowStep[];
}

const INITIAL_TASK: AgentTask = {
  id: 'TASK-2026-AUTON-8812',
  title: 'Audit Repository Security & Generate Auto-Fix PR',
  model: 'Poor Man Autonomous Brain v1',
  prompt: 'Scan workspace for high-severity CVEs, evaluate patch feasibility against lockfiles, synthesize fix code, and draft PR report.',
  createdAt: '2026-09-10 03:45:12',
  totalTokens: 14850,
  status: 'running',
  steps: [
    {
      id: 'step-1',
      title: 'Analyze Dependency Graph & Manifests',
      description: 'Locate package.json, yarn.lock, requirements.txt and index transitive dependencies.',
      status: 'completed',
      tokensUsed: 2150,
      duration: '1.2s',
      thoughtProcess: [
        'Inspected root filesystem tree using workspace file scanner.',
        'Found 32 direct dependencies, 384 nested sub-dependencies in tree.',
        'Resolved package versions successfully with zero network errors.'
      ],
      toolCalls: [
        {
          id: 'tc-101',
          name: 'scan_workspace_files',
          params: { root: './', patterns: ['package.json', 'yarn.lock', 'pyproject.toml'] },
          result: { matches: 3, totalSizeKb: 842 },
          durationMs: 120
        }
      ]
    },
    {
      id: 'step-2',
      title: 'Vulnerability Database Matching',
      description: 'Cross-reference package versions against known advisory vulnerabilities and CVEs.',
      status: 'completed',
      tokensUsed: 4620,
      duration: '2.4s',
      thoughtProcess: [
        'Queried local vulnerability cache and security advisory index.',
        'Identified 1 high-severity vulnerability: CVE-2023-45857 (Axios SSRF in node environment).',
        'Verified that target patch version 1.7.4 does not introduce breaking API changes.'
      ],
      toolCalls: [
        {
          id: 'tc-201',
          name: 'advisory_lookup',
          params: { package: 'axios', currentVersion: '0.21.1' },
          result: { cve: 'CVE-2023-45857', severity: 'HIGH', safeVersion: '>=1.7.4' },
          durationMs: 430
        }
      ]
    },
    {
      id: 'step-3',
      title: 'Synthesize Security Audit & Mitigation Report',
      description: 'Compile findings, calculate blast radius, and generate recommendation overview.',
      status: 'running',
      tokensUsed: 8080,
      duration: 'In progress',
      thoughtProcess: [
        'Formatting markdown advisory matrix.',
        'Formulating regression mitigation plan for API communication endpoints.',
        'Validating TypeScript compilation flags across packages.'
      ],
      toolCalls: [
        {
          id: 'tc-301',
          name: 'generate_markdown_report',
          params: { template: 'security-audit-v2', format: 'markdown' }
        }
      ]
    },
    {
      id: 'step-4',
      title: 'Auto-Fix PR Generation & Notification',
      description: 'Branch workspace, bump dependency versions, and post PR summary.',
      status: 'pending',
      tokensUsed: 0
    }
  ]
};

export const AIAgentInterface: React.FC = () => {
  const { colors } = useTheme();
  const [task, setTask] = useState<AgentTask>(INITIAL_TASK);
  const [activeStepId, setActiveStepId] = useState<string>('step-3');
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({
    'step-1': false,
    'step-2': false,
    'step-3': true
  });
  const [copied, setCopied] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'running' | 'completed'>('all');
  const [activeTab, setActiveTab] = useState<'workflow' | 'live-terminal' | 'broadcast-bus'>('workflow');

  // Hub-and-Spoke Broadcast Bus Feed
  const [broadcastMessages, setBroadcastMessages] = useState<Array<{
    id: string;
    sender: string;
    topic: string;
    payload: string;
    priority: 'normal' | 'urgent';
    timestamp: string;
    responses?: Record<string, string>;
  }>>([
    {
      id: 'bus-1',
      sender: 'coordinator',
      topic: 'task_init',
      payload: 'Coordinator initialized task with Hub-and-Spoke broadcast routing. Bounded 1-round debate enabled.',
      priority: 'normal',
      timestamp: '03:45:12',
      responses: { 'planner': 'Acknowledged task split.' }
    },
    {
      id: 'bus-2',
      sender: 'librarian',
      topic: 'evidence:ready',
      payload: 'Indexed 3 manifest files (package.json, yarn.lock, pyproject.toml). Vulnerability CVE-2023-45857 isolated.',
      priority: 'normal',
      timestamp: '03:45:14'
    },
    {
      id: 'bus-3',
      sender: 'skeptic',
      topic: 'debate:action_plan',
      payload: 'Course-of-action question: Upgrade axios to 1.7.4 directly or generate isolated patch branch first?',
      priority: 'urgent',
      timestamp: '03:45:15',
      responses: {
        'logic': 'Generate isolated patch branch to prevent breaking downstream build.',
        'risk': 'Agree. Blast radius minimal on branch.'
      }
    },
    {
      id: 'bus-4',
      sender: 'coordinator',
      topic: 'verdict:action_plan',
      payload: 'Hub Arbiter ruled in favor of [logic]: Adopt isolated patch branch strategy before PR merge.',
      priority: 'urgent',
      timestamp: '03:45:16'
    }
  ]);

  // Simulated live execution progress
  const [isSimulating, setIsSimulating] = useState<boolean>(true);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSimulating) return;

    const timer = setTimeout(() => {
      setTask((prev) => {
        const nextSteps = prev.steps.map((step) => {
          if (step.id === 'step-3') {
            return {
              ...step,
              status: 'completed' as StepStatus,
              duration: '3.8s',
              output: 'Comprehensive report compiled: Recommended updating axios to >= 1.7.4.'
            };
          }
          if (step.id === 'step-4') {
            return {
              ...step,
              status: 'running' as StepStatus,
              duration: 'Running...',
              thoughtProcess: [
                'Checking branch permissions for git commit.',
                'Staging updated yarn.lock and package.json.',
                'Executing automated test suite before opening Pull Request.'
              ]
            };
          }
          return step;
        });

        return {
          ...prev,
          steps: nextSteps,
          totalTokens: prev.totalTokens + 1200
        };
      });
      setActiveStepId('step-4');
      setExpandedLogs((prev) => ({ ...prev, 'step-4': true }));
      setIsSimulating(false);
    }, 4500);

    return () => clearTimeout(timer);
  }, [isSimulating]);

  const toggleExpand = (stepId: string) => {
    setExpandedLogs((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  const activeStep = task.steps.find((s) => s.id === activeStepId) || task.steps[0];

  const handleCopyPrompt = () => {
    navigator.clipboard?.writeText(task.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusBadge = (status: StepStatus) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Done
          </span>
        );
      case 'running':
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${colors.accentMuted} animate-pulse`}>
            <Flame className="w-3.5 h-3.5 animate-spin" />
            Executing
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="w-3.5 h-3.5" />
            Failed
          </span>
        );
      case 'pending':
      default:
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${colors.badgeBg} ${colors.border} ${colors.textMuted}`}>
            <Clock className="w-3.5 h-3.5" />
            Queued
          </span>
        );
    }
  };

  return (
    <div className={`flex flex-col h-full w-full ${colors.bgMain} ${colors.textPrimary} font-sans antialiased overflow-hidden`}>
      {/* --- Top Sub-Navigation / Header --- */}
      <header className={`flex items-center justify-between px-6 py-3 border-b ${colors.border} ${colors.bgPanel} backdrop-blur-md z-10`}>
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 shadow-lg shadow-cyan-500/20 ring-1 ring-white/20">
            <Bot className="w-5 h-5 text-white" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight">Agentic Orchestrator</h1>
              <span className={`px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider rounded ${colors.accentMuted}`}>
                Autonomous Mode
              </span>
            </div>
            <p className={`text-xs ${colors.textMuted} truncate max-w-md`}>Task: {task.id} &bull; {task.model}</p>
          </div>
        </div>

        {/* Global Controls & Metrics */}
        <div className="flex items-center gap-4">
          <div className={`hidden md:flex items-center gap-4 px-3 py-1.5 rounded-lg ${colors.badgeBg} border ${colors.border} text-xs ${colors.textMuted}`}>
            <div className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>Tokens: <strong className={colors.textPrimary}>{task.totalTokens.toLocaleString()}</strong></span>
            </div>
            <div className="h-3 w-px bg-zinc-700/40" />
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Tools invoked: <strong className={colors.textPrimary}>3</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSimulating(!isSimulating)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-sm ${
                isSimulating
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                  : `${colors.accent} ${colors.accentHover}`
              }`}
            >
              {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isSimulating ? 'Pause Agent' : 'Resume Execution'}
            </button>

            <button
              onClick={() => {
                setTask(INITIAL_TASK);
                setIsSimulating(true);
              }}
              title="Reset task run"
              className={`p-1.5 ${colors.textMuted} hover:${colors.textPrimary} hover:${colors.badgeBg} rounded-lg transition-colors border border-transparent hover:${colors.border}`}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* --- Prompt Banner --- */}
      <div className={`px-6 py-2.5 ${colors.bgPanel} border-b ${colors.border} flex items-center justify-between text-xs gap-4`}>
        <div className="flex items-center gap-2 overflow-hidden">
          <span className={`${colors.textMuted} font-mono font-medium shrink-0`}>PROMPT:</span>
          <span className="truncate italic font-normal">"{task.prompt}"</span>
        </div>
        <button
          onClick={handleCopyPrompt}
          className={`flex items-center gap-1 ${colors.textMuted} hover:text-cyan-400 shrink-0 transition-colors`}
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      {/* --- Main Workspace (Split Grid) --- */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Multi-Step Task Pipeline List */}
        <section className={`w-full md:w-5/12 lg:w-4/12 border-r ${colors.border} flex flex-col ${colors.bgPanel}`}>
          <div className={`p-4 border-b ${colors.border} flex items-center justify-between`}>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <h2 className="text-xs font-semibold uppercase tracking-wider">
                Orchestration Plan ({task.steps.length} Steps)
              </h2>
            </div>
            {/* Filter Toggle */}
            <div className={`flex text-[11px] ${colors.badgeBg} p-0.5 rounded-lg border ${colors.border}`}>
              {(['all', 'running', 'completed'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={`px-2 py-0.5 rounded capitalize transition-colors ${
                    filterMode === mode
                      ? `${colors.accentMuted} font-semibold`
                      : `${colors.textMuted} hover:${colors.textPrimary}`
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {/* Workflow Steps Scrollable List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {task.steps
              .filter((s) => (filterMode === 'all' ? true : s.status === filterMode))
              .map((step, idx) => {
                const isSelected = step.id === activeStepId;
                return (
                  <div
                    key={step.id}
                    onClick={() => setActiveStepId(step.id)}
                    className={`group relative rounded-xl p-3.5 border transition-all cursor-pointer ${
                      isSelected
                        ? `${colors.bgCard} ${colors.border} ring-1 ring-cyan-500/40 shadow-lg`
                        : `${colors.bgCard}/40 ${colors.border} hover:${colors.bgCard}`
                    }`}
                  >
                    {/* Active Accent Bar */}
                    {isSelected && (
                      <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                    )}

                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${colors.badgeBg} ${colors.textMuted}`}>
                          0{idx + 1}
                        </span>
                        <h3 className="text-sm font-medium">
                          {step.title}
                        </h3>
                      </div>
                      {getStatusBadge(step.status)}
                    </div>

                    <p className={`text-xs ${colors.textMuted} line-clamp-2 mb-2.5`}>
                      {step.description}
                    </p>

                    <div className={`flex items-center justify-between text-[11px] ${colors.textMuted}`}>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {step.duration || 'In queue'}
                      </span>
                      {step.toolCalls && (
                        <span className="flex items-center gap-1 text-cyan-400">
                          <Terminal className="w-3 h-3" />
                          {step.toolCalls.length} tool {step.toolCalls.length === 1 ? 'call' : 'calls'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </section>

        {/* Right Column: Step Deep Dive, Live Thought Process & Tool Execution */}
        <section className={`flex-1 flex flex-col ${colors.bgMain} overflow-hidden`}>
          {/* Detail Tab Bar */}
          <div className={`flex items-center justify-between px-6 py-3 border-b ${colors.border} ${colors.bgPanel}`}>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveTab('workflow')}
                className={`text-xs font-medium pb-1 border-b-2 transition-all ${
                  activeTab === 'workflow'
                    ? 'border-cyan-400 text-cyan-400 font-semibold'
                    : `border-transparent ${colors.textMuted} hover:${colors.textPrimary}`
                }`}
              >
                Inspection &amp; Thought Log
              </button>
              <button
                onClick={() => setActiveTab('live-terminal')}
                className={`text-xs font-medium pb-1 border-b-2 transition-all ${
                  activeTab === 'live-terminal'
                    ? 'border-cyan-400 text-cyan-400 font-semibold'
                    : `border-transparent ${colors.textMuted} hover:${colors.textPrimary}`
                }`}
              >
                Raw Stream Console
              </button>
              <button
                onClick={() => setActiveTab('broadcast-bus')}
                className={`text-xs font-medium pb-1 border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === 'broadcast-bus'
                    ? 'border-cyan-400 text-cyan-400 font-semibold'
                    : `border-transparent ${colors.textMuted} hover:${colors.textPrimary}`
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Hub &amp; Broadcast Bus</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-500/20 text-cyan-300 font-mono">
                  {broadcastMessages.length}
                </span>
              </button>
            </div>

            <div className={`text-xs ${colors.textMuted} flex items-center gap-2`}>
              <span>Step ID:</span>
              <code className={`font-mono ${colors.badgeBg} border ${colors.border} px-2 py-0.5 rounded`}>
                {activeStep.id}
              </code>
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {activeTab === 'workflow' ? (
              <>
                {/* Step Overview Card */}
                <div className={`p-4 rounded-xl ${colors.bgCard} border ${colors.border}`}>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-base font-semibold">{activeStep.title}</h2>
                    {getStatusBadge(activeStep.status)}
                  </div>
                  <p className={`text-sm ${colors.textMuted} mb-3`}>{activeStep.description}</p>
                  
                  {activeStep.output && (
                    <div className={`mt-3 p-3 rounded-lg ${colors.badgeBg} border ${colors.border}`}>
                      <span className="text-[11px] font-mono text-cyan-400 uppercase tracking-wider block mb-1">
                        Step Result / Agent Output
                      </span>
                      <p className="text-xs">{activeStep.output}</p>
                    </div>
                  )}
                </div>

                {/* Live Chain-of-Thought Reasoning Section */}
                <div className={`rounded-xl ${colors.bgCard} border ${colors.border} overflow-hidden`}>
                  <div
                    onClick={() => toggleExpand(activeStep.id)}
                    className={`flex items-center justify-between p-4 cursor-pointer hover:${colors.badgeBg} transition-colors`}
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                      <h3 className="text-xs font-semibold uppercase tracking-wider">
                        Cognitive Trace / Thought Process
                      </h3>
                    </div>
                    {expandedLogs[activeStep.id] ? (
                      <ChevronDown className={`w-4 h-4 ${colors.textMuted}`} />
                    ) : (
                      <ChevronRight className={`w-4 h-4 ${colors.textMuted}`} />
                    )}
                  </div>

                  {expandedLogs[activeStep.id] && (
                    <div className="p-4 pt-0 space-y-2.5">
                      {activeStep.thoughtProcess && activeStep.thoughtProcess.length > 0 ? (
                        activeStep.thoughtProcess.map((thought, i) => (
                          <div
                            key={i}
                            className={`flex items-start gap-2.5 text-xs ${colors.badgeBg} p-2.5 rounded-lg border ${colors.border} font-mono`}
                          >
                            <span className="text-cyan-400 font-bold shrink-0">[{i + 1}]</span>
                            <span className="leading-relaxed">{thought}</span>
                          </div>
                        ))
                      ) : (
                        <p className={`text-xs ${colors.textMuted} italic`}>No reasoning notes for this step yet.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Tool Calling Execution Logs */}
                {activeStep.toolCalls && activeStep.toolCalls.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-indigo-400" />
                      <h3 className="text-xs font-semibold uppercase tracking-wider">
                        Tool Invocations ({activeStep.toolCalls.length})
                      </h3>
                    </div>

                    {activeStep.toolCalls.map((tool) => (
                      <div
                        key={tool.id}
                        className={`rounded-xl border ${colors.border} ${colors.bgCard} overflow-hidden shadow-inner`}
                      >
                        {/* Tool Header */}
                        <div className={`flex items-center justify-between px-3.5 py-2.5 ${colors.badgeBg} border-b ${colors.border} text-xs`}>
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                            <span className="font-mono font-semibold text-cyan-400">{tool.name}</span>
                          </div>
                          {tool.durationMs && (
                            <span className={`text-[11px] ${colors.textMuted} font-mono`}>
                              {tool.durationMs}ms
                            </span>
                          )}
                        </div>

                        {/* Tool Arguments & Output Payloads */}
                        <div className="p-3 text-xs font-mono grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <span className={`text-[10px] uppercase ${colors.textMuted} font-sans font-medium block mb-1`}>
                              Parameters
                            </span>
                            <pre className={`p-2.5 rounded-lg ${colors.badgeBg} border ${colors.border} ${colors.textPrimary} overflow-x-auto text-[11px] leading-tight`}>
                              {JSON.stringify(tool.params, null, 2)}
                            </pre>
                          </div>

                          <div>
                            <span className={`text-[10px] uppercase ${colors.textMuted} font-sans font-medium block mb-1`}>
                              Return Payload
                            </span>
                            <pre className={`p-2.5 rounded-lg ${colors.badgeBg} border ${colors.border} text-emerald-400 overflow-x-auto text-[11px] leading-tight`}>
                              {tool.result ? JSON.stringify(tool.result, null, 2) : '// Execution in progress...'}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : activeTab === 'broadcast-bus' ? (
              /* Hub-and-Spoke Broadcast Bus Feed */
              <div className="space-y-4">
                {/* Topology Infobar */}
                <div className={`p-4 rounded-xl ${colors.bgCard} border ${colors.border} flex items-center justify-between`}>
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                      <Share2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        Hub-and-Spoke with Broadcast Bus
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          O(N) Active
                        </span>
                      </h3>
                      <p className={`text-xs ${colors.textMuted}`}>
                        Central coordinator oversees spokes; workers broadcast queries &amp; debate course of action via shared bus. Bounded to 1 round of arbitration.
                      </p>
                    </div>
                  </div>

                  <div className={`hidden lg:flex items-center gap-3 text-xs font-mono ${colors.textMuted}`}>
                    <div className="text-right">
                      <span className="block font-semibold text-cyan-400">Max Latency Bound</span>
                      <span>1 Debate Round</span>
                    </div>
                    <div className="h-6 w-px bg-zinc-700/40" />
                    <div className="text-right">
                      <span className="block font-semibold text-emerald-400">Message Cost</span>
                      <span>O(N) linear</span>
                    </div>
                  </div>
                </div>

                {/* Broadcast Bus Messages List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                      <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                      <span>Live Broadcast Bus Events ({broadcastMessages.length})</span>
                    </div>
                    <span className={`text-[11px] font-mono ${colors.textMuted}`}>
                      Auto-syncing to Blackboard
                    </span>
                  </div>

                  {broadcastMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-4 rounded-xl border ${colors.border} ${colors.bgCard} shadow-sm space-y-2.5 transition-all`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                            msg.sender === 'coordinator'
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                              : msg.sender === 'skeptic'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          }`}>
                            {msg.sender.toUpperCase()}
                          </span>
                          <span className={`font-mono text-[11px] ${colors.textMuted}`}>
                            topic: <strong className={colors.textPrimary}>{msg.topic}</strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {msg.priority === 'urgent' && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              Urgent
                            </span>
                          )}
                          <span className={`text-[11px] font-mono ${colors.textMuted}`}>{msg.timestamp}</span>
                        </div>
                      </div>

                      <p className="text-xs leading-relaxed font-sans">{msg.payload}</p>

                      {/* Responses / Spoke Clarifications */}
                      {msg.responses && Object.keys(msg.responses).length > 0 && (
                        <div className={`mt-2.5 pt-2.5 border-t ${colors.border} space-y-1.5`}>
                          <span className={`text-[10px] uppercase font-mono ${colors.textMuted} block`}>
                            Spoke Clarifications &amp; Proposals:
                          </span>
                          {Object.entries(msg.responses).map(([responder, text]) => (
                            <div
                              key={responder}
                              className={`flex items-start gap-2 p-2 rounded-lg ${colors.badgeBg} border ${colors.border} text-xs font-mono`}
                            >
                              <span className="text-cyan-400 font-semibold shrink-0">[{responder}]:</span>
                              <span className={colors.textPrimary}>{text}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Live Terminal View */
              <div className={`h-full flex flex-col rounded-xl border ${colors.border} font-mono text-xs overflow-hidden ${colors.badgeBg}`}>
                <div className={`flex items-center justify-between px-4 py-2 border-b ${colors.border}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                    <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                    <span className={`ml-2 ${colors.textMuted} text-[11px]`}>agent-stdout: {task.id}</span>
                  </div>
                  <span className={`text-[11px] ${colors.textMuted}`}>Live SSE Stream</span>
                </div>
                <div className="flex-1 p-4 overflow-y-auto space-y-1.5 text-xs">
                  <p className={colors.textMuted}>[2026-09-10 03:45:12] Agent initialized with Gemini 1.5 Pro</p>
                  <p className="text-cyan-400">[info] Loaded plan with 4 autonomous tasks</p>
                  <p className={colors.textMuted}>[tool:fs] scanning target workspace: ./</p>
                  <p className="text-emerald-400">[audit] Identified node.js stack (32 packages found)</p>
                  <p className="text-amber-400">[warning] Vulnerability CVE-2023-45857 matched on dependency axios</p>
                  <p className={colors.textMuted}>[synthesizer] compiling mitigation checklist and lockfile patch...</p>
                  {isSimulating && (
                    <p className="text-cyan-300 animate-pulse">[stream] Processing response token chunk (3240 tokens)...</p>
                  )}
                  {!isSimulating && (
                    <p className="text-emerald-300">[done] Report synthesis complete. Opening pull request sequence.</p>
                  )}
                  <div ref={terminalEndRef} />
                </div>
              </div>
            )}
          </div>

          {/* Bottom Execution Bar */}
          <footer className={`p-3.5 px-6 border-t ${colors.border} ${colors.bgPanel} flex items-center justify-between text-xs`}>
            <div className={`flex items-center gap-2 ${colors.textMuted}`}>
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>Autonomy Level: Full Execution (Human-in-the-loop optional)</span>
            </div>
            <button
              onClick={() => alert('Agent task triggered!')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg ${colors.accent} ${colors.accentHover} font-semibold transition-all shadow-md`}
            >
              <span>Dispatch Next Action</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </footer>
        </section>
      </div>
    </div>
  );
};

export default AIAgentInterface;
