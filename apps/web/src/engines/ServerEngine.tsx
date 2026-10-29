import React, { useState, useEffect } from 'react';
import {
  Server as ServerIcon,
  HardDrive,
  Radio,
  RefreshCw,
  Network,
  ShieldCheck,
  Terminal
} from 'lucide-react';
import { useTheme } from '../ThemeContext';
import { API } from '../api';

export interface MicroService {
  name: string;
  port: number;
  status: 'online' | 'degraded' | 'offline';
  endpoint: string;
  type: string;
}

function brainServices(): MicroService[] {
  return [
    { name: 'Go Brain', port: 8000, status: 'online', endpoint: `${API}/chat`, type: 'Agent Core' },
    { name: 'Skill and Knowledge Packs', port: 8000, status: 'online', endpoint: `${API}/mcp/skills`, type: 'SOPs / Skills' },
    { name: 'Router Nets 24x64x32x1', port: 8000, status: 'online', endpoint: `${API}/mcp/neurons`, type: 'Routing Banks' },
    { name: 'Browser Speech', port: 8000, status: 'online', endpoint: `${API}/tts`, type: 'Audio / Voice' },
    { name: 'Retrieval and Web Tools', port: 8000, status: 'online', endpoint: `${API}/tools`, type: 'Tools' }
  ];
}

export const ServerEngine: React.FC = () => {
  const { colors } = useTheme();
  const [services, setServices] = useState<MicroService[]>(() => brainServices());
  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean>(false);
  const [healthData, setHealthData] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] Probing local backend at ${API}...`
  ]);

  const checkHealth = async () => {
    try {
      const res = await fetch(`${API}/health`);
      if (res.ok) {
        const data = await res.json();
        setIsBackendHealthy(true);
        setHealthData(data);
        setLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] Health probe: 200 OK - Backend Active (Cache: ${JSON.stringify(data.cache || {})})`
        ]);
        setServices((prev) => prev.map((s) => ({ ...s, status: 'online' })));
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (e: any) {
      setIsBackendHealthy(false);
      setLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Health probe: Offline (${e.message}). Start with: yarn dev:api`
      ]);
      setServices((prev) => prev.map((s) => ({ ...s, status: 'offline' })));
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`h-full flex flex-col p-6 space-y-6 overflow-y-auto ${colors.bgMain} ${colors.textPrimary}`}>
      {/* Header */}
      <div className={`flex flex-wrap items-center justify-between gap-4 border-b pb-4 ${colors.border}`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-600 text-white shadow-lg shadow-blue-500/20">
            <ServerIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Server Engine (Cluster &amp; FastAPI Backend)</h2>
            <p className={`text-xs ${colors.textMuted}`}>Microservices gateway, SSE streaming, RPC proxies, and sandbox execution daemon</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={checkHealth}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold ${colors.accentMuted} hover:opacity-80 transition-all`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Check Health Now</span>
          </button>
        </div>
      </div>

      {/* Cluster Health Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`p-4 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-1`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs ${colors.textMuted}`}>FastAPI Core</span>
            <span className={`w-2.5 h-2.5 rounded-full ${isBackendHealthy ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
          </div>
          <div className="text-xl font-bold font-mono">
            {isBackendHealthy ? '200 OK' : 'DISCONNECTED'}
          </div>
          <span className={`text-[11px] ${isBackendHealthy ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isBackendHealthy ? (API || 'same origin') : 'Run: npm run dev'}
          </span>
        </div>

        <div className={`p-4 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-1`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs ${colors.textMuted}`}>Agent Execution</span>
            <Radio className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-xl font-bold font-mono">NDJSON Stream</div>
          <span className="text-[11px] text-blue-400">AbortController enabled</span>
        </div>

        <div className={`p-4 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-1`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs ${colors.textMuted}`}>Shared Cache</span>
            <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-xl font-bold font-mono">
            {healthData?.cache ? `${Object.keys(healthData.cache).length} keys` : 'Active'}
          </div>
          <span className="text-[11px] text-cyan-400">In-memory LRU</span>
        </div>

        <div className={`p-4 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-1`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs ${colors.textMuted}`}>Security &amp; Workspace</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono">Sandboxed Tools</div>
          <span className="text-[11px] text-emerald-400">Safe Root Containment</span>
        </div>
      </div>

      {/* Services List Table */}
      <div className={`p-5 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">Internal Daemon Services</h3>
          </div>
          <span className={`text-xs ${colors.textMuted} font-mono`}>Host: 127.0.0.1</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className={`border-b ${colors.border} ${colors.textMuted} font-mono text-[11px] uppercase`}>
                <th className="pb-3 font-medium">Service Name</th>
                <th className="pb-3 font-medium">Port</th>
                <th className="pb-3 font-medium">Type</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium text-right">Target Endpoint</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${colors.border}`}>
              {services.map((svc) => (
                <tr key={svc.name} className={`hover:${colors.badgeBg} transition-colors`}>
                  <td className="py-3 font-medium">{svc.name}</td>
                  <td className="py-3 font-mono text-cyan-400">:{svc.port}</td>
                  <td className={`py-3 ${colors.textMuted}`}>{svc.type}</td>
                  <td className="py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        svc.status === 'online'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${svc.status === 'online' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                      {svc.status}
                    </span>
                  </td>
                  <td className="py-3 text-right font-mono text-cyan-400 text-[11px]">{svc.endpoint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Server Daemon Logs */}
      <div className={`rounded-2xl border ${colors.border} ${colors.badgeBg} overflow-hidden font-mono text-xs`}>
        <div className={`px-4 py-2.5 border-b ${colors.border} flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-semibold">Backend Gateway Telemetry Log</span>
          </div>
          <span className={`text-[11px] ${colors.textMuted}`}>Auto-refresh (10s)</span>
        </div>
        <div className={`p-4 space-y-1.5 max-h-48 overflow-y-auto ${colors.textPrimary}`}>
          {logs.map((log, i) => (
            <p key={i} className="leading-relaxed">
              {log}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ServerEngine;
