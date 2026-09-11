import React, { useState } from 'react';
import {
  Boxes,
  Plus,
  RotateCcw
} from 'lucide-react';
import { useTheme } from '../ThemeContext';

export interface MCPServer {
  id: string;
  name: string;
  endpoint: string;
  protocol: 'SSE' | 'Stdio' | 'gRPC';
  status: 'connected' | 'handshaking' | 'disconnected';
  toolsCount: number;
  resourcesCount: number;
  promptsCount: number;
}

const INITIAL_MCP_SERVERS: MCPServer[] = [
  { id: 'mcp-ddg', name: 'duckduckgo-ai-search-mcp', endpoint: 'chrome-devtools://duckduckgo.com/?ia=chat', protocol: 'Stdio', status: 'connected', toolsCount: 3, resourcesCount: 8, promptsCount: 2 },
  { id: 'mcp-google', name: 'google-ai-search-mcp', endpoint: 'chrome-devtools://google.com/search?hl=en', protocol: 'Stdio', status: 'connected', toolsCount: 4, resourcesCount: 12, promptsCount: 3 },
  { id: 'mcp-bing', name: 'bing-copilot-search-mcp', endpoint: 'chrome-devtools://bing.com/copilot', protocol: 'SSE', status: 'connected', toolsCount: 5, resourcesCount: 6, promptsCount: 2 },
  { id: 'mcp-yandex', name: 'yandex-ai-search-mcp', endpoint: 'chrome-devtools://yandex.com/search', protocol: 'Stdio', status: 'connected', toolsCount: 3, resourcesCount: 5, promptsCount: 1 }
];

