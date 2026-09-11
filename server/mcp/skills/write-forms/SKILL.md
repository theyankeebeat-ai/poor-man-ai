---
name: write-forms
description: Write in a requested form — journal, documentary, podcast script, editorial, or essay type. Use when the user asks to draft, script, op-ed, essay, episode outline.
hooks: [on_user_message, on_plan]
tools: [consult_knowledge, web_search, read_url, verify_claims, final_answer]
phase: compose
priority: 18
---

# Write forms

1. `consult_knowledge` query `writing-forms` (and `argument-logic` for editorial/essay).
2. Lock **form + audience + thesis/purpose** before drafting.
3. If facts are required, gather with search/read first; never invent sources or quotes.
4. Follow the spine for that form (see knowledge pack). For essays, name the type.
5. `verify_claims` on any factual assertions against observations.
6. Deliver via `final_answer` as the finished piece, not JSON.
7. Done when structure matches the form and unsupported claims are gone or hedged.
