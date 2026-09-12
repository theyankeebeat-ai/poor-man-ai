# 🛠️ Architecture & Integration Guide: What Was Taken & Unified

This document serves as the design specification and reference for **Poor Man AI**, detailing the components and capabilities merged from **Grok Cli Ai Build** and **TSX Ai**, how they integrate, and how to extend them in future builds.

---

## 1. High-Level Architecture Overview

Poor Man AI combines a high-performance **FastAPI backend with autonomous multi-agent tool loops** with a **modular React 18 + TypeScript + Tailwind CSS dashboard** with specialized cockpit engines.

```
Poor Man AI
├── Node.js Gateway & MCP Host (Node.js 18+) -> port 3001
│   ├── /api/node/health (Runtime stats, memory, V8 heap diagnostics)
│   ├── /api/node/mcp/rpc (JSON-RPC MCP bridge & tools/call dispatcher: node_eval, node_system_specs)
│   └── /api/node/inspect-package (Live workspace dependencies analyzer)
│
├── Backend (FastAPI, Python 3.10+) -> port 8000
│   ├── /chat (NDJSON streaming agent & code loops with dynamic thinking_level)
│   ├── /health (Cache & server telemetry)
│   ├── /api/real-ai/providers (Universal Multi-LLM provider registry: Gemini, Groq, Ollama, OpenAI, xAI, OpenRouter)
│   ├── /api/real-ai/rag/index & /search (Dense vector pseudo-embeddings & hybrid cosine RAG search)
│   ├── /api/real-ai/guardrails/evaluate (Prompt injection / DAN jailbreak auditor & PII redactor)
│   ├── /memory (Persistent JSONL facts; lessons.jsonl distilled rules)
│   ├── /model/architecture (Neural architecture blueprints, param counter & VRAM budgets)
│   ├── /model/train (QLoRA/LoRA fine-tuning submission & blackboard tracking)
│   ├── /tools (Live Python primitive, financial tools & RAG tools: rag_search, rag_index)
│   ├── /read-url & /api/read-url (Resilient web scraping & browser engine)
│   ├── /mcp/skills (SOP skills: financial-markets, sports-schedule, continual-learn, learn-skill, web-reader, …)
│   ├── /mcp/knowledge (Playbooks: financial-markets, sports-schedules, learned-runtime, skill-learning, …)
│   ├── /mcp/neurons (14×32×16×1 routing banks + crew nets; arch + params_per_net)
│   ├── /tts & /tts/voices (Edge TTS neural speech synthesis)
│   └── /upload (File, image & screen snapshot attachment ingestion)
│
└── Frontend (Vite, React 18 + TSX, Tailwind, Lucide) -> port 5173
    ├── Real AI Studio (/real-ai) -> Universal LLM gateway, Vector RAG search & Guardrail inspector
    ├── Agent Workflow (/agent) -> Pipeline step inspection & simulation
    ├── Chat Assistant (/chat) -> Live chat cockpit: Thinking effort, Web Speech STT, Edge Neural TTS, Screen Vision
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
  * Multi-agent blackboard orchestration: `facts`, `howto`, `schedule`, `time`, `gap`, `debate`, `verifier`, and the rest of `ROSTER` in `server/crew/specialists.py`.
* **MCP Layer & Skills (`server/mcp/`)**:
  * Dynamic file-based skill definitions loaded from `server/mcp/skills/*/SKILL.md`.
  * Knowledge playbooks loaded from `server/mcp/knowledge/*.md`.
  * Execution hooks (`on_user_message`, `on_plan`, `on_observations`, `on_before_judge`, `on_verify`).
  * Self-modification sandbox (`server/mcp/learn.py`): `write_skill`, `write_knowledge`, `list_learned`, **`harvest_turn` / `harvest_lesson`**, **`recall_learned`**. Playbook learning only — not weight training, not AGI.
* **Workspace & Code Execution Tools (`server/code_tools.py`, `server/workspace.py`)**:
  * Controlled workspace sandboxing via `path_from_message` and sticky workspace sessions.
  * Native execution tools: `workspace_info`, `list_dir`, `read_file`, `grep`, `apply_patch`, `write_file`, `run_cmd`, `git_status`, `git_diff`.
* **Neural Routing Banks (`server/neurons.py`)**:
  * Tiny **14×32×16×1** two-hidden-layer nets (~**1,025 weights each**). One bank per MCP layer (`reason`, `skills`, `hooks`, `tools`, `agents`) plus `crew:<role>`.
  * These nets **only rank** skills, tools, and crew. They are **not** a language model and do not write answers.
  * Input features include term overlap, entity hit, junk/JSON traps, geo/numbers, sports/schedule alignment, official-host, follow-up cues, and who/when question alignment.
  * `GET /mcp/neurons` returns `arch`, `params_per_net`, `banks`, `crew`, and a note that the nets are routers only.
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
| **Brain Engine** (`src/engines/BrainEngine.tsx`) | Static mock hyperparameters | Live fetches `/memory` (`server/data/memory.jsonl`) and `/mcp/neurons` (`arch`, `params_per_net`, bank list). Continual rules live in `server/data/lessons.jsonl`. |
| **Skill Engine** (`src/engines/SkillEngine.tsx`) | Hardcoded mock skills list | Live fetches `/mcp/skills` and `/mcp/knowledge` directly from the backend MCP system. |
| **Tools Engine** (`src/engines/ToolsEngine.tsx`) | Hardcoded tool samples | Live fetches `/tools` from FastAPI backend exposing real Python tool parameters and JSONSchemas. |
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
4. For domain logic (schedules, quotes, weather), also wire: query expansion in `local_brain.py`, host preference in `research.py`, coverage/gap rules in `mcp/hooks.py`, a crew specialist, and a few labeled pairs in `neurons.py`. See §11.
5. Durable “next time” rules are harvested automatically (§12). User-taught methods still go through `learn-skill` → `write_skill` / `write_knowledge`.

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
* Sports / weekend / “who is playing” questions expand to official-host queries (`site:nfl.com`, `site:espn.com`, `site:nba.com`), raise `fetch_urls`, and keep follow-ups on the same league slate.

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
  * `poor_man_router_10x12` (live topology in `server/neurons.py`): **14×32×16×1** two-hidden-layer router (~1,025 weights per bank) for zero-GPU intent / skill / tool / crew ranking. Blueprint key kept for studio compatibility; `ArchitectureSpec` uses `hidden_dim=32`, `intermediate_dim=16`, `vocab_size=14`, `num_layers=3`.
* **Hyperparameter Presets**:
  * `creative_chat`: Temp 0.85, Top-P 0.92, Top-K 50, Rep-Penalty 1.08.
  * `precise_code`: Temp 0.15, Top-P 0.95, Top-K 20, Rep-Penalty 1.05, High Reasoning Effort.
  * `deep_research`: Temp 0.35, Top-P 0.90, Top-K 40, Rep-Penalty 1.12, High Reasoning Effort.
  * `fast_heuristic`: Temp 0.0, Top-P 1.0, Top-K 1, Rep-Penalty 1.0 (maps to thinking **low** / Fast).
  * `smarter_agent`: verify + self-critique + citations + crew (maps to thinking **high** / Deep).
  * `THINKING_DEFAULTS`: `low` → fast_heuristic, `medium` → default Hyperparameters, `high` → smarter_agent. Chat UI and `ChatRequest` default to **medium**.
* **Quantization & Fine-Tuning Specifications**:
  * `QuantizationConfig`: AWQ, GPTQ, BitsAndBytes (NF4), GGUF, group sizes (32/64/128), asymmetric zero-points, and double quantization.
  * `FineTuningConfig`: QLoRA, LoRA, DPO, rank $r$, $\alpha$, dropout, learning rate schedules, and gradient accumulation.

### B. FastAPI Studio Endpoints (`server/main.py`)
* `GET /model/architecture`: Exposes live blueprint metadata, estimated parameter counts, and VRAM memory budgets.
* `POST /model/train`: Dispatches fine-tuning jobs (target model, method, epochs, learning rate, dataset path) to the agent blackboard.
* `GET /mcp/neurons`: Live router topology (`arch` = `14x32x16x1`, `params_per_net` ≈ 1025), bank names, and crew nets.

### C. TypeScript Type Contracts (`src/types/architecture.ts`)
* Provides compile-time type safety for `ArchitectureSpec`, `ArchitectureBlueprint`, `HyperparametersConfig`, `QuantizationConfig`, and `FineTuningConfig`.

### D. Interactive Studio Cockpit (`src/engines/ArchitectureEngine.tsx`)
* Available under `/architecture` (*"Architecture & Tuning"* in the universal navbar).
* **Tab 1: Architecture Blueprints**: Visual card deck showing model sizes, layer topologies, context lengths, and real-time FP16 vs. INT4 VRAM memory requirements.
* **Tab 2: Hyperparameters**: Real-time sliders and quick presets for temperature, nucleus sampling, top-k, repetition penalties, max tokens, and reasoning depth levels.
* **Tab 3: Quantization (INT4 / NF4)**: Low-bit compression selector covering AWQ, GPTQ, BitsAndBytes NF4, GGUF, group sizes, and double quantization toggles.
* **Tab 4: Fine-Tuning (QLoRA)**: Studio panel to train Poor Man AI on local persistent memory (`server/data/memory.jsonl`) using LoRA / QLoRA adapters, custom ranks, and learning rate schedules.

---

## 10. Chat Assistant 2.0: Cognitive Effort, Voice Mode, WebRTC Screen Vision & Session Management

To deliver an interactive assistant experience on par with frontier commercial chat systems while running strictly against local orchestrators and tools, the **Chat Assistant (`src/AIChatInterface.tsx`)** has been expanded into a full multimodal cockpit.

### A. Dynamic Thinking Effort & Reasoning Level (Low / Medium / High)

Rather than fixing the agent to a static loop depth, the user can dial reasoning effort on demand:

```
[UI Selector: Fast / Standard / Deep]   default = Standard (medium)
       │
       ▼ streamChat(..., { thinking_level: 'low' | 'medium' | 'high' })
[FastAPI /chat] -> ChatRequest.thinking_level (default medium)
       │
       ▼ run_agent(..., thinking_level='...')
[Agent Loop Orchestrator (`server/agent.py`)]
       ├── Low (Fast): cap ≤ 5, skip extra hops; UI max_steps ≈ 4
       ├── Medium (Standard): cap 8–12 (UI ≈ 10), crew + search/read
       └── High (Deep): cap ≥ 16 (UI ≈ 18), critique, verify, extra gap-search
```

* **Default is Standard**, not Fast. Fast starved sports/follow-up questions of tool steps. Existing browser sessions saved as Fast stay Fast until the user switches the selector.
* **System Prompt Injection**: `server/architecture.py` `intelligence_prompt_extras()` injects coverage, verify, self-critique, citations, and crew flags. High effort requires verify/lint/citations before stop; low effort stays concise.

### B. Multi-Session Conversation Management & New Chat

* **State Isolation**: Conversations are decoupled into distinct `ChatSession` records:
  ```typescript
  export interface ChatSession {
    id: string;
    title: string;
    updatedAt: number;
    messages: ChatMessage[];
    mode: 'agent' | 'code';
    thinkingLevel: 'low' | 'medium' | 'high';
  }
  ```
* **Persistence & History Drawer**:
  * Sessions are serialized to browser `localStorage` (`poor_man_chat_sessions_v2`).
  * Clicking **`+ New Chat`** seeds a new conversation thread without purging historical discussions.
  * A dropdown drawer allows users to switch between saved conversations, view timestamps, and delete individual conversation threads.
  * The session title automatically adapts to the user's first prompt (truncated to 32 characters).

### C. One-Click Copy System & Markdown Export

* **Per-Message Copy**:
  * Hovering/clicking the copy icon on any user or assistant message bubble extracts the raw Markdown prose (stripping tool invocation traces and UI wrappers) and copies it to the system clipboard, displaying an animated green checkmark for visual confirmation.
* **Full Transcript Export**:
  * The **`Copy Chat`** button in the navigation header generates a structured Markdown document of the entire active session with timestamps and role badges (`User` / `Poor Man AI Assistant`), making it trivial to archive or share conversations.

### D. Local Voice Mode (Microphone STT & Neural TTS)

Poor Man AI incorporates a dual-engine voice subsystem operating directly in the browser with zero external cloud dependencies:

1. **Speech-to-Text (Microphone)**:
   * Powered by the browser's native Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`).
   * Activating the microphone provides real-time streaming speech-to-text directly into the message input.
   * Visual feedback includes an animated red pulse and a dynamic *"Listening to your voice..."* placeholder.
2. **Text-to-Speech (Speaker)**:
   * Assistant messages include a speaker toggle button that converts response text into natural audio.
   * **Primary Pipeline**: Routes text to FastAPI `/tts` powered by Microsoft Edge Neural TTS (`edge_tts`), streaming MP3 audio into an in-memory `Blob` and `Audio` object.
   * **Speech Sanitization**: Strips backtick code blocks, URLs, and markdown formatting before passing prose to the synthesis engine to ensure natural auditory delivery.
   * **Browser Fallback**: Automatically cascades to `window.speechSynthesis` if the backend TTS service is unavailable.
3. **Hands-Free Auto Voice Mode**:
   * A **`Voice Mode`** toggle in the toolbar enables continuous interaction: as soon as the assistant finishes generating a response, it automatically speaks the result aloud.

### E. WebRTC Screen Sharing & Visual Frame Analysis ("Eyes for Poor Man AI")

To allow Poor Man AI to inspect local code editors, terminal windows, browser tabs, and debugging consoles, live screen sharing has been unified with the vision pipeline:

```
[User Browser Screen]
       │
       ▼ navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
[Local WebRTC Video Track in <video autoPlay>]
       │
       ▼ User clicks "Capture & Ask AI"
[HTML5 Canvas Snapshot (1280x720 PNG Blob)]
       │
       ▼ uploadFile() -> POST /upload (`server/main.py`)
[Saved to server/data/uploads/<hash>.png]
       │
       ▼ Prompt Injected: "[Attached image: /static/uploads/...] Analyze what is shown on screen"
[Agent reads image with read_image tool via Vision LLM]
```

* **Live Stream Dock**: When screen sharing is active, a floating video feed thumbnail with a blinking `LIVE` badge appears at the top of the chat.
* **Autonomous Vision Inspection**: The captured snapshot is ingested through `/upload`, generating a static preview URL. When submitted, the backend agent's `read_image` tool (`server/tools.py`) inspects the pixels using local vision or API endpoints to detect syntax errors, UI bugs, or diagram structures directly from the user's screen.

---

## 11. Intelligence Stack: Routers vs Language Model vs Domain Logic

Poor Man AI does **not** get smarter by treating the tiny nets as a substitute LLM. Intelligence is layered:

```
User question
    │
    ├─ 0. recall_lessons()        inject prior distilled rules into the plan
    ├─ 1. local_brain.think()     intent, mode, follow-up goal, search queries
    ├─ 2. neurons.py routers      rank skills / tools / crew (14×32×16×1)
    ├─ 3. gather() + tools        web_search, read_url, APIs, finance, weather
    ├─ 4. crew blackboard         facts, schedule, gap, skeptic, judge, verifier
    ├─ 5. Answer model            Grok / cloud / local GGUF writes prose
    └─ 6. harvest_turn()          one durable rule → lessons.jsonl (+ learned-runtime pack)
```

| Layer | Parameters | What it does |
|---|---|---|
| Routing nets (`server/neurons.py`) | ~1,025 weights × ~30 banks | Pick *which* skill/tool/crew fires |
| Skills + knowledge (`server/mcp/`) | Markdown SOPs | Stop rules, sports slates, finance tapes, citations |
| Continual lessons (`lessons.jsonl`) | Append-only rules | “Next time do X”; recalled on similar questions |
| Tool loop (`max_steps` / thinking_level) | 4–18 steps | How much evidence is gathered |
| Answer LLM | millions–billions | Actual English / code generation |

Scaling the router to millions of weights does not add language IQ. Adding **skills, official-host reads, follow-up expansion, and Standard/Deep thinking** does.

### A. Sports schedules (NFL / NBA / weekend follow-ups)

Failure mode this stack was built to stop: repeating generic “Sunday 1:00 / 4:25 / 8:20 p.m. ET” windows instead of **named matchups**.

| Piece | Path |
|---|---|
| Skill | [`server/mcp/skills/sports-schedule/SKILL.md`](server/mcp/skills/sports-schedule/SKILL.md) |
| Playbook | [`server/mcp/knowledge/sports-schedules.md`](server/mcp/knowledge/sports-schedules.md) |
| Crew agent | `schedule_agent` in `server/crew/specialists.py` (extracts `Away at Home` / `vs` + kickoff times) |
| Query expansion | `SPORTS_RE` in `server/local_brain.py`; follow-ups inherit league + “named matchups kickoff times” |
| Coverage | `server/mcp/hooks.py` treats sports evidence as thin unless the blob has `vs` / `at` / team names → gap-search `site:nfl.com` / ESPN schedule |
| Host preference | `server/research.py` ranks `nfl.com`, `nba.com`, `espn.com`, `wnba.com`, `mlb.com`, `nhl.com` with docs hosts |
| Prompt | `SYSTEM_CORE` + `agent.py` SYSTEM: do not answer “who is playing” with TV windows |

### B. How to extend intelligence (preferred order)

1. **Thinking level** — Standard or Deep (more tool steps, verify, crew). Fast is for chit-chat.
2. **Stronger answer model** — Grok / larger local GGUF (this is the real parameter count).
3. **New `SKILL.md` + knowledge pack** — same pattern as `sports-schedule` and `financial-markets`.
4. **Router features + labeled pairs** in `server/neurons.py` — only to rank tools/skills, not to generate text.
5. **QLoRA on `server/data/memory.jsonl`** via `/architecture` — teaches local facts, not general IQ. This is **manual** fine-tuning, not automatic AGI.

---

## 12. Continual Learning (Playbooks, Not AGI)

Poor Man AI **self-improves SOPs and facts**. It does **not** train the language model after each chat and is **not** AGI.

### A. What “learning” means in this repo

| Mechanism | Path | Effect |
|---|---|---|
| Memory fact | `server/data/memory.jsonl` | Append-only recall (`memory_write` / FTS) |
| Distilled lesson | `server/data/lessons.jsonl` | One “next time do X” rule per grounded research turn |
| Runtime pack | `server/mcp/knowledge/learned-runtime.md` | Rolling summary of recent lessons for `consult_knowledge` |
| Installed skill | `server/mcp/skills/<name>/SKILL.md` | User-asked methods via `write_skill` (`learn-skill`) |
| Knowledge pack | `server/mcp/knowledge/<name>.md` | Definitions / playbooks via `write_knowledge` |
| QLoRA job | `POST /model/train` | Optional, user-started adapter training — not per-turn |

Caches for skills/knowledge invalidate on write (`server/mcp/learn.py` `_invalidate()`). Tiny routing nets still retrain only from **fixed labeled pairs** on import, not from chat.

### B. Automatic harvest / recall loop

```
research/web-only or LLM final_answer
        │
        ▼ harvest_turn(message, answer, observations, kind)
server/mcp/learn.py
        ├── distill one rule (sports: named matchups; else a sourced claim)
        ├── skip chat/calc, errors, duplicates, generic 1pm ET windows without teams
        ├── append lessons.jsonl + short memory_write
        └── after ≥3 lessons, rewrite learned-runtime.md
        │
next similar question
        ▼ recall_lessons(goal) inside local_brain.think()
plan.notes += "Learned: …"
```

* **Orchestrator hooks**: `run_web_only_agent` and `run_agent` call `harvest_turn` after a grounded answer (`server/agent.py`).
* **Tools**: `harvest_lesson`, `recall_learned`, `list_learned`, `write_skill`, `write_knowledge`.
* **Skills**: [`continual-learn`](server/mcp/skills/continual-learn/SKILL.md) (auto on research), [`learn-skill`](server/mcp/skills/learn-skill/SKILL.md) (when the user says learn / teach yourself).
* **Playbook**: [`skill-learning.md`](server/mcp/knowledge/skill-learning.md).

### C. Explicit limits (do not document this as AGI)

* Answer model **weights do not change** from harvest or memory.
* Harvest stores **one short rule**, not the whole essay, and refuses junk/tool-error dumps.
* `write_skill` / `write_knowledge` are sandboxed (name regex, ~24k body cap, existing tools only).
* Growing `lessons.jsonl` makes **this machine** better at repeating its own procedures; it does not yield general intelligence.

---

## 13. Production Real AI Stack (Node.js Gateway, Python RAG/Guardrails, React TSX Studio)

To elevate Poor Man AI into a fully functional, production-ready AI ecosystem, real AI enterprise capabilities have been integrated across Node.js, Python, and React TSX:

### A. Node.js Agent Gateway & MCP JSON-RPC Server (`cli/node_gateway.mjs`)
* **Node.js 18+ HTTP/JSON-RPC Host**: Runs on port 3001 (`yarn dev:node`).
* **Model Context Protocol (MCP) Bridge**: Exposes standard `tools/list` and `tools/call` over JSON-RPC for executing JavaScript evaluation in isolated V8 context (`node_eval`) and system hardware telemetry (`node_system_specs`).
* **Live Runtime Diagnostics**: `GET /api/node/health` provides real-time RSS, heap allocation, platform details, and active process metrics.
* **Workspace Inspector**: `GET /api/node/inspect-package` exposes live project dependencies and manifest state to the orchestrator.

### B. Python Real AI Engine (`server/real_ai.py`)
1. **Universal LLM Providers Gateway (`/api/real-ai/providers`)**:
   * Out-of-the-box registry for **Google Gemini** (`gemini-1.5-flash`, `gemini-1.5-pro`), **Groq LPU** (`llama-3.3-70b-versatile`), **Ollama** (`llama3.2:latest`, `deepseek-r1`), **OpenAI** (`gpt-4o-mini`, `o1-mini`), **xAI Grok** (`grok-beta`), and **OpenRouter**.
   * Automatic environment key resolution, model routing, vision flags, and tool schema verification.
2. **Dense Vector Embeddings & Local RAG Vector Store (`/api/real-ai/rag/*`)**:
   * Deterministic 64-dimensional dense pseudo-embedding generator using locality-sensitive n-gram hashing—zero 2GB downloads or heavy torch requirements.
   * Hybrid semantic search combining **cosine vector similarity** with token overlap matching.
   * Direct agent tool integration (`rag_search`, `rag_index`) allowing autonomous indexing and recall of technical documentation, code snippets, and playbooks.
3. **Safety Guardrails & Adversarial Injection Evaluator (`/api/real-ai/guardrails/evaluate`)**:
   * Real-time regex and heuristic detection for DAN prompts, instruction overrides, and jailbreak injections before agent execution in `server/agent.py`.
   * PII Redactor: Automatically scrubs emails, SSNs, credit card numbers, and raw API keys from prompt trajectories and memory stores.

### C. React TSX Real AI Cockpit Studio (`src/engines/RealAIEngine.tsx`)
* Dedicated route `/real-ai` accessible from top universal navigation bar.
* **Tab 1: LLM Providers**: Live status cards showing active API keys, base endpoints, tool call support, and model selectors.
* **Tab 2: Vector RAG**: Live chunk ingestion panel, vector size indicators, and interactive semantic search with cosine score visualizations.
* **Tab 3: Guardrail Inspector**: Interactive prompt tester displaying pass/reject decisions, triggered safety rules, and sanitized PII output previews.

---

## 14. Multi-Agent Routing Topology: Hybrid Hub-and-Spoke with Broadcast Bus

To overcome the latency, rate limiting, and context window explosion inherent in "every agent talks to everyone" ($O(N^2)$ cross-mesh), Poor Man AI implements a **Hybrid Hub-and-Spoke with Broadcast Bus** topology.

```
                      ┌────────────────────────────────────────┐
                      │        Coordinator / Arbiter (Hub)     │
                      │  - Goal Decomposition                  │
                      │  - Max 1-Round Debate Arbitration      │
                      └──────────────────┬─────────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │       Shared Blackboard Broadcast Bus         │
                 │  - task_init | debate:* | verdict:* | gaps    │
                 └───────┬───────────────┬───────────────┬───────┘
                         ▲               ▲               ▲
                         │               │               │
                  ┌──────▼─────┐  ┌──────▼─────┐  ┌──────▼─────┐
                  │  Worker A  │  │  Worker B  │  │  Worker C  │
                  │ (Librarian)│  │  (Skeptic) │  │  (Logic)   │
                  └────────────┘  └────────────┘  └────────────┘
```

### A. Core Mechanics & Design Trade-offs

1. **Linear Message Complexity ($O(N)$ vs $O(N^2)$)**:
   * Rather than spawning peer-to-peer point-to-point connections where all agents ping each other simultaneously, agents publish announcements, queries, and proposed actions to the **Broadcast Bus** on the shared `Blackboard` (`server/crew/board.py`).
   * Spokes read relevant broadcast events directly from memory rather than incurring compounding LLM token prompts.

2. **Bounded 1-Round Debate & Strict Arbitration**:
   * Multi-agent debate is protected by a strict bounded guarantee: `max_debate_rounds = 1`.
   * When spokes raise trade-off or risk questions (`open_debate`), conflicting viewpoints (e.g. `skeptic` vs `logic`) submit structured `DebateProposal`s with confidence scores.
   * The **Hub Coordinator** evaluates proposals and emits a binding `arbitrate_debate` verdict onto the bus in a single step, halting infinite debate loops and context window thrashing.

3. **Backend Implementation**:
   * **Data Structures (`server/crew/board.py`)**: `BroadcastMessage`, `DebateProposal`, `DebateTopic`, and bus operations (`broadcast()`, `reply_to_broadcast()`, `open_debate()`, `submit_proposal()`, `arbitrate_debate()`, `bus_log()`).
   * **Orchestra Integration (`server/crew/orchestra.py`)**: Automatic task initialization broadcast in Phase 1; gap alerts broadcast in Phase 4; course-of-action debate arbitration in Phase 5 streamed to client via `hub:broadcast_bus` SSE events.
   * **API Endpoints (`server/main.py`)**:
     * `GET /crew/router`: Inspects active routing topology, bounds, and cost-efficiency profile.
     * `POST /crew/broadcast-test`: Automated integration harness verifying bus broadcasting and arbitration resolution.

4. **Frontend Cockpit Integration (`src/AIAgentInterface.tsx`)**:
   * Dedicated **"Hub & Broadcast Bus"** tab in the Agent Workflow interface.
   * Displays live broadcast bus events, priority badges (`URGENT`/`NORMAL`), spoke proposal cards, and Hub arbiter verdicts alongside token and latency bounds.


