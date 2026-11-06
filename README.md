# Better Poor Man AI

Static chat UI over a Go brain. There is no Python in the live path.

`POST /chat` returns NDJSON: `plan`, `tool`, `observation`, `token`, `done`, and `error`.

## What the brain does

- Loads **minishlab/potion-base-8M** (int8 matrix under `apps/brain/data/`).
- Indexes **SQuAD 2.0** passages for local RAG.
- Ranks with BM25, then fuses with cosine rank.
- Calls **grok-4.7** only when `XAI_API_KEY` is set and thinking is medium or high.
- Uses search-engine AI mode (Google AI Mode, Brave Ask, Bing AI Mode, Duck.ai, Yandex), Google News RSS, and Open-Meteo for weather.

## Run locally

```powershell
yarn
yarn prepare:data
yarn dev
```

Open http://127.0.0.1:8000/

`GET /health` should return `"status": "ok"`.

## Checks

```powershell
yarn build
yarn typecheck
yarn lint
yarn test
```

## Hosting

- **Firebase Hosting** (`zerogravity-ab52d`) serves `web/out` only.
- **Vercel** and **Render** run the Go brain container/binary.
- **Supabase** function `api` and **Appwrite** function `score` proxy to Vercel, then Render.

See [webmcp.md](webmcp.md) for the client-tool / WebMCP offload and lean-brain split (math, weather, and time in the browser; research index warms in the background).

The hosted page probes `/health` and uses the first healthy brain:

1. `https://poor-man-ai.vercel.app`
2. `https://poor-man-ai.onrender.com`
3. Supabase `api`
4. Appwrite `score` (`https://poor-man-ai.fra.appwrite.run`)

Copy `.env.example` to `.env` only if you want Grok in the loop. Do not commit the key.
