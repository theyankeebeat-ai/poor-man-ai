---
name: cite-sources
description: Build a short citation pack from observation URLs. Drop wrappers and duplicates.
hooks: [on_observations, on_before_judge]
tools: [cite_pack]
phase: compose
priority: 7
---

# Cite sources

1. Collect http(s) URLs from observations.
2. Drop jina.ai wrappers and duplicates.
3. Prefer official hosts. Cap at 8.
4. Put citations at the end of the user-facing answer, not inline JSON.
