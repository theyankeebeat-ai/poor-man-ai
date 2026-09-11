# 🛠️ Architecture & Integration Guide: What Was Taken & Unified

This document serves as the design specification and reference for **Poor Man AI**, detailing the components and capabilities merged from **Grok Cli Ai Build** and **TSX Ai**, how they integrate, and how to extend them in future builds.

---

## 1. High-Level Architecture Overview

Poor Man AI combines a high-performance **FastAPI backend with autonomous multi-agent tool loops** with a **modular React 18 + TypeScript + Tailwind CSS dashboard** with specialized cockpit engines.

```
Poor Man AI
├── Backend (FastAPI, Python 3.10+) -> port 8000
│   ├── /chat (NDJSON streaming agent & code loops)
│   ├── /health (Cache & server telemetry)
│   ├── /memory (Persistent JSONL facts)
│   ├── /model/architecture (Neural architecture blueprints, param counter & VRAM budgets)
│   ├── /model/train (QLoRA/LoRA fine-tuning submission & blackboard tracking)
│   ├── /tools (Live Python primitive & financial tools: financial_quote, financial_compare, financial_news)
│   ├── /read-url & /api/read-url (Resilient web scraping & browser engine)
│   ├── /mcp/skills (Dynamic MCP SOP skills including financial-markets)
│   ├── /mcp/knowledge (Research playbooks including financial-markets)
│   ├── /mcp/neurons (Layer & crew neural routing banks)
│   ├── /tts & /tts/voices (Edge TTS speech synthesis)
│   └── /upload (File & context attachment ingestion)
│
└── Frontend (Vite, React 18, Tailwind, Lucide) -> port 5173
    ├── Agent Workflow (/agent) -> Pipeline step inspection & simulation
    ├── Chat Assistant (/chat) -> Real-time NDJSON streaming UI with live trace
    ├── Research Console (/grok-chat) -> Full research UI with history & audio
    ├── Architecture & Tuning (/architecture) -> Neural specs, parameters, quantization & fine-tuning studio
    ├── Web AI (/webai) -> Multi-engine consensus formulation
    ├── Web Browser (/browser) -> Live web retrieval across DDG/Google/Bing/Yandex
    ├── Brain Engine (/brain) -> Live memory & neural bank inspector
    ├── Server Engine (/server) -> Live backend health & daemon cluster metrics
    ├── MCP Engine (/mcp) -> Transport & protocol manager
    ├── Skill Engine (/skill) -> Live MCP skills & knowledge reader
    ├── Tools Engine (/tools) -> Live backend tools registry & JSONSchema validator
    └── Database Engine (/database) -> Client-side IndexedDB index store
```

---

## 2. What Was Taken from "Grok Cli Ai Build"

### A. Autonomous Multi-Agent Engine (`server/`)
* **Local Heuristic Brain (`server/local_brain.py`)**:
  * Allows execution of basic queries (calculations, memory retrieval, chat) without third-party API keys.
  * Direct query routing based on regex patterns and intent classification.
* **Agent Core (`server/agent.py`)**:
  * Supports dual operation modes: `agent` (research, debate, crew assembly) and `code` (workspace manipulation).
  * Streams NDJSON lines: `plan`, `tool`, `observation`, `token`, `done`, and `error`.
  * Safe answer payload unwrapping and clean completion safeguards.
* **Crew Orchestra (`server/crew/`)**:
  * Multi-agent blackboard orchestration: `facts`, `howto`, `media`, `gap`, `debate`, and `verifier`.
* **MCP Layer & Skills (`server/mcp/`)**:
  * Dynamic file-based skill definitions loaded from `server/mcp/skills/*/SKILL.md`.
  * Knowledge playbooks loaded from `server/mcp/knowledge/*.md`.
  * Execution hooks (`on_user_message`, `on_plan`, `on_observations`, `on_before_judge`, `on_verify`).
* **Workspace & Code Execution Tools (`server/code_tools.py`, `server/workspace.py`)**:
  * Controlled workspace sandboxing via `path_from_message` and sticky workspace sessions.
  * Native execution tools: `workspace_info`, `list_dir`, `read_file`, `grep`, `apply_patch`, `write_file`, `run_cmd`, `git_status`, `git_diff`.
* **Neural Routing Banks (`server/neurons.py`)**:
  * Lightweight 10x12x1 neural routing nets per MCP layer and specialist crew agent.
