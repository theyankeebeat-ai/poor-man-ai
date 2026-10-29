---
name: control-logic
description: Routing and stop rules for the research loop. Use on every turn.
hooks: [on_user_message, on_plan, on_observations]
phase: control
priority: 2
---

# Control logic

Stop calling tools when:
- The asked question is answered with at least one supporting observation, or
- `max_steps` is reached.

Prefer:
1. Structured APIs over SERP titles.
2. Page bodies over titles.
3. Resolve pronouns and fragments shorter than two content words. Do not rewrite a question that already names its subject.
4. For sports, a schedule page with named matchups over memorized kickoff windows.

Do not browse login walls. Memory is append-only JSONL, not training.
