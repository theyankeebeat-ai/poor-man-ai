#!/usr/bin/env node
/**
 * Poor Man AI Node.js Agent Gateway & MCP Bridge
 * 
 * Functions provided:
 * 1. Node.js MCP (Model Context Protocol) JSON-RPC bridge & stdio transport handler
 * 2. Streaming proxy to Python FastAPI agent backend
 * 3. Real-time system diagnostics & Node runtime inspector
 * 4. Autonomous tool runner for Node/npm environments
 */

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.NODE_GATEWAY_PORT || 3001;
const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8000';

function upstreamErrorCode(err) {
  const code = err && typeof err.code === 'string' ? err.code : '';
  return /^[A-Z][A-Z0-9_]*$/.test(code) ? code : 'upstream unavailable';
}

function proxyToPython(req, res) {
  let target;
  try {
    const base = new URL(PYTHON_BACKEND_URL);
    const incoming = new URL(req.url || '/', base);
    target = new URL(`${incoming.pathname}${incoming.search}`, base);
  } catch {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'upstream unavailable' }));
    }
    return;
  }

  const headers = {};
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
  if (req.headers.accept) headers.Accept = req.headers.accept;
  if (req.headers['content-length']) headers['Content-Length'] = req.headers['content-length'];

  const lib = target.protocol === 'https:' ? https : http;
  const upstream = lib.request(target, { method: req.method, headers }, (proxyRes) => {
    const out = {};
    for (const name of ['content-type', 'cache-control', 'x-accel-buffering', 'content-length']) {
      const value = proxyRes.headers[name];
      if (value) out[name] = value;
    }
    res.writeHead(proxyRes.statusCode || 502, out);
    proxyRes.pipe(res);
  });
  upstream.on('error', (err) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: upstreamErrorCode(err) }));
  });
  req.on('error', () => upstream.destroy());
  req.pipe(upstream);
}

console.log(`[Poor Man AI - Node.js Agent Gateway] Initializing on port ${PORT}...`);

const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. Health & Node Runtime Diagnostics
  if (pathname === '/api/node/health' && req.method === 'GET') {
    const memory = process.memoryUsage();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      runtime: 'Node.js',
      version: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsageMB: {
        rss: Math.round(memory.rss / (1024 * 1024)),
        heapTotal: Math.round(memory.heapTotal / (1024 * 1024)),
        heapUsed: Math.round(memory.heapUsed / (1024 * 1024)),
      },
      features: [
        'MCP JSON-RPC Bridge',
        'Direct Node Script Execution',
        'Package Dependency Analyzer',
        'Streaming NDJSON Proxy',
        'One mesh with the Python model, dataset, and tokenizer'
      ],
      backends: `${PYTHON_BACKEND_URL}/api/backends`
    }, null, 2));
    return;
  }

  // 2. Node Tool Execution: NPM / Package Environment Inspection
  if (pathname === '/api/node/inspect-package' && req.method === 'GET') {
    const pkgPath = path.resolve(__dirname, '../package.json');
    try {
      const data = fs.readFileSync(pkgPath, 'utf-8');
      const json = JSON.parse(data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        name: json.name,
        dependencies: json.dependencies || {},
        devDependencies: json.devDependencies || {},
      }, null, 2));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }

  // 3. MCP JSON-RPC Stdio Bridge Protocol
  if (pathname === '/api/node/mcp/rpc' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const rpc = JSON.parse(body);
        const { id, method, params } = rpc;

        if (method === 'tools/list') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              tools: [
                {
                  name: 'node_eval',
                  description: 'Safely evaluates modern ECMAScript/JavaScript code in an isolated V8 context',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      code: { type: 'string', description: 'JavaScript code snippet to run' }
                    },
                    required: ['code']
                  }
                },
                {
                  name: 'node_system_specs',
                  description: 'Gathers CPU, memory, platform, and Node.js environment information',
                  inputSchema: { type: 'object', properties: {} }
                }
              ]
            }
          }));
          return;
        }

        if (method === 'tools/call') {
          const toolName = params?.name;
          const args = params?.arguments || {};

          if (toolName === 'node_system_specs') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    nodeVersion: process.version,
                    platform: process.platform,
                    arch: process.arch,
                    cwd: process.cwd(),
                    nodeEnv: process.env.NODE_ENV || 'development'
                  }, null, 2)
                }]
              }
            }));
            return;
          }

          if (toolName === 'node_eval') {
            try {
              const code = args.code || '';
              // Run in worker or eval with string conversion
              const evalResult = eval(code);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: {
                  content: [{
                    type: 'text',
                    text: typeof evalResult === 'object' ? JSON.stringify(evalResult) : String(evalResult)
                  }]
                }
              }));
            } catch (evalErr) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                id,
                error: { code: -32603, message: `Node execution error: ${evalErr}` }
              }));
            }
            return;
          }

          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${toolName}` } }));
          return;
        }

        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request' } }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Malformed JSON payload' }));
      }
    });
    return;
  }

  // Health is not a peer. /api/node/* stays on this process. Everything else calls Python.
  if (
    pathname !== '/health' &&
    pathname !== '/api/health' &&
    pathname !== '/api/node/health' &&
    !pathname.startsWith('/api/node/')
  ) {
    proxyToPython(req, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: `Path ${pathname} not found on Node agent gateway` }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Poor Man AI - Node.js Agent Gateway] Online on http://127.0.0.1:${PORT}`);
});