* **Audio & Speech Synthesis**:
  * Edge TTS integration (`/tts`, `/tts/voices`) with caching to prevent API stampedes.
* **Command Line Interface (`cli/`)**:
  * PowerShell automation runner (`cli/ai.ps1`) for terminal-based project execution.

---

## 3. What Was Taken from "TSX Ai"

### A. Cockpit Dashboard & Navigation
* **Universal Layout (`src/App.tsx`)**:
  * Top navigation bar linking all 11 views seamlessly with route preservation.
  * Real-time active route indicators and connectivity status badges.
* **Theme System (`src/ThemeContext.tsx`, `src/index.css`)**:
  * Dynamic CSS variables and palette tokens supporting:
    * `Cyber Dark` (Default)
    * `Midnight Deep Blue`
    * `Matrix Emerald`
    * `Dracula`
    * `Light`

### B. Specialized Engine Views (`src/engines/`)
1. **Agent Workflow (`src/AIAgentInterface.tsx`)**:
   * Step-by-step pipeline view with execution status badges (`pending`, `running`, `completed`, `failed`).
   * Cognitive trace / thought process accordions and raw terminal output console.
2. **Web AI Engine (`src/engines/WebAIEngine.tsx`)**:
   * Inter-MCP communication mesh aggregating search results across 4 engines.
3. **Web Browser Engine (`src/engines/WebBrowserEngine.tsx`)**:
   * Direct web search queries with engine badges and result cards.
4. **Database Engine (`src/engines/DatabaseEngine.tsx`, `src/db/localIndexDb.ts`)**:
   * IndexedDB local persistence database (`TSX_AI_LOCAL_DB`) with compound indexing (`by_category`, `by_query`, `by_createdAt`).
5. **MCP Engine (`src/engines/MCPEngine.tsx`)**:
   * Stdio, SSE, and gRPC transport configuration manager.

---

## 4. How They Were Unified (Bridging Code & Endpoints)

| Feature / Panel | Original State in TSX Ai | Integrated State in Poor Man AI |
|---|---|---|
| **Chat Assistant** (`src/AIChatInterface.tsx`) | Hardcoded simulation with mock delays | Fully connected to `streamChat()` (`POST /chat`) with live plans, tool invocations, observations, and code execution mode toggle. |
| **Server Engine** (`src/engines/ServerEngine.tsx`) | Static microservices table | Polls live `/health` endpoint every 10s with real cache keys, active port status, and daemon telemetry logs. |
| **Brain Engine** (`src/engines/BrainEngine.tsx`) | Static mock hyperparameters | Live fetches `/memory` (`server/data/memory.jsonl`) and `/mcp/neurons` routing network state. |
| **Skill Engine** (`src/engines/SkillEngine.tsx`) | Hardcoded mock skills list | Live fetches `/mcp/skills` and `/mcp/knowledge` directly from the backend MCP system. |
| **Tools Engine** (`src/engines/ToolsEngine.tsx`) | Hardcoded tool samples | Live fetches `/tools` from FastAPI backend exposing real Python tool parameters and JSONSchemas. |
| **Research Console** | N/A (Only existed in Grok) | Added as dedicated route `/grok-chat` using Grok's original `Chat.tsx` component. |
| **Architecture & Tuning** (`src/engines/ArchitectureEngine.tsx`) | N/A (New Studio Module) | Dedicated route `/architecture` backed by `server/architecture.py`, `GET /model/architecture`, and `POST /model/train` for neural blueprints, parameter math, AWQ/NF4 quantization, and QLoRA tuning. |

---

## 5. Development Scripts & Future Extension Notes

### Scripts in `package.json`
* `yarn dev`: Concurrently runs both `vite` (port 5173) and `uvicorn server.main:app --reload` (port 8000).
* `yarn dev:web`: Starts only the Vite frontend.
* `yarn dev:api`: Starts only the FastAPI Python backend.
* `yarn build`: Compiles TypeScript types (`tsc`) and builds production distribution (`vite build`).

### Adding New Tools
1. Define the tool runner function in [`server/tools.py`](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/server/tools.py) or [`server/code_tools.py`](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/server/code_tools.py).
2. Add the JSONSchema specification to the `TOOLS` list.
3. Map the runner in `RUNNERS`.
4. The frontend **Tools Engine** (`/tools`) will automatically discover and display it with live validation.

