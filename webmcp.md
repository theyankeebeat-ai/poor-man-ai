# WebMCP and the five-role split

Cheap work runs in the Firebase page (and WebMCP agents). The ~500MB hosts no longer run AI-mode search engines. Each host has one job.

**Current ship commit for this layout:** `0e19f51` (role split + search disabled).

## Why

Math, weather, and local time do not need potion-base-8M or the SQuAD index. Running them in the browser cuts backend wakeups.

Live AI-mode search (Duck.ai, Google AI Mode, Brave Ask, Bing, Yandex, Google News RSS) flooded the 500MB brains with scrape panels and produced hallucinations. Those engines are **disabled**. Research uses **local RAG only**.

WebMCP is the agent-facing layer on top of the same client tools. It does not replace the Go brains.

## Five roles

| # | Role | Host | Job |
| --- | --- | --- | --- |
| 1 | UI + WebMCP | Firebase Hosting `zerogravity-ab52d` | Static chat, client tools, WebMCP registration |
| 2 | Chat API | Supabase function `api` | Gateway for `/chat` and `/health` → brains |
| 3 | Brain A | Vercel `poor-man-ai` | Lean Go brain: RAG + memory + greetings |
| 4 | Brain B | Render `poor-man-ai` | Second lean Go brain (same binary) |
| 5 | Compute | Appwrite function `score` | `/sanitize`, `/math`, `/compute` only |

Live URLs:

| Role | URL |
| --- | --- |
| UI | https://ai.usavisible.com · https://zerogravity-ab52d.web.app |
| Chat API | https://wqrriztbsifgytjzippi.supabase.co/functions/v1/api |
| Brain A | https://poor-man-ai.vercel.app |
| Brain B | https://poor-man-ai.onrender.com |
| Compute | https://poor-man-ai.fra.appwrite.run |

## Request path

```
User or WebMCP agent message
    │
    ▼
web/app.js  →  BPMAIClientTools.answerLocally(message)
    │
    ├─ math / weather / time hit
    │     → answer in the browser
    │     → no ensureBrain, no /chat
    │
    └─ everything else
          → sanitizeForBrain(message + history)   # strip links / noise
          → ensureBrain()                         # prefers Supabase chat API
          → POST /chat {message, history, thinking_level}
                Supabase chat-api
                    → Vercel brain A
                    → else Render brain B
          → NDJSON plan / tool / observation / token / done
                tools: rag_search, memory_*, weather/time fallbacks
                (no web_search engines)
```

Chat upstream order in `web/app.js` (`HOSTED_BRAINS`):

1. Supabase chat API  
2. Vercel brain A  
3. Render brain B  

Appwrite is **not** a chat upstream.

## Client tools (`web/client-tools.js`)

`window.BPMAIClientTools`:

| API | Purpose |
| --- | --- |
| `tryMath` / `weatherReport` / `timeReport` | Cheap browser answers |
| `answerLocally` | Returns a reply object or `null` |
| `sanitizeForBrain` / `sanitizeHistoryForBrain` | Clean payload before `/chat` |
| `runAgent` | Thin agent: local tools first, then `BPMAIChat.sendText` |
| `registerWebMCP` | Best-effort `document.modelContext` registration |
| `listAgentTools` | Names exposed to agents |
| `webmcpReady` | Whether registration succeeded |

`window.BPMAIChat` (from `web/app.js`):

| API | Purpose |
| --- | --- |
| `sendText(message, { fromAgent })` | Full chat turn (offload → sanitize → brain) |
| `getLastReply` | Latest assistant bubble |
| `clearSession` / `newChat` | Session control |
| `getStatus` | `apiBase`, `computeApi`, busy, `search: "disabled"` |

### WebMCP tools

Prefer `document.modelContext` (fall back to `navigator.modelContext`).

| Tool | Purpose |
| --- | --- |
| `agent_ask` | Preferred natural-language entry |
| `browser_math` | Safe arithmetic in the page |
| `browser_weather` | Open-Meteo from the visitor browser |
| `browser_local_time` | Civil clock via Open-Meteo timezone |
| `send_chat` | Drive chat UI (offload or hosted `/chat`) |
| `get_last_reply` | Read last assistant reply |
| `clear_session` / `new_chat` | Session control |
| `chat_status` | Session + API status |

External agents (Chrome DevTools MCP with `--category-experimental-webmcp`, Playwright `page.webmcp`, Kitesurf) should prefer **`agent_ask`**.

WebMCP is experimental. Ordinary chat does not depend on it. Browser offload still runs for every visitor.

### Sanitize before the brain

On every hosted `/chat` payload:

- Strip `http(s)` / `www` URLs, markdown links (keep label text), `data:` URIs, emails  
- Strip HTML/script/style and cookie/privacy/subscribe chrome lines  
- Cap length (~8000 chars message; ~2000 per history turn)  

The bubble shows the original text. Only the brain request is cleaned. Turn trace may show `webmcp-sanitize`.

Appwrite compute exposes the same sanitize idea at `POST /sanitize` for agents that call compute directly.

## Role details

### 1. Firebase UI + WebMCP

- Public: `web/out` via `scripts/build-hosting.mjs`  
- Files: `index.html`, `app.js`, `styles.css`, `client-tools.js`  
- Deploy: `yarn build` then `npm run deploy:hosting` (or `yarn` equivalent)

### 2. Supabase chat API (`supabase/functions/api`)

- `role: "chat-api"`, `search: "disabled"`  
- `GET /health` — probes Vercel then Render; returns brain status list  
- `GET /role` — self-description  
- Other paths — proxy to first healthy brain; sets `x-bpmai-brain` / `x-bpmai-role`  
- Deploy: `supabase functions deploy api --project-ref wqrriztbsifgytjzippi`