export const MCPEngine: React.FC = () => {
  const { colors } = useTheme();
  const [servers, setServers] = useState<MCPServer[]>(INITIAL_MCP_SERVERS);
  const [selectedServerId, setSelectedServerId] = useState<string>('mcp-ddg');
  const [newServerName, setNewServerName] = useState('');
  const [newEndpoint, setNewEndpoint] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const selectedServer = servers.find((s) => s.id === selectedServerId) || servers[0];

  const handleAddServer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServerName || !newEndpoint) return;

    const newSvc: MCPServer = {
      id: `mcp-${Date.now()}`,
      name: newServerName.trim(),
      endpoint: newEndpoint.trim(),
      protocol: newEndpoint.startsWith('http') ? 'SSE' : 'Stdio',
      status: 'connected',
      toolsCount: 4,
      resourcesCount: 1,
      promptsCount: 0
    };

    setServers([...servers, newSvc]);
    setSelectedServerId(newSvc.id);
    setNewServerName('');
    setNewEndpoint('');
    setIsAdding(false);
  };

  return (
    <div className={`h-full flex flex-col p-6 space-y-6 overflow-y-auto ${colors.bgMain} ${colors.textPrimary}`}>
      {/* Header */}
      <div className={`flex flex-wrap items-center justify-between gap-4 border-b pb-4 ${colors.border}`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">MCP Engine (Model Context Protocol)</h2>
            <p className={`text-xs ${colors.textMuted}`}>Standardized protocol bridge for external tools, dynamic context resources, and agent plugins</p>
          </div>
        </div>

        <button
          onClick={() => setIsAdding(!isAdding)}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold ${colors.accent} ${colors.accentHover} shadow-md transition-all`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Connect MCP Server</span>
        </button>
      </div>

      {/* Quick Add Form Modal/Drawer */}
      {isAdding && (
        <form onSubmit={handleAddServer} className={`p-4 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-3`}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400">Register New MCP Host</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Server name (e.g. postgres-mcp)"
              value={newServerName}
              onChange={(e) => setNewServerName(e.target.value)}
              className={`p-2.5 rounded-xl ${colors.badgeBg} border ${colors.border} text-xs ${colors.textPrimary} focus:outline-none focus:ring-1 focus:ring-amber-500`}
            />
            <input
              type="text"
              placeholder="URI / Command (e.g. stdio://... or https://.../sse)"
              value={newEndpoint}
              onChange={(e) => setNewEndpoint(e.target.value)}
              className={`p-2.5 rounded-xl ${colors.badgeBg} border ${colors.border} text-xs ${colors.textPrimary} focus:outline-none focus:ring-1 focus:ring-amber-500`}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className={`px-3 py-1.5 rounded-lg text-xs ${colors.textMuted} hover:${colors.textPrimary}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg text-xs bg-amber-500 text-black font-semibold hover:bg-amber-400"
            >
              Verify &amp; Connect
            </button>
          </div>
        </form>
      )}

      {/* Main MCP Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Servers List */}
        <div className={`p-4 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-3`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-xs font-semibold uppercase tracking-wider ${colors.textPrimary}`}>Registered Hosts</h3>
            <span className={`text-[11px] font-mono ${colors.textMuted}`}>{servers.length} configured</span>
          </div>

          <div className="space-y-2">
            {servers.map((srv) => {
              const isSelected = srv.id === selectedServerId;
              return (
                <div
                  key={srv.id}
                  onClick={() => setSelectedServerId(srv.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? `bg-amber-500/10 border-amber-500/40 ${colors.textPrimary} shadow-sm`
                      : `${colors.badgeBg} ${colors.border} hover:opacity-90`
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs">{srv.name}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-mono uppercase ${
                        srv.status === 'connected'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : `${colors.badgeBg} ${colors.textMuted}`
                      }`}
                    >
                      {srv.status}
                    </span>
                  </div>
                  <p className={`text-[11px] ${colors.textMuted} font-mono truncate`}>{srv.endpoint}</p>
                  <div className={`flex items-center gap-3 mt-2 text-[10px] ${colors.textMuted}`}>
                    <span>{srv.toolsCount} Tools</span>
                    <span>&bull;</span>
                    <span>{srv.resourcesCount} Resources</span>
                    <span>&bull;</span>
                    <span className="text-amber-400/80">{srv.protocol}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Server Inspection & Handshake Details */}
        <div className={`lg:col-span-2 p-5 rounded-2xl border ${colors.border} ${colors.bgCard} space-y-5 flex flex-col justify-between`}>
          <div className="space-y-4">
            <div className={`flex items-center justify-between border-b ${colors.border} pb-3`}>
              <div>
                <h3 className={`text-base font-bold ${colors.textPrimary} flex items-center gap-2`}>
                  <span>{selectedServer.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                    {selectedServer.protocol}
                  </span>
                </h3>
                <p className={`text-xs ${colors.textMuted} font-mono mt-0.5`}>{selectedServer.endpoint}</p>
              </div>

              <button
                onClick={() => alert(`Re-handshaking with ${selectedServer.name}...`)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${colors.border} hover:${colors.badgeBg} ${colors.textMuted} hover:${colors.textPrimary} text-xs transition-colors`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Sync Capabilities</span>
              </button>
            </div>

            {/* Protocol Capabilities */}
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className={`p-3 rounded-xl ${colors.badgeBg} border ${colors.border}`}>
                <span className={`text-[10px] uppercase ${colors.textMuted} font-mono block mb-1`}>Declared Tools</span>
                <span className="text-lg font-bold font-mono text-amber-400">{selectedServer.toolsCount}</span>
              </div>
              <div className={`p-3 rounded-xl ${colors.badgeBg} border ${colors.border}`}>
                <span className={`text-[10px] uppercase ${colors.textMuted} font-mono block mb-1`}>Context Resources</span>
                <span className="text-lg font-bold font-mono text-cyan-400">{selectedServer.resourcesCount}</span>
              </div>
              <div className={`p-3 rounded-xl ${colors.badgeBg} border ${colors.border}`}>
                <span className={`text-[10px] uppercase ${colors.textMuted} font-mono block mb-1`}>Prompt Templates</span>
                <span className="text-lg font-bold font-mono text-emerald-400">{selectedServer.promptsCount}</span>
              </div>
            </div>

            {/* Simulated Handshake JSON RPC */}
            <div className={`rounded-xl border ${colors.border} ${colors.badgeBg} overflow-hidden text-xs font-mono`}>
              <div className={`px-3.5 py-2 border-b ${colors.border} text-[11px] ${colors.textMuted} flex items-center justify-between`}>
                <span>MCP Initialize Handshake Payload</span>
                <span className="text-emerald-400">JSON-RPC 2.0</span>
              </div>
              <pre className={`p-3 ${colors.textPrimary} overflow-x-auto text-[11px] leading-tight`}>
{JSON.stringify(
  {
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {
        roots: { listChanged: true },
        sampling: {}
      },
      clientInfo: {
        name: "Antigravity-Engine",
        version: "2.4.0"
      }
    }
  },
  null,
  2
)}
              </pre>
            </div>
          </div>

          <div className={`flex items-center justify-between text-xs ${colors.textMuted} pt-3 border-t ${colors.border}`}>
            <span>Transport: bidirectional JSON-RPC via child process stdio</span>
            <span className="text-emerald-400 font-mono">Health: nominal</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MCPEngine;