### Adding New Skills & Knowledge Playbooks
1. Create a new directory in [`server/mcp/skills/<skill-name>/SKILL.md`](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/server/mcp/skills).
2. Add Markdown playbooks in [`server/mcp/knowledge/<playbook-name>.md`](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/server/mcp/knowledge).
3. The **Skill Engine** (`/skill`) and agent routing will auto-load them at boot or reload.

---

## 6. What Was Added & Upgraded

### A. High-Fidelity Web Reader & Scraper Engine (`server/web_reader.py`)
* **Direct HTTP Extraction with Browser Headers**: Real browser User-Agent and headers to bypass anti-bot 403 blocks on modern sites.
* **Intelligent HTML Cleaning (BeautifulSoup)**:
  * Preserves article `<header>` tags containing headlines, titles, and bylines (previously discarded).
  * Cleans boilerplate and intrusive ads without stripping main article containers or breaking multi-word links.
  * Aggregates multiple `<article>` nodes across portal homepages (e.g. NYTimes, AP, CNN) instead of picking a single empty promo container.
* **Stealth Playwright Chromium Engine**:
  * Launched with anti-automation flags (`--disable-blink-features=AutomationControlled`, `--no-sandbox`, `--disable-infobars`).
  * Injects stealth scripts to undefine `navigator.webdriver` and spoof browser plugins/languages.
* **Native XML / RSS / Atom Feed Parser (`parse_rss_or_atom`)**:
  * Automatically detects XML declarations and feed channels/entries.
  * Directly converts feeds into structured Markdown with hyperlinked titles, publication timestamps, and summaries without BeautifulSoup XML-as-HTML warnings.
* **Anti-Bot & Challenge Page Detection (`BOT_BLOCK_PATTERNS`)**:
  * Identifies Datadome, Cloudflare challenges, PerimeterX, and captcha walls.
  * Treats challenge pages and low-text responses as scraping failures rather than caching empty/broken markdown.
* **Live News Syndication Fallback (`fetch_syndication_fallback`)**:
  * When major news portals (Reuters, NYTimes, WSJ, Bloomberg) block direct scrapers at the edge, queries live Google News RSS feeds for `site:{domain}` to extract real-time syndicated wires.
* **Jina Reader Fallback**: Resilient secondary fallback when direct network connectivity is firewalled.
* **SQLite KV Caching**: Prevents duplicate network downloads within the same session.

### B. Upgraded `web_search` & `read_url` Tools (`server/tools.py`)
* **Multi-Tier Free Search Cascades (`web_search`)**:
  * Operates out-of-the-box with zero third-party API keys (no Tavily/Brave/Serper required).
  * **Tier 1 (News & Live Events)**: Live Google News RSS search returning real-time articles, publisher sources, publication dates, and links.
  * **Tier 2 (General Web)**: Bing Organic Search with automatic base64 click-URL decoding (`_decode_bing_url`) for direct destination links.
  * **Tier 3 (Alternative Search)**: DuckDuckGo HTML & Lite parser.
  * **Tier 4 (Encyclopedic & Factual)**: Wikipedia OpenSearch API fallback.
* **Upgraded `read_url`**:
  * Eliminated rigid domain allowlists (`ALLOW_HOSTS`); can now read any public URL.
  * Added `render_js` / `use_browser` parameters for dynamic browser execution.
  * Updated backend JSONSchema specifications for tool validation in `/tools`.

### C. Web Reader MCP Skill & Knowledge Playbooks (`server/mcp/`)
* **Web Reader Skill (`server/mcp/skills/web-reader/SKILL.md`)**: Registered SOP for direct URL ingestion, cleaning, multi-source web research, and citation grounding.
* **Web Reading Playbook (`server/mcp/knowledge/web-reading.md`)**: Epistemic rules for code preservation, tables, and handling login walls.

### D. Direct URL Detection & Fast Agent Routing (`server/local_brain.py`, `server/research.py`)
* Automatically detects URLs in user prompts (`read https://...`, `summarize https://...`).
* Prioritizes direct page extraction first, skipping redundant search queries when a destination URL is explicitly provided.