### 3–4. Lean Go brains (Vercel + Render)

- `role: "brain"`, `search: "disabled"`  
- Background warm: listen first, load corpus/embeddings in a goroutine  
- Research: local BM25 + potion-base-8M RAG only  
- Also: memory, greetings, weather/time/math **fallbacks** for non-browser clients  
- `/health` includes `warm`, `model`, `passages`  
- Deploy Vercel: `vercel deploy --prod --yes --project poor-man-ai --scope simpleai1`  
- Deploy Render: `render deploys create srv-dajg6eh594qs73c38mj0 --commit <sha> --confirm`  
- GitHub Actions also deploys Vercel on push to `master` (windows-latest workflow)

### 5. Appwrite compute (`functions/score`)

- `role: "compute"`, `search: "disabled"`  
- Endpoints: `GET /health`, `POST /sanitize`, `POST /math`, `POST /compute`  
- Does **not** proxy `/chat` to brains  
- Deploy: `appwrite functions create-deployment --function-id score --code functions/score --entrypoint main.py --activate`

## Lean brain cold start

1. `main` starts HTTP immediately.  
2. `go warmBrainData()` loads corpus + embeddings in the background.  
3. `ensureBrainData()` (`sync.Once`) loads on first RAG use.  
4. Cold `/health` can peek meta files and return `warm: false`.

## What each side owns

| In the browser / WebMCP | On the lean brains | On Appwrite compute |
| --- | --- | --- |
| Math, weather, local time | Hybrid RAG (SQuAD index) | Sanitize text |
| Session tools | Memory read/write | Safe math |
| Sanitize before `/chat` | Knowledge packs (`apps/brain/mcp`) | |
| Thin `agent_ask` | Greetings / chat fallbacks | |

| Removed from all 500MB hosts |
| --- |
| Duck.ai, Google AI Mode, Brave Ask, Bing, Yandex |
| Google News RSS as a live search feed |
| Appwrite/Supabase as brain-style search scrapers |

## Files

| Path | Role |
| --- | --- |
| `web/client-tools.js` | Offload, sanitize, WebMCP, `runAgent` |
| `web/app.js` | `sendText`, `BPMAIChat`, Supabase-first upstreams |
| `web/index.html` | Loads `client-tools.js` before `app.js` |
| `scripts/build-hosting.mjs` | Copies client bundle into `web/out` |
| `supabase/functions/api/index.ts` | Chat API gateway |
| `functions/score/main.py` | Appwrite compute |
| `apps/brain/turn.go` | RAG-only research path |
| `apps/brain/search.go` | `webSearch` returns empty (engines off) |
| `apps/brain/main.go` | `/health` role/brain + search disabled |
| `apps/brain/embed.go` / `retrieve.go` | Lazy warm / ensure |
| `.github/workflows/vercel-production.yml` | Vercel deploy on `master` |

## Checks

Browser offload (no `/chat`):

- `what is 2+2?` → `browser-math`  
- `what is the weather in Belgrade Serbia?` → `browser-open-meteo`  
- `what time is it in London?` → `browser-open-meteo`

Brain via chat API (RAG / memory):

- Definitions and multi-part questions answered from local corpus when possible  
- `remember …` memory writes  
- No live web-search panels in the turn trace  

Health shapes:

```text
GET Supabase …/api/health  → status=ok, role=chat-api, search=disabled, brains=[…]
GET Vercel|Render /health  → status=ok, role=brain, search=disabled, warm=true|false
GET Appwrite /health       → status=ok, role=compute, search=disabled
```

## Deploy all five

```powershell
yarn build
npm run deploy:hosting
vercel deploy --prod --yes --project poor-man-ai --scope simpleai1
supabase functions deploy api --project-ref wqrriztbsifgytjzippi
appwrite functions create-deployment --function-id score --code functions/score --entrypoint main.py --activate
render deploys create srv-dajg6eh594qs73c38mj0 --commit <sha> --confirm
```

Pushing `master` also triggers the Vercel GitHub Actions workflow when `VERCEL_TOKEN` is set.

## Not the same as Firebase MCP

| Name | What it is |
| --- | --- |
| **WebMCP** (this doc) | In-page tools for browser agents; ships with Firebase Hosting |
| **Firebase MCP server** | Local IDE/CLI helper (`firebase-tools mcp`); not deployed to Hosting |
| **`apps/brain/mcp/*.md`** | Knowledge / skill packs inside the Go brain |

## Design rules

1. Browser-cheap work stays in `web/client-tools.js`.  
2. Chat goes through Supabase when possible; Vercel and Render are brains, not scrapers.  
3. Appwrite computes; it does not answer research chat.  
4. Never re-enable AI-mode search engines on these 500MB hosts without a larger memory budget.  
5. Sanitize agent/web noise before every brain call.

## Vercel notes

- Dockerfile: `golang:1.25-alpine` + `GOTOOLCHAIN=auto`  
- Keep `go.mod` clean for CLI uploads (dirty `go 1.26.x` broke a production build once)  
- Native `vercel git connect` needs a GitHub Login Connection on account `theyankeebeat-6449`; until then use Actions or `vercel deploy --prod`  
- Actions secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID=team_tyatlW9pYNVovGHW7i9Vb6iQ`, `VERCEL_PROJECT_ID=prj_Zw7jP6D8dAuJkLG1duFP4TGejrM3`  
- Do not create a second Vercel project for this repo  
