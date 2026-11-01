---
name: agent-exchange
description: Specialists ask each other on the shared blackboard (gap↔librarian, skeptic↔facts, numbers↔units, logic↔gap). One process, not extra servers.
hooks: [on_observations, on_before_judge]
tools: [agent_talk]
phase: control
priority: 8
---

# Agent exchange

After gather, run `agent_talk` (or the crew exchange wave):

- from=gap to=librarian — missing evidence
- from=skeptic to=facts — title traps
- from=numbers to=units — report units
- from=logic to=gap — stop or search
- from=citations to=judge — supporting URLs

Replies are 1–3 sentences citing board posts. Judge reads the full exchange before composing.
