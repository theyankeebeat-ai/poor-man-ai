---
name: thread-context
description: Bind the current question to prior turns. Use on every follow-up, pronouns, "it/there/today/also".
hooks: [on_user_message, on_plan]
phase: understand
priority: 1
---

# Thread context

1. Read the last 16 user/assistant turns.
2. Inherit the previous subject only when this message is elliptical: a pronoun, or fewer than two content words. "So", "and", and "then" do not by themselves continue the topic.
3. If this message names its own subject, search that subject alone. Do not paste the previous question into the query.
4. Sports follow-ups that are elliptical ("what time", "which teams", "who is playing") keep the league (NFL/NBA/…) and search the schedule slate, not a new generic recap.
5. If the user changes topic, drop stale entities. A different given name is a different person. A one-edit misspelling still refers to the source's spelling.
