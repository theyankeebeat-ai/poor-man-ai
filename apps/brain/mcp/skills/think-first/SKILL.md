---
name: think-first
description: Classify intent and lock a thought order before any tool. Use on every user message.
hooks: [on_user_message, on_plan]
phase: understand
priority: 0
---

# Think first

Lock this order and do not skip steps:

1. **Understand** — bind pronouns and missing subjects to the thread. A question that names its own subject is a new question, even after "so" or "then".
2. **Plan** — pick the smallest tool set that can answer.
3. **Gather** — structured APIs, then search, then page bodies.
4. **Fill gaps** — only if coverage is low or numbers/citations are missing.
5. **Compose** — user-facing prose/code via `final_answer`.
6. **Verify** — claims vs observations; qualify unsupported lines.
7. **Stop** — no extra tools after a verified answer.

If the user changed topic explicitly, drop stale entities. If they used it/there/today/also, keep the thread.
