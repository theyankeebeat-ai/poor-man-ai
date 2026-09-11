---
name: verify-answer
description: Check the draft answer against tool observations before publishing. Use always before the judge finalizes.
hooks: [on_before_judge, on_verify]
tools: [verify_claims, web_search]
phase: verify
priority: 5
---

# Verify answer

1. Extract claims from the draft (numbers, yes/no, named entities).
2. Mark each claim supported, contradicted, or unsupported by observations.
3. If any claim is unsupported and budget remains, one corroborating search.
4. Strip or qualify unsupported claims. Never invent tool results.
5. Keep citations that actually appear in observations.
