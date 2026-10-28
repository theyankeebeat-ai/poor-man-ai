---
name: knowledge-first
description: Pull local playbooks (research method, source trust, units, how-to, debate) before extra web searches.
hooks: [on_user_message, on_plan]
tools: [consult_knowledge]
phase: understand
priority: 6
---

# Knowledge first

Call `consult_knowledge` with the user question. Apply matching playbooks:

- research-method for gather/coverage
- source-trust for citations
- units-time for weather and numbers
- howto-code for install/setup/code
- debate-protocol for specialist handoffs
- skill-learning when installing or updating skills from the web
- media-literacy / summarize-method / writing-forms / argument-logic / epistemic-virtues for the logic package
- a subject card in knowledge/domains when the question names that subject (optics, mechanics, algebra, trigonometry, statistics, grammar, vocabulary, psychology, coding method, web search method, conversation, communication, calculus, biology, astronomy, geology, economy, chemistry, critical thinking)

Do not treat playbooks as live facts. They constrain *how* to search and answer, not *what* the weather is.
