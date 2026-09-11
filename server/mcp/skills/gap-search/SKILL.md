---
name: gap-search
description: Extra web searches when evidence is thin or the question is not covered by first-pass hits. Triggers: missing numbers, no citations, follow-up needs a new facet.
hooks: [on_observations]
tools: [web_search, read_url]
phase: gather
priority: 3
---

# Gap search

After the first search/read wave:
1. Compare query terms to observation text.
2. If coverage is low, run 1–2 extra `web_search` queries that include resolved thread entities.
3. Read at most two new URLs. Prefer official/docs hosts.
4. Stop when coverage is adequate or the step budget is gone.