### E. Backend API Endpoints & Resilient Streaming (`server/main.py`, `server/agent.py`)
* Added `POST /read-url`, `POST /api/read-url`, and `GET /api/read-url` accepting `url`, `render_js`, `force_refresh`, and `max_chars`.
* **Client Disconnect Handling**: Wrapped `/chat` SSE streaming generator with `asyncio.CancelledError` and `GeneratorExit` handlers to prevent broken socket exceptions when client sessions drop.
* **Cache Poisoning Prevention**: Added blocked fetch patterns (`blocked the fetch`, `couldn't pull live`) to `_BAD_CACHE` in `server/agent.py` to prevent caching and replaying dead scrape attempts.

### F. Frontend Web Browser & Reader Engine (`src/engines/WebBrowserEngine.tsx`)
* **Dual-Tab Mode**: Seamless toggle between **Website Reader** and **Multi-Engine Search**.
* **Reader Features**:
  * Direct URL bar with quick presets (FastAPI, React, Hacker News, Wikipedia, Python).
  * Toggle for **Render JavaScript (Playwright Chromium)**.
  * Toggle to **Bypass Cache**.
  * View toggles between **Formatted Reader View** and **Raw Markdown View**.
  * Action buttons for **Copy**, **Save to Local IndexedDB**, and **Analyze with Agent** (auto-populates prompt into Chat).

---

## 8. Multi-AI Search & Engine Aggregator MCP Architecture (New Addition)

Derived from live browser research benchmarks documented in `browser_notes.md` (covering **Yandex Neuro**, **Brave Ask AI**, **Bing Copilot/Instant Answer**, **Google AI Mode**, and **Perplexity AI**), this subsystem equips Poor Man AI with multi-engine AI querying capabilities without triggering anti-bot challenges or CAPTCHAs.

### A. Architectural Design & Philosophy
* **Zero-Challenge AI Querying**: Instead of fragile web scraping that triggers CAPTCHA verification, queries are executed through authorized APIs, official developer interfaces, or session-authenticated headless CDP bridges.
* **Consensus Synthesis**: Queries can be dispatched across multiple AI search providers in parallel to cross-verify answers, temperature/weather figures, facts, or technical documentation.
* **Dual Deployment Model**:
  1. **Integrated Server Tools (`server/mcp/`)**: Native Python async tools callable by the Poor Man AI agent and exposed via the `/webai` frontend cockpit engine.
  2. **Standard MCP Server Interface**: Standard Model Context Protocol (MCP) JSON-RPC tool schemas (`ask_ai`, `consensus_query`, `browser_session_query`) compatible with Antigravity, Claude Desktop, and CLI runners.

### B. Supported AI Engine Connectors
* **Perplexity AI Connector**:
  * Leverages Perplexity REST endpoints (`sonar` / `sonar-pro`) with real-time web citations and structured source grounding.
* **Brave Ask AI Connector**:
  * Queries Brave's AI summarizer and web index API for private, untracked search overviews with domain citations.
* **Google AI / Grounded Search Connector**:
  * Queries Gemini Search Grounding or Google Custom Search to retrieve official Google search index answers.
* **Bing Copilot / Instant Answer Connector**:
  * Queries Microsoft Cognitive / Bing Search Instant Answers to retrieve featured snippets and direct answers without bot blocks.
* **Chrome DevTools Protocol (CDP) User-Session Bridge**:
  * Allows querying web AI frontends using an active, authenticated Chrome browser instance (via Chrome DevTools MCP or Playwright persistent context), piggybacking on legitimate user sessions.

### C. Registered MCP Tool Specifications
* `ask_web_ai(provider: "perplexity" | "brave" | "google" | "bing" | "yandex", query: str)`:
  * Dispatches a single targeted question to the selected AI engine and returns parsed findings with source links.
* `consensus_query(query: str, providers: list[str])`:
  * Dispatches the query across multiple providers concurrently, aggregates responses, performs claim verification (`server.mcp.answer.verify_claims`), and highlights agreements and discrepancies.
* `record_browser_session_notes(topic: str, output_path: str)`:
  * Inspects the active CDP browser snapshot, extracts visible AI responses, and saves structured summaries into project Markdown files.

---

## 7. UI Uniformity & Color Cohesion Across Cockpit Views

### What Was Done:

