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
2. If coverage is low, run 1–2 extra `web_search` queries. Add thread entities only when this question is elliptical. Do not pull in a previous subject that this question does not name.
3. Read at most two new URLs. Prefer official/docs hosts.
4. Sports follow-ups with no team names in observations: search `site:nfl.com` / `site:espn.com/nfl/schedule` (or nba.com) once.
5. Stop when coverage is adequate or the step budget is gone.
