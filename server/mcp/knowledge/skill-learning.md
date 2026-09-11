---
name: skill-learning
topics: [learn, skill, self-improve, install, playbook, teach]
---

# Skill learning (self-modification)

## What “learning” means in this repo

| Mechanism | Path | Effect |
|-----------|------|--------|
| Skill | `server/mcp/skills/<name>/SKILL.md` | Injected into agent prompts by phase/hooks |
| Knowledge pack | `server/mcp/knowledge/<name>.md` | Retrieved via `consult_knowledge` |
| Memory fact | `server/data/memory.jsonl` | Append-only recall; not a playbook |

None of these train weights. Reloading is mtime-based; after `write_skill` / `write_knowledge` caches clear automatically.

## Install checklist

1. Inventory with `list_learned`.
2. Gather 2+ independent method sources; prefer primary standards over listicles.
3. Extract: goal, steps, tools, failure modes, done-when.
4. Choose skill vs knowledge:
   - **Skill** — procedural “do this on these hooks”
   - **Knowledge** — definitions, genres, rubrics, trust orders
5. `write_skill` / `write_knowledge` with `sources: [...]`.
6. `memory_write` a one-line receipt with URLs.
7. Smoke: `consult_knowledge` or `list_learned` should show the new name.

## Name rules

Lowercase `a-z`, digits, hyphens; 2–64 chars; start/end alphanumeric (e.g. `read-media`).

## Quality bar

- Actionable with tools that exist in `server/tools.py` / MCP.
- No invented APIs.
- Cite sources that were actually `read_url`'d.
- Keep bodies under ~24k characters.

## Logic package inventory (installed)

**Skills (folders under `skills/`):** `learn-skill`, `read-media`, `summarize`, `write-forms`, `argue-and-synthesize`, `stay-grounded`.

**Knowledge packs:** `skill-learning`, `media-literacy`, `summarize-method`, `writing-forms`, `argument-logic`, `epistemic-virtues`.

Do not call a skill a “knowledge pack” or the reverse. Confirm with `list_learned`.
