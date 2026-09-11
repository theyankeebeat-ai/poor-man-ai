# Poor Man AI: Unified Autonomous Orchestrator & Research Engine

**Poor Man AI** unites the autonomous multi-agent reasoning, workspace coding tools, and FastAPI/MCP backend from **Grok Cli Ai Build** with the modular, multi-engine UI dashboard and IndexedDB indexing system from **TSX Ai**.

---

## 🌟 What Works & Key Merged Features

1. **Autonomous Multi-Agent & Research Backend (from Grok Cli Ai Build)**:
   - **Local Brain & Heuristic Routing**: Works even without API keys via local brain routing (math, memory recall, Jina web search, local reasoner).
   - **MCP Skills & Knowledge Playbooks**: Dynamic SOPs, debate protocols, source trust guidelines, and hook lifecycle execution in `server/mcp/`.
   - **Workspace Code Agent**: Autonomous code editing, file diffs, patch applications, terminal command runs, and git integration under `mode=code`.
   - **Neural Banks & Crew Specialist Mesh**: Dedicated routing networks and specialist agents coordinating on a shared blackboard.
   - **Voice & TTS**: Integration with Edge TTS speech synthesis.

2. **Unified Dashboard & UI Engines (from TSX Ai)**:
   - **Agent Workflow**: Interactive step-by-step pipeline view with cognitive traces, live tool calls, status tracking, and raw terminal view.
   - **Chat Assistant**: Real-time NDJSON streaming connected directly to `http://127.0.0.1:8000/chat` with toggleable Research / Code modes, file attachments, and live thought accordions.
   - **Research Console**: Full Grok research agent interface with history rail, weather cards, voice synthesis, and search hit citations.
   - **Web AI & Web Browser Engines**: Multi-MCP query formulation (DuckDuckGo, Google AI Overview, Bing Copilot, Yandex Neuro) with fallback web retrievers.
   - **Database Engine**: Local IndexedDB persistent store for categorization, tags, queries, and summaries.
   - **Brain Engine**: Live telemetry connected to backend memory (`/memory`) and neural routing layers (`/mcp/neurons`).
   - **Server Engine**: Real-time health polling (`/health`) and daemon service statuses for the FastAPI cluster.
   - **Skill & Tools Engines**: Live introspection into registered Python tools (`/tools`), MCP skills (`/mcp/skills`), and knowledge packs (`/mcp/knowledge`).
   - **Dynamic Theming**: Multi-theme switcher (Cyber Dark, Midnight Deep Blue, Matrix Emerald, Dracula, Light).

---

## 🚀 Quick Start

### 1. Backend Setup
Ensure you have the required Python dependencies:
```powershell
cd "C:\Users\freed\OneDrive\Desktop\Poor man ai"
pip install -r server/requirements.txt
```
*(Optional: Copy `.env.example` to `.env` and configure `XAI_API_KEY`, `OPENAI_API_KEY`, etc. if available. Without keys, the local reasoning engine will still execute.)*

### 2. Launch the Application
Run both Vite frontend (port 5173) and FastAPI backend (port 8000) concurrently:
```powershell
yarn dev
```
Or start them individually:
- **Frontend only**: `yarn dev:web` (http://localhost:5173)
- **Backend API only**: `yarn dev:api` (http://127.0.0.1:8000)

### 3. Build for Production
```powershell
yarn build
```
