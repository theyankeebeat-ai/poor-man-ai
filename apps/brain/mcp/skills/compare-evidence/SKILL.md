---
name: compare-evidence
description: Score disagreement across sources (numbers, yes/no, competing snippets) before the judge publishes.
hooks: [on_observations, on_before_judge]
tools: [compare_sources, extract_claims]
phase: gather
priority: 9
---

# Compare evidence

1. `extract_claims` on page bodies and structured APIs.
2. `compare_sources` for numeric spread and contradictory yes/no.
3. If spread is large, the answer must say the range, not a single silent pick.
4. Structured API beats keyword titles when they disagree.
5. A singular "the" is not evidence that only one event exists. If the sources disagree about what the event is, report them separately.
