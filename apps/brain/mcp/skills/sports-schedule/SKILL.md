---
name: sports-schedule
description: Answer NFL/NBA/WNBA/soccer "who plays when" from live schedule pages, not generic kickoff windows. Use on weekend/tonight/this week sports questions and follow-ups (teams, times, who is playing).
hooks: [on_user_message, on_plan, on_observations]
tools: [web_search, read_url, followup_search, gap_search]
phase: gather
priority: 2
---

# Sports schedules

1. Treat "this weekend / tonight / what time / which teams" as the same thread as the league already named (NFL, NBA, WNBA, MLB, NHL, soccer).
2. Search official or primary schedule hosts first: nfl.com, nba.com, espn.com, wnba.com. Then **read the schedule page body**.
3. Answer with **named matchups** (`Away at Home` or `A vs B`) plus kickoff/tip times from the page. Do not stop at "Sunday 1:00 p.m. ET windows".
4. If a league is offseason, say so from the page (or a dated official article), then still list the league that *is* playing.
5. Follow-ups ("what time", "which teams") must reuse the league from the thread and fetch the slate if the first answer had no team names.
6. Never invent a full 32-team slate. If the page lists games, copy those games. If coverage is thin, gap-search once, then say what is still missing.