1. **Unified Dual-Theme Synchronization System**:
   * **[src/ThemeContext.tsx](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/src/ThemeContext.tsx)**: Configured 6 themes (`cyber-dark`, `midnight-blue`, `matrix`, `dracula`, `light`, `beige`) with complete Tailwind classes (`bgMain`, `bgPanel`, `bgCard`, `border`, `textPrimary`, `textMuted`, `accent`, etc.). Synchronized `document.documentElement.dataset.theme`, `document.documentElement.classList.toggle('dark')`, and local storage keys (`poor_man_ai_theme` and `ra-theme`).
   * **[src/theme.tsx](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/src/theme.tsx)**: Connected directly into `ThemeContext` so any theme change instantly updates both Tailwind classes and CSS variables (`--bg`, `--card`, `--fg`, `--muted`, `--accent`) synchronously.
   * **[src/index.css](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/src/index.css)**: Unified CSS variable root themes for all 6 themes and their legacy aliases so full-page backgrounds and panels change dynamically without hardcoded dark overrides.

2. **Eliminated Hardcoded Backgrounds & Styled All Views**:
   * **[src/AIAgentInterface.tsx](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/src/AIAgentInterface.tsx)**: Removed static dark colors (`#0a0d14`, `#0b0e17`, `zinc-950`). The task input bar, status banners, step cards, tool execution displays, and sidebar are now fully bound to `useTheme()`.
   * **[src/AIChatInterface.tsx](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/src/AIChatInterface.tsx)**: Message stream bubbles, top status sub-bar, thought process containers, tool execution badges, and message input dock now seamlessly adapt to light, beige, matrix, dracula, and cyber themes.
   * **[src/components/HistoryRail.tsx](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/src/components/HistoryRail.tsx)**: Updated the drawer theme palette to show swatches for all 6 themes with instant live preview.
   * **All Engine Screens Unified**:
     * **[src/engines/BrainEngine.tsx](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/src/engines/BrainEngine.tsx)**: Memory items, telemetry charts, and quick actions styled with `colors`.
     * **[src/engines/MCPEngine.tsx](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/src/engines/MCPEngine.tsx)**: Server list, connected tool cards, and JSON view panels.
     * **[src/engines/DatabaseEngine.tsx](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/src/engines/DatabaseEngine.tsx)**: Filter pills, search bar, IndexedDB knowledge cards, and creation modals.
     * **[src/engines/ToolsEngine.tsx](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/src/engines/ToolsEngine.tsx)**: Autonomous tool cards and status panels.
     * **[src/engines/ServerEngine.tsx](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/src/engines/ServerEngine.tsx)**: Backend service rows, logs, and cluster metrics.
     * **[src/engines/WebAIEngine.tsx](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/src/engines/WebAIEngine.tsx)**: Multi-engine consensus cards, synthesis response, and citation panels.
     * **[src/engines/WebBrowserEngine.tsx](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/src/engines/WebBrowserEngine.tsx)**: Reader view, Markdown viewer, search selector, and AI overview panels.

3. **Build Verification**:
   * Verified with `npm run build` (`tsc && vite build`). All TypeScript interfaces and Vite bundle compilation passed cleanly.

---

## 9. Financial Markets & Multi-Tape MCP Engine (Google Finance, Nasdaq, Yahoo Finance, MarketWatch)

To enable accurate, real-time financial research and eliminate hallucinations on equity prices and extended-hours trading, Poor Man AI integrates a dedicated **Multi-Venue Financial Intelligence Subsystem**. This engine connects to four canonical financial sources—**Google Finance**, **Nasdaq**, **Yahoo Finance**, and **MarketWatch**—to extract, verify, and reconcile regular market closes, pre-market prints, after-hours tapes, bid/ask spreads, and financial headlines.

### A. Architectural Overview & Four-Source Architecture

