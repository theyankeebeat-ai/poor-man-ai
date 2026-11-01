---
name: continual-learn
description: After a research turn, distill one durable rule into lessons.jsonl and recall prior rules on similar questions. Playbook learning only — not AGI, not weight training.
hooks: [on_user_message, on_plan, on_before_judge]
tools: [recall_learned, harvest_lesson, memory_write, write_knowledge, list_learned]
phase: verify
priority: 6
---

# Continual learn

This is **not** artificial general intelligence. The language model weights do not change.

1. On a new question, `recall_learned` (or the orchestrator’s automatic recall) injects overlapping rules from `server/data/lessons.jsonl`.
2. After a grounded answer, harvest **one** rule: what to do next time (named matchups, official URLs, units, ticker venue). Do not store the whole essay.
3. After several related lessons, the runtime pack `learned-runtime` is rewritten so `consult_knowledge` can see them.
4. User-asked methods still go through `write_skill` / `write_knowledge` (learn-skill).
5. Never claim the model trained itself. Never invent tools. Cap bodies. Cite URLs that were actually read.
