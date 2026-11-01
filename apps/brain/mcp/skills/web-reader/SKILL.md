---
name: web-reader
description: Read, extract, and analyze any website, documentation page, article, or web application. Use whenever a URL or website reading task is requested.
hooks: [on_user_message, on_plan, on_observations, on_before_judge]
tools: [read_url, web_search, consult_knowledge, extract_claims, cite_pack, final_answer]
phase: gather
priority: 10
---

# Web Reader Skill

Procedures for extracting and analyzing web content:

1. **Direct URL Ingestion**:
   - If the user provides an explicit URL (e.g. `https://...`), call `read_url` immediately with the exact URL before doing generic web searches.
   - For JavaScript-heavy SPAs, client-rendered apps, or pages that require dynamic rendering, pass `render_js: true` or `use_browser: true`.

2. **Content Extraction & Cleaning**:
   - Focus on the main article body, technical documentation, code snippets, lists, and tables.
   - Discard boilerplate navigation headers, cookie banners, advertisements, and footer clutter.

3. **Multi-Source Web Research**:
   - When researching a topic across multiple web sources, use `web_search` to discover the top official documentation and trusted publications.
   - Call `read_url` on the top 1–3 most authoritative hits (e.g., official docs, GitHub, MDN, standards bodies) rather than relying solely on SERP snippets.

4. **Structured Synthesis & Grounding**:
   - Summarize the verified facts, technical specifications, or instructions directly from the retrieved markdown content.
   - Always preserve original URLs and reference citations using `[Source Name](url)`.
   - Never invent claims or hallucinate page contents not present in the `read_url` observations.