```
Financial Markets Engine (`server/finance.py`)
├── Google Finance (https://www.google.com/finance)
│   ├── Endpoint: /finance/quote/{SYMBOL}:{EXCHANGE}
│   └── Data: Real-time price, intraday delta, after-hours tag (`After hours · HH:MM PM`), market cap, volume
├── Nasdaq Official Tape (https://www.nasdaq.com & https://api.nasdaq.com)
│   ├── Endpoint: /api/quote/{SYMBOL}/info?assetclass=stocks
│   └── Data: Primary data (real-time/extended trading with bid/ask spread) & secondary data (official 4:00 PM close)
├── Yahoo Finance (https://finance.yahoo.com)
│   ├── Endpoint: /v8/finance/chart/{SYMBOL}?includePrePost=true
│   └── Data: regularMarketPrice, chartPreviousClose, postMarketPrice, preMarketPrice, volume, 52-week range
├── MarketWatch (https://www.marketwatch.com)
│   ├── Endpoint: /investing/stock/{symbol}
│   └── Data: Intraday close, after-hours last print, after-hours volume & timestamp, market pulse news
└── Consensus & Reconciliation Engine
    ├── Multi-venue concurrent gather (`asyncio.gather`)
    ├── Consensus regular close & after-hours calculation
    └── Discrepancy detection & spread awareness
```

### B. Registered MCP Tools (`server/mcp/tools.py`, `server/tools.py`)

1. **`financial_quote`**:
   * **Parameters**:
     * `symbol` (str, required): Stock ticker or symbol (e.g., `SHOE`, `SHOE:NASDAQ`, `AAPL`, `TSLA`).
     * `source` (str, optional): Venue filter (`all`, `google`, `nasdaq`, `yahoo`, `marketwatch`). Defaults to `all`.
     * `include_after_hours` (bool, optional): Ingests pre-market and after-hours trading prints. Defaults to `true`.
   * **Behavior**: Simultaneously queries active venues in parallel, compiles regular session data and extended-hours data, and reports consensus reference marks alongside per-venue prints.

2. **`financial_compare`**:
   * **Parameters**:
     * `symbol` (str, required): Stock ticker or symbol.
     * `sources` (list[str], optional): List of venues to cross-examine. Defaults to all 4 venues.
   * **Behavior**: Cross-examines prints, volume, and timestamps across Google Finance, Nasdaq, Yahoo Finance, and MarketWatch to detect spread variations, liquidity constraints, or stale data.

3. **`financial_news`**:
   * **Parameters**:
     * `symbol` (str, required): Equity symbol or company name.
     * `source` (str, optional): Target news provider (`all`, `marketwatch`, `google`).
   * **Behavior**: Extracts recent market headlines, earnings announcements, and analyst commentary from MarketWatch and financial wires.

### C. Self-Improving MCP Skill & Knowledge Pack

* **MCP Skill ([`server/mcp/skills/financial-markets/SKILL.md`](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/server/mcp/skills/financial-markets/SKILL.md))**:
  * Phase: `gather`, Priority: `15`.
  * Hooks: `[on_user_message, on_plan, on_observations, on_before_judge]`.
  * Prescribes standard operating procedures for US market trading sessions (Pre-Market 04:00–09:30 ET, Regular 09:30–16:00 ET, After-Hours 16:00–20:00 ET), ticker formatting, timestamp disclosure, and avoiding hallucinating prices when volume is zero.
* **MCP Knowledge Playbook ([`server/mcp/knowledge/financial-markets.md`](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/server/mcp/knowledge/financial-markets.md))**:
  * Details exact REST API schemas, DOM selectors, session rules, and consensus protocols for Google Finance, Nasdaq, Yahoo Finance, and MarketWatch.

### D. Agent Pipeline & System Prompt Integration

* **Wave Dispatch in `gather()` ([`server/research.py`](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/server/research.py))**:
  * Automatically detects equity tickers and financial keywords (`stock`, `nasdaq`, `after-hours`, `quote`, `ticker`).
  * Dispatches `financial_quote` in the initial research wave, skipping slow generic search engines when direct tape data is available.
* **Observation Digestion ([`server/prompt.py`](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/server/prompt.py))**:
  * `digest_obs()` formats JSON payloads from `financial_quote` and `financial_compare` into structured Markdown tables showing regular close, after-hours prints, and source-by-source timestamps.
