# WebMCP and the client / brain split

This document describes the structure change that moves cheap work into the Firebase-hosted page and keeps the ~500MB Go backends focused on research.

## Why

Math, weather, and local time used to wake Vercel, Render, and the proxy chain on every turn. Those answers do not need potion-base-8M or the SQuAD index. Running them in the browser cuts backend wakeups and lets the Go brain cold-start faster.

WebMCP is the agent-facing layer on top of the same client tools. It does not replace the Go brain.

## Layers

| Layer | Role | Host |
| --- | --- | --- |
| Static chat UI | Sessions, streaming UI, theme | Firebase Hosting (`web/out`) |
| Client tools + WebMCP | Math, weather, local time in the page | Same Firebase bundle (`web/client-tools.js`) |
| Go brain | Research, RAG, memory, greetings, API fallbacks | Vercel + Render |
| Proxies | Forward `/chat` and `/health` | Supabase `api`, Appwrite `score` |

## Request path

```
User message
    │
    ▼
web/app.js  →  BPMAIClientTools.answerLocally(message)
    │
    ├─ math / weather / time hit
    │     → answer in the browser
    │     → no ensureBrain, no /chat, no hosted wake
    │
    └─ everything else
          → ensureBrain()
          → POST {message, history, thinking_level} to a hosted brain /chat
          → NDJSON plan / tool / observation / token / done
```

## Client tools (`web/client-tools.js`)

Exposed as `window.BPMAIClientTools`:

- `tryMath(message)` — safe arithmetic (same shape as Go `tryMath`)
- `weatherReport(message)` — Open-Meteo geocode + current conditions
- `timeReport(message)` — Open-Meteo timezone + civil clock
- `answerLocally(message)` — returns a reply object or `null`
- `registerWebMCP()` — best-effort tool registration for agents

Reply objects look like:

```js
{
  content: "2+2 = **4**.",
  source: "direct",          // or weather_compare / local_time
  model: "browser-math",     // or browser-open-meteo
  evidence: [{ title, url }] // optional
}
```

`web/app.js` calls `answerLocally` first inside `send()`. On a hit it writes the assistant bubble with a turn-trace note that hosted brains were not called.

### WebMCP registration

Feature-detect and prefer the current entry point:

```js
const mc = document.modelContext ?? navigator.modelContext;
```

Registered tools (when the browser supports WebMCP):

| Tool | Purpose |
| --- | --- |
| `browser_math` | Evaluate a safe expression in the page |
| `browser_weather` | Open-Meteo weather from the visitor browser |
| `browser_local_time` | Local civil time via Open-Meteo timezone |

WebMCP is experimental (Chrome origin trial / flags). Ordinary chat does not depend on it. The offload path runs for every visitor.

Deploy WebMCP with normal hosting. No Cloud Functions and no Blaze plan are required for tool registration.

```powershell
npm run deploy:hosting
```

That builds `web/out` (including `client-tools.js`) and deploys Firebase site `zerogravity-ab52d` (`ai.usavisible.com`).

## Lean Go brain (after offload)

Commit `f9ed477` changed startup so the research index does not block listen:

1. `main` starts HTTP immediately.
2. `go warmBrainData()` loads corpus + embeddings in the background.
3. `ensureBrainData()` (`sync.Once`) loads on first research / RAG use.
4. `GET /health` returns `"warm": true|false` and can peek meta files while cold.

Cheap server paths (greetings, memory, math/weather API fallbacks) do not need the index. Research still uses BM25 + potion-base-8M cosine, then AI-mode search.

### What stays on the server

- Hybrid RAG over SQuAD passages
- AI-mode web search and Google News RSS
- Memory read/write
- Knowledge packs under `apps/brain/mcp/`
- Weather / math / time only as fallbacks for non-browser `/chat` clients

### What left the critical path for page chat

- Arithmetic
- Open-Meteo weather
- Local time by city

## Files

