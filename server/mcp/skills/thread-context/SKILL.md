---
name: thread-context
description: Bind the current question to prior turns. Use on every follow-up, pronouns, "it/there/today/also".
hooks: [on_user_message, on_plan]
phase: understand
priority: 1
---

# Thread context

1. Read the last 16 user/assistant turns.
2. Resolve pronouns and ellipsis against the thread (place, units, topic, entities).
3. Expand search queries with resolved entities. Do not treat a follow-up as a new topic.
4. Sports follow-ups ("what time", "which teams", "who is playing") keep the league (NFL/NBA/…) and search the **schedule slate**, not a new generic recap.
5. If the user changes topic explicitly, drop stale entities.
