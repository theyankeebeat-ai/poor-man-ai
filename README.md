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

### 4. Prepare for Kaggle.com (Dataset & Datasheet)
Export and sanitize all autonomous agent telemetry, persistent memory facts, neural routing topologies, and code audit traces into Kaggle-ready CSV/JSONL formats with standardized Gebru et al. Datasheets:
```powershell
yarn prepare:kaggle
```
Or directly with Python:
```powershell
python scripts/prepare_kaggle_dataset.py
python scripts/generate_notebook.py
```
This generates the packaged `kaggle_dataset/` directory with:
- `dataset-metadata.json` (official Kaggle CLI metadata)
- `README.md` / `KAGGLE_DATASHEET.md` (publication-standard Datasheet for Datasets)
- `data/` (sanitized tabular CSVs & JSONL streams)
- `poor_man_ai_eda.ipynb` (1-click Kaggle starter analysis & ML baseline notebook)

## Model runtime and cloud storage

Install `server/requirements.txt`, then use `POST /api/webai/hf` with
`{"query":"Roman history","top_k":3}`. The runtime loads the local
`prajjwal1/bert-tiny` checkpoint and its matching Hugging Face BERT tokenizer.
It shortlists WikiText **train** passages by token overlap, then ranks up to
16 candidates using mean-pooled BERT embeddings and cosine similarity.
Inference uses batches of four with a 128-token limit to bound CPU and memory use.
Validation and test splits are reserved for evaluation. This is retrieval;
it does not fine-tune the model or generate chat prose. The agent can call
`hf_search` to access the same model. `/health` reports whether weights have
actually loaded. The first model request loads the snapshot lazily.

`python -m server.backends` synchronizes `hf/` to the private Supabase and
Appwrite buckets and publishes a SHA-256 manifest. `HF_STORAGE_PROVIDER=auto`
restores and verifies that snapshot from Supabase, falling back to Appwrite.
Use `local` for files already on disk, or name one provider explicitly.
Set `HF_SNAPSHOT_DIR` to a writable cache directory on Render. Credentials
belong only in server environment variables; never put secret keys in `VITE_*`.

`render.yaml` describes a standalone backend deployment. The existing
`simple-ai` production repository nests this backend under `Poor man ai/`;
run `python scripts/prepare_render_update.py <deployment-checkout>` to prepare
the targeted repair there while preserving its bucket routes and frontend.
Its build command must install the nested backend requirements and
`buckets/requirements.txt`; its start command must use
`--app-dir "Poor man ai"` and bind `0.0.0.0:$PORT`.

Architecture presets remain estimates and cannot resize loaded weights.
`POST /model/train` returns 501 until a real training worker is implemented.
Run runtime checks with `python -m pytest server/test_hf_runtime.py`.