| Path | Change |
| --- | --- |
| `web/client-tools.js` | Client math / weather / time + WebMCP register |
| `web/app.js` | `answerFromBrowser` before hosted `/chat` |
| `web/index.html` | Loads `client-tools.js` before `app.js` |
| `scripts/build-hosting.mjs` | Copies `client-tools.js` into `web/out` |
| `apps/brain/main.go` | Background warm; `/health` `warm` flag |
| `apps/brain/embed.go` | `ensureEmbeddings`, `peekEmbedMeta`, `brainWarm` |
| `apps/brain/retrieve.go` | `ensureCorpus`, `peekCorpusMeta` |
| `apps/brain/turn.go` | `ensureBrainData` before local RAG |
| `apps/brain/rag.go` | `ensureBrainData` on RAG list/index/search |
| `apps/brain/warm_test.go` | Peek + ensure tests |

## Hosting map

| URL | Piece |
| --- | --- |
| https://ai.usavisible.com | Firebase static UI + client tools |
| https://poor-man-ai.vercel.app | Go brain (preferred) |
| https://poor-man-ai.onrender.com | Go brain |
| Supabase `…/functions/v1/api` | Proxy → Vercel → Render |
| Appwrite `poor-man-ai.fra.appwrite.run` | Proxy → Vercel → Render |

## Checks

Browser offload (no `/chat`):

- `what is 2+2?` → `browser-math`
- `what is the weather in Belgrade Serbia?` → `browser-open-meteo`
- `what time is it in London?` → `browser-open-meteo`

Brain still used:

- Research / definitions / news
- Memory (`remember …`)
- Multi-part questions that need search

Health:

```text
GET /health → status=ok, warm=true|false, model=minishlab/potion-base-8M
```

## Not the same as Firebase MCP

| Name | What it is |
| --- | --- |
| **WebMCP** (this doc) | In-page tools for browser agents; ships with Firebase Hosting |
| **Firebase MCP server** | Local IDE/CLI helper (`firebase-tools mcp`) for project management; not deployed to Hosting |
| **`apps/brain/mcp/*.md`** | Knowledge / skill packs embedded in the Go brain |

## Design rule

Put work that only needs the visitor’s browser (and public HTTPS APIs such as Open-Meteo) in `web/client-tools.js`. Keep anything that needs the passage index, embeddings, or AI-mode search on the Go brain, and keep that brain warm in the background so `/health` stays fast on a cold Render or Vercel instance.

## Vercel Go toolchain

`apps/brain/Dockerfile` builds with `golang:1.25-alpine` and `GOTOOLCHAIN=auto`.

`apps/brain/go.mod` on `master` must stay compatible with that image, or rely on `GOTOOLCHAIN=auto` to fetch a newer toolchain. A local dirty `go.mod` that pins `go 1.26.3` while the CLI uploads the working tree (without committing) will fail the container build if the toolchain cannot resolve. Prefer deploying a clean tree that matches `origin/master`, or commit `go.mod` / `go.sum` together with any Go version bump.

## Vercel deploy (GitHub Actions)

Native `vercel git connect` needs a GitHub **Login Connection** on the email-login Vercel account (`theyankeebeat-6449`). Until that works, production auto-deploy uses GitHub Actions:

- Workflow: `.github/workflows/vercel-production.yml`
- Trigger: push to `master`
- Command: `vercel deploy --prod --yes` (container build on Vercel; no `--prebuilt`)

Required GitHub Actions secrets on `theyankeebeat-ai/poor-man-ai`:

| Secret | Value |
| --- | --- |
| `VERCEL_TOKEN` | Create at https://vercel.com/account/tokens |
| `VERCEL_ORG_ID` | `team_tyatlW9pYNVovGHW7i9Vb6iQ` |
| `VERCEL_PROJECT_ID` | `prj_Zw7jP6D8dAuJkLG1duFP4TGejrM3` |

Manual fallback:

```powershell
vercel deploy --prod --yes --project poor-man-ai --scope simpleai1
```

Do not create a new Vercel project for this repo. Production alias stays `https://poor-man-ai.vercel.app`.
