---
name: final-answer
description: Write the user-facing reply. Direct answer, optional code, citations. Never dump JSON, SERP titles, or "From the pages I read".
hooks: [on_before_judge]
tools: [final_answer]
phase: compose
priority: 4
---

# Final answer

1. Answer each asked question in its own block. Do not merge blocks into one story.
2. For how-to / code, include a complete minimal example and run commands.
3. Use only facts from search hits and page bodies. Cite URLs at the end.
4. Do not paste JSON, `"snippet":`, tool names, or crew notes into the reply.
