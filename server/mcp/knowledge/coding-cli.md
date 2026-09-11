---
name: coding-cli
topics: [code, cli, powershell, windows, npm, yarn, python, git, vite]
---

# Coding + CLI (Windows)

Workspace is the project cwd. Paths for tools are **relative** (`src/App.tsx`). Never invent absolute path folders.

## Allowlisted `run_cmd` binaries

Only: `python`, `py`, `npm`, `npx`, `node`, `git`, `pytest`, `pip`, `tsc`, `yarn`, `uv`.

Denied: recursive delete, `irm|iex`, `rm -rf`, format/reg/shutdown. Git `commit`/`push`/`reset --hard` need `allow_git_write=true` and an explicit user ask.

`run_cmd` sets `CI=1` and `npm_config_yes=true` (non-interactive). Prefer short commands; timeout default 60s (lint/build often need 90–120).

## Pick package manager

1. `yarn.lock` → `yarn …`
2. `package-lock.json` → `npm …`
3. `pnpm-lock.yaml` → tell user; bins do not include `pnpm` unless added later
4. Empty folder → `npx --yes create-vite@latest . --template react-ts` then `npm install`

## Everyday coding CLI

```text
# Node / Vite
npx --yes create-vite@latest . --template react-ts
npm install
npm run build
npm run lint
yarn lint
npx tsc --noEmit

# Python
python -m pytest tests/test_foo.py -q
python -c "import app"
pip install -r requirements.txt
uv pip install -r requirements.txt

# Git (read-only by default)
git status --short
git diff
```

Do not start long-lived `npm run dev` / `yarn start` inside the agent loop unless the user asked to verify the UI and you can stop afterward. Prefer `build` / `lint` / `tsc` / one pytest file as verify.

## PowerShell vs bash (user machine)

Users often paste bash. On Windows prefer:

| Bash | PowerShell |
|------|------------|
| `mkdir -p a/b` | `New-Item -ItemType Directory -Force -Path a\b` |
| `echo x > f` | `Set-Content -Path f -Value x -Encoding utf8` |
| `cat f` | `Get-Content f` |
| `rm -rf d` | blocked in agent; do not suggest destructive wipe |
| `export A=1` | `$env:A = "1"` |
| `&&` chain | `; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }` or separate `run_cmd` calls |

Inside `run_cmd`, pass a **single allowlisted binary** + args (no `cmd.exe /c` wrappers unless the tool resolves `.cmd` itself).

## Coding loop checklist

1. `workspace_info` → note `package_manager` / scripts
2. Read `AGENTS.md` if present
3. Smallest patch; verify with narrowest command
4. On failure: use exact stderr + docs; do not claim success without exit 0
5. `memory_write` stack conventions after a successful turn
