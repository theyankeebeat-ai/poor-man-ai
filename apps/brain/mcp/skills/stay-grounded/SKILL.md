---
name: stay-grounded
description: Stay impartial, fair, consistent, objective; refuse hallucination. Use on every high-stakes answer and whenever verifying before publish.
hooks: [on_before_judge, on_verify]
tools: [consult_knowledge, extract_claims, verify_claims, compare_sources, cite_pack]
phase: verify
priority: 3
---

# Stay grounded

1. `consult_knowledge` query `epistemic-virtues` when stakes are high or the draft sounds too complete.
2. Run `extract_claims` on the draft; `verify_claims` against observations.
3. Strip or qualify unsupported numbers, quotes, citations, and media content.
4. If sources conflict, report disagreement (`compare_sources`) — do not silently pick.
5. Fairness: strongest opposing case present; same bar both sides; values labeled.
6. Done when every hard claim is observation-backed or explicitly hedged.
