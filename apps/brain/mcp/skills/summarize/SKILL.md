---
name: summarize
description: Condense pages, threads, videos, or notes into a leveled summary. Use for summarize, TL;DR, digest, abstract, briefing.
hooks: [on_user_message, on_plan, on_before_judge]
tools: [consult_knowledge, read_url, youtube_summarize, extract_claims, cite_pack, final_answer]
phase: compose
priority: 15
---

# Summarize

1. `consult_knowledge` query `summarize-method`.
2. Gather the source with the right media tool first (do not summarize empty air).
3. Choose level: headline / brief / standard / analytical — match user ask.
4. Lead with the main claim; keep numbers and hedges; label opinion vs fact.
5. `cite_pack` when URLs exist. `extract_claims` if the summary will drive a decision.
6. Done when a reader who never saw the source understands the point and limits.
