---
name: learn-skill
description: Research a method on the web and install it as a local skill or knowledge pack. Use when the user says learn, teach yourself, install a skill, or self-improve from the internet.
hooks: [on_user_message, on_plan]
tools: [list_learned, web_search, read_url, consult_knowledge, write_skill, write_knowledge, memory_write, cite_pack, verify_claims]
phase: gather
priority: 8
---

# Learn a skill from the internet

Learning here means **writing playbooks to disk**. It does not fine-tune a foundation model.

## When to run

User asks to learn / teach yourself / add a skill / remember a method / improve how you X.

## Protocol

1. `list_learned` — see what already exists; update in place if a near-match exists.
2. `consult_knowledge` with `skill-learning` — follow the install rules.
3. `web_search` 2–4 queries aimed at **methods** (how to X, checklist, framework), not random blogs.
4. `read_url` on 1–3 high-trust pages (university, major style guides, official docs, Wikipedia method sections, NIH/CDC/BBC editorial standards, etc.). Skip login walls and SEO bait.
5. Distill into **steps the agent can execute with existing tools**. No fake tools. No model-training claims.
6. Install:
   - Method the agent should follow mid-turn → `write_skill`
   - Reusable playbook / definitions → `write_knowledge`
7. `memory_write` one line: what was learned + source URLs.
8. Tell the user the skill/pack name and when it will auto-apply.

## Skill body rules

- Short, imperative steps.
- Name concrete tools (`read_url`, `youtube_summarize`, `read_image`, …).
- Include a done-when check.
- Put source URLs in the `sources` field of `write_skill` / `write_knowledge`.

## Refuse / constrain

- Do not write skills that bypass safety, scrape private accounts, or download copyrighted media wholesale.
- Prefer captions/transcripts/vision APIs already wired over inventing downloaders.