* **Agent System Prompt ([`server/agent.py`](file:///C:/Users/freed/OneDrive/Desktop/Poor%20man%20ai/server/agent.py))**:
  * Instructs the agent to prioritize `financial_quote` and `financial_compare` for market questions and leverage the `financial-markets` knowledge playbook.

---

## 7. Model Architecture, Parameters, Quantization & Fine-Tuning Studio

To enable Poor Man AI to scale its intelligence dynamically and operate on resource-constrained hardware, an end-to-end parameter and architecture stack was integrated across both Python and TypeScript/React.

### A. Python Architecture & Parameter Engine (`server/architecture.py`)
* **Formal Data Classes & Enums**:
  * `Precision`: `fp32`, `fp16`, `bf16`, `int8`, `int4`, `nf4`.
  * `ModelFamily`: `transformer_decoder`, `moe` (Mixture of Experts), `mamba_ssm`, `tiny_neuron_router`.
  * `ArchitectureSpec`: Full structural blueprint detailing `hidden_dim`, `num_layers`, `num_attention_heads`, `num_kv_heads` (GQA), `vocab_size`, `max_context_length`, `intermediate_dim` (FFN / SwiGLU), `num_experts`, `active_experts`, `norm_type` (RMSNorm), and `activation`.
* **Parameter & Memory Calculators**:
  * `estimate_parameter_count()`: Calculates exact trainable weights across embeddings, Q/K/V/O projections, SwiGLU 3x-matrix expansions, expert multiplications, layer norms, and un-tied LM heads.
  * `estimate_vram_gb()`: Accurately predicts memory consumption for model weights and dynamic KV cache at arbitrary sequence lengths and batch sizes across FP16, INT8, and INT4 with safety activation buffers.
* **Pre-configured Blueprints**:
  * `poor_man_1b`: 16 layers, 2048 hidden dimension, 16 Q heads, 4 KV heads (852.6M params, ~0.60 GB in INT4 AWQ).
  * `poor_man_3b`: 28 layers, 3072 hidden dimension, 24 Q heads, 8 KV heads (3.02B params, ~2.62 GB in INT4 AWQ).
  * `poor_man_moe_8x1b`: 24 layers, 8 experts (2 active routing), 32K context (7.03B params, ~4.63 GB in INT4 AWQ).
  * `poor_man_router_10x12`: 10x12x1 lightweight layer neuron network for instant zero-GPU intent routing.
* **Hyperparameter Presets**:
  * `creative_chat`: Temp 0.85, Top-P 0.92, Top-K 50, Rep-Penalty 1.08.
  * `precise_code`: Temp 0.15, Top-P 0.95, Top-K 20, Rep-Penalty 1.05, High Reasoning Effort.
  * `deep_research`: Temp 0.35, Top-P 0.90, Top-K 40, Rep-Penalty 1.12, High Reasoning Effort.
  * `fast_heuristic`: Temp 0.0, Top-P 1.0, Top-K 1, Rep-Penalty 1.0.
* **Quantization & Fine-Tuning Specifications**:
  * `QuantizationConfig`: AWQ, GPTQ, BitsAndBytes (NF4), GGUF, group sizes (32/64/128), asymmetric zero-points, and double quantization.
  * `FineTuningConfig`: QLoRA, LoRA, DPO, rank $r$, $\alpha$, dropout, learning rate schedules, and gradient accumulation.

### B. FastAPI Studio Endpoints (`server/main.py`)
* `GET /model/architecture`: Exposes live blueprint metadata, estimated parameter counts, and VRAM memory budgets.
* `POST /model/train`: Dispatches fine-tuning jobs (target model, method, epochs, learning rate, dataset path) to the agent blackboard.

### C. TypeScript Type Contracts (`src/types/architecture.ts`)
* Provides compile-time type safety for `ArchitectureSpec`, `ArchitectureBlueprint`, `HyperparametersConfig`, `QuantizationConfig`, and `FineTuningConfig`.

### D. Interactive Studio Cockpit (`src/engines/ArchitectureEngine.tsx`)
* Available under `/architecture` (*"Architecture & Tuning"* in the universal navbar).
* **Tab 1: Architecture Blueprints**: Visual card deck showing model sizes, layer topologies, context lengths, and real-time FP16 vs. INT4 VRAM memory requirements.
* **Tab 2: Hyperparameters**: Real-time sliders and quick presets for temperature, nucleus sampling, top-k, repetition penalties, max tokens, and reasoning depth levels.
* **Tab 3: Quantization (INT4 / NF4)**: Low-bit compression selector covering AWQ, GPTQ, BitsAndBytes NF4, GGUF, group sizes, and double quantization toggles.
* **Tab 4: Fine-Tuning (QLoRA)**: Studio panel to train Poor Man AI on local persistent memory (`server/data/memory.jsonl`) using LoRA / QLoRA adapters, custom ranks, and learning rate schedules.
