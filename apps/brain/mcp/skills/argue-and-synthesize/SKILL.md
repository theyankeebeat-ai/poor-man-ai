---
name: argue-and-synthesize
description: Compare, contrast, debate, conclude, and synthesize with fair standards. Use for debate, compare X vs Y, contrast, impartial analysis, synthesis, wrap up.
hooks: [on_user_message, on_plan, on_observations, on_before_judge]
tools: [consult_knowledge, extract_claims, compare_sources, agent_talk, cite_pack, verify_claims, final_answer]
phase: debate
priority: 14
---

# Argue and synthesize

1. `consult_knowledge` query `argument-logic` (plus `epistemic-virtues`).
2. Fix shared criteria (compare/contrast) or steelman both sides (debate).
3. Gather evidence; `extract_claims` + `compare_sources` on disagreements.
4. Optional `agent_talk` when specialists conflict (skeptic↔facts, logic↔gap).
5. Synthesize into one structure (matrix, causal chain, timeline) + dissenting notes.
6. Conclude: direct answer → reasons → residual uncertainty → what would change it.
7. `verify_claims` then `final_answer`. Stay consistent on definitions and metrics.
