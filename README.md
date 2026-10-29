# Poor Man AI

Next.js cockpit and a Go brain. There is no Python in this tree.

The chat page still speaks NDJSON. `POST /chat` returns one JSON object per line: `plan`, `tool`, `observation`, `token`, `done`, and `error`.

## What is smarter than the archive

The archive ranked WikiText-2 with BERT-tiny (about 4.4 million parameters) and did not split a turn into questions. This version:

- Loads **minishlab/potion-base-8M** (7,559,168 static parameters, MIT). The published float32 file is about 30 MB. `npm run prepare:data` writes a per-row int8 matrix under 25 MB. Inference is WordPiece, mean-pool, then L2. These weights were distilled from `BAAI/bge-base-en-v1.5`.
- Indexes **SQuAD 2.0** passages (`rajpurkar/squad_v2`, CC BY-SA 4.0). The prepared slice is 20,233 unique Wikipedia contexts, 2,371,178 whitespace tokens, and 16,845,988 bytes. WikiText-2 was a language-model dump with no answer spans.
- Ranks with BM25 (`k1=1.5`, `b=0.75`), keeps 32 hits, then fuses that list with cosine rank (reciprocal rank fusion).
- Answers each real question in a turn, up to three, and drops a leading greeting. The reply is rendered with a Jinja template (`apps/brain/templates/answer.jinja`, via pongo2).
- Calls **grok-4.7** at `https://api.x.ai/v1/responses` only when `XAI_API_KEY` is set and thinking is medium or high. The prompt is limited to retrieved evidence. Low thinking, math, greetings, and memory stay local.
- Uses the Wikipedia API and Google News RSS. Open-Meteo answers weather. The browser speech engine speaks. Shell commands are not run.

Router nets are 24×64×32×1 (3,713 weights each). They rank layers and crew roles. They do not write the answer. The 1B and 3B cards on the architecture page are arithmetic estimates. They are not loaded.

## Run locally

```powershell
npm install
npm install --prefix apps/web
npm run prepare:data
npm run dev
```

Open http://localhost:3000/chat. The page stays on Next.js. Browser calls go to `/b/...`, and Next rewrites that prefix to the Go brain on http://127.0.0.1:8000. Direct calls to port 8000 still use `/chat` and `/health`.

`GET /health` should return `"status": "ok"`. `2+2` should answer `2+2 = **4**.` with `n_llm_calls` 0.

## Hosting

Firebase Hosting (Spark, site `zerogravity-ab52d`) serves only the static Next.js export. `npm run build:hosting` writes `apps/web/out`. `npm run deploy:hosting` publishes that folder. The browser does not call `/b` on the hosted site. It probes `/health` and uses the first brain that answers:

1. Vercel container (`https://poor-man-ai.vercel.app`) — the Go brain, larger run capacity
2. Render (`https://poor-man-ai.onrender.com`) — the same Go brain on the free Oregon worker
3. Supabase function `api` — streams the request to Vercel, then Render
4. Appwrite function `score` — same proxy, on `https://6abf29600005f72b00bb.fra.appwrite.run`

`vercel.json` is the brain only (Vercel Services, beta). The Next.js app is not deployed there. Local `npm run dev` still rewrites `/b` to `http://127.0.0.1:8000`.

Copy `.env.example` to `.env` only if you want Grok in the loop. Do not commit the key. The key stays on the Go process.
