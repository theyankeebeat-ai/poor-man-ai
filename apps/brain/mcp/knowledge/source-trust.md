---
name: source-trust
topics: [citations, trust, skeptic, urls]
---

# Source trust

Trust order (high → low):
1. Live structured API payloads (weather_compare, memory hits).
2. Page bodies from `read_url` on official hosts.
3. Search snippets that contain a number or named entity matching the question.
4. Titles and ads. Keyword-only titles are not evidence.

Drop URLs that are jina.ai wrappers in user-facing citations. Deduplicate. Cap at 8.

Title traps: rain-keyword insurance/SEO pages when live weather is dry; “umbrella insurance” on an umbrella question.
