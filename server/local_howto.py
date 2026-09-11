"""Local how-to templates for common coding questions.

Skips web scrape + Medium essay dumps when a short official-style example is enough.
"""

from __future__ import annotations

import re

_TEMPLATES: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(
            r"stream(?:ing)?\s+ndjson|ndjson.*stream|streamingresponse.*ndjson|"
            r"fastapi.*(?:stream|ndjson)|stream.*fastapi",
            re.I,
        ),
        """**FastAPI NDJSON streaming** — yield one JSON object per line with `StreamingResponse`.

```python
import json
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

app = FastAPI()

async def ndjson_rows():
    for i in range(3):
        yield json.dumps({"i": i, "ok": True}) + "\\n"

@app.get("/events")
def events():
    return StreamingResponse(ndjson_rows(), media_type="application/x-ndjson")
```

Clients read line-by-line (`split("\\n")` / readline). Prefer NDJSON over fake ChatGPT token streaming unless you need SSE (`text/event-stream`).

Docs: https://fastapi.tiangolo.com/advanced/custom-response/#streamingresponse
""",
    ),
    (
        re.compile(
            r"usecallback|usememo|use\s*callback|use\s*memo",
            re.I,
        ),
        """**`useCallback` vs `useMemo` (React 18)** — both memoize; they return different things.

- **`useMemo(() => value, deps)`** — cache a **computed value**.
- **`useCallback(() => fn, deps)`** — cache a **function** (same as `useMemo(() => fn, deps)`).

```tsx
import { useCallback, useMemo, useState } from "react";

function List({ items }: { items: string[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => items.filter((x) => x.includes(q)),
    [items, q],
  );
  const onSelect = useCallback((id: string) => {
    console.log(id);
  }, []);
  return (
    <>
      <input value={q} onChange={(e) => setQ(e.target.value)} />
      {filtered.map((x) => (
        <button key={x} onClick={() => onSelect(x)}>{x}</button>
      ))}
    </>
  );
}
```

Use them when a child is wrapped in `React.memo` / you pass the value into other hooks' deps — not by default on every render.

Docs: https://react.dev/reference/react/useMemo · https://react.dev/reference/react/useCallback
""",
    ),
    (
        re.compile(
            r"asyncio\.gather|semaphore.*(?:http|tavily|parallel)|"
            r"gather.*semaphore|parallel\s+http.*semaphore",
            re.I,
        ),
        """**`asyncio.gather` + `Semaphore`** — bound concurrency so tools don't hammer an API.

```python
import asyncio
import httpx

sem = asyncio.Semaphore(5)  # max 5 in flight

async def fetch(client: httpx.AsyncClient, url: str) -> str:
    async with sem:
        r = await client.get(url)
        r.raise_for_status()
        return r.text

async def main(urls: list[str]) -> list[str]:
    async with httpx.AsyncClient(timeout=30) as client:
        return await asyncio.gather(*(fetch(client, u) for u in urls))
```

Raise/lower the semaphore limit for Tavily (or any rate-limited search). `gather` still runs all tasks; the semaphore only caps how many hold the lock at once.

Docs: https://docs.python.org/3/library/asyncio-task.html#asyncio.gather · https://docs.python.org/3/library/asyncio-sync.html#asyncio.Semaphore
""",
    ),
    (
        re.compile(
            r"(?:how\s+to\s+)?(?:run|use|start).*(?:cli|ai\.ps1)|"
            r"coding\s+agent\s+cli|grok\s+cli\s+ai|"
            r"ai\.ps1",
            re.I,
        ),
        """**Coding agent CLI** — keep the API up, then call `ai.ps1` from the **target project** folder.

```powershell
# Terminal A — from Grok Cli Ai Build
yarn dev
# or: yarn dev:api

# Terminal B — from YOUR app folder
cd C:\\Users\\freed\\OneDrive\\Desktop\\YourApp
& "C:\\Users\\freed\\OneDrive\\Desktop\\Grok Cli Ai Build\\cli\\ai.ps1" build a digital clock with Vite React
```

Posts `{ message, workspace: cwd, mode: "code" }` to `http://127.0.0.1:8000/chat`. Needs `XAI_API_KEY` or `~/.grok/auth.json`. Logs: `%TEMP%\\grok-ai-cli\\`.
""",
    ),
    (
        re.compile(
            r"(?:powershell|windows).*(?:mkdir|create.?dir|new.?folder)|"
            r"mkdir\s+-p|bash.*(?:to|vs).*powershell|"
            r"translate\s+bash|powershell\s+equivalent",
            re.I,
        ),
        """**Bash → PowerShell (common)**

| Bash | PowerShell |
|------|------------|
| `mkdir -p a\\b` | `New-Item -ItemType Directory -Force -Path a\\b` |
| `echo hi > f.txt` | `Set-Content -Path f.txt -Value hi -Encoding utf8` |
| `cat f.txt` | `Get-Content f.txt` |
| `export FOO=1` | `$env:FOO = "1"` |
| `cmd1 && cmd2` | `cmd1; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; cmd2` |
| `rm -rf d` | Prefer not; agent blocks recursive wipe |

Agent `run_cmd` only allows: python, py, npm, npx, node, git, pytest, pip, tsc, yarn, uv.
""",
    ),
    (
        re.compile(
            r"create[- ]?vite|scaffold.*(?:vite|react)|"
            r"(?:empty|new)\s+(?:vite|react)\s+(?:app|project)|"
            r"npm\s+create\s+vite",
            re.I,
        ),
        """**Scaffold Vite + React + TypeScript (non-interactive)**

```powershell
npx --yes create-vite@latest . --template react-ts
npm install
npm run build
```

`CI=1` is set for agent runs so prompts do not hang. If the folder is not empty, write `package.json` / `vite.config.ts` / `src/App.tsx` yourself instead of fighting create-vite. Prefer `yarn` when `yarn.lock` exists.

Docs: https://vitejs.dev/guide/
""",
    ),
    (
        re.compile(
            r"(?:how\s+to\s+)?(?:run\s+)?(?:yarn|npm)\s+lint|"
            r"fix\s+eslint|eslint\s+errors|"
            r"tsc\s+--noemit",
            re.I,
        ),
        """**Lint / typecheck loop**

```powershell
# Prefer lockfile: yarn.lock → yarn; else npm
yarn lint
# or
npm run lint
npx tsc --noEmit
```

Report every `file:line — message`, search the **exact** ESLint/TS rule, smallest patch, re-lint until exit 0. Do not claim clean without an exit-0 observation.
""",
    ),
]


def local_howto_answer(message: str) -> str | None:
    q = (message or "").strip()
    if len(q) < 12:
        return None
    for pat, body in _TEMPLATES:
        if pat.search(q):
            return body.strip()
    return None
