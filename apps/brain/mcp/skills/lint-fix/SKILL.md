---
name: lint-fix
description: >
  Autonomously run yarn/npm lint, report every problem in chat, web-search
  exact errors, plan smallest patches, apply them, and re-lint until clean.
  Load on mode=code when the user asks to lint, fix lint, or yarn lint.
hooks: [on_user_message]
tools: [workspace_info, list_dir, read_file, grep, apply_patch, write_file, run_cmd, web_search, read_url, final_answer]
phase: gather
priority: 4
---

# Lint → report → search → plan → fix

Closed loop for whole-project lint cleanup. The server may already auto-run lint; continue from that observation.

1. If lint has not run yet: `workspace_info`, then `run_cmd` with `yarn lint` (prefer when `yarn.lock` exists), else `npm run lint` / `pnpm lint`. Timeout ≥ 90s.
2. **Report in chat** before editing: list each error as `file:line — rule/message`. Do not hide warnings when `--max-warnings 0`.
3. For each distinct error/rule: `web_search` the **exact** rule id or TS/ESLint message + package versions from `package.json`. Prefer `eslint.org`, `typescriptlang.org`, Stack Overflow, and GitHub issues. `read_url` the best official hit. Reuse `search` / `search_cached` / `docs` fields already attached to failed `run_cmd` observations.
4. **Plan** a short ordered fix list (max ~6 patches per wave). Prefer one root cause over scattershot edits.
5. `read_file` / `grep` only the implicated ranges, then `apply_patch` (smallest change). No drive-by refactors.
6. Re-run the **same** lint command. Repeat search→plan→patch until exit 0 or max steps.
7. `final_answer` with: what failed, what you searched, files changed, final lint exit. Never claim clean without an exit-0 lint observation.
8. Do not `git commit` unless asked. Never print `.env`.
