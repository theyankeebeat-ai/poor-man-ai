---
name: web-reading
topics: [web, websites, reading, scraping, playwright, extraction, docs, citations]
---

# Web Reading & Extraction Playbook

Guidelines for reliable web reading:

1. **Extraction Hierarchy**:
   - Primary: Read page bodies using direct HTTP extraction with clean BeautifulSoup markdown formatting.
   - Secondary: Use headless Playwright browser rendering when the page relies on client-side JavaScript (React, Vue, Svelte SPAs) or when static HTTP returns empty body / cloudflare challenges.
   - Tertiary: Fall back to Jina Reader (`r.jina.ai`) when direct connections face external network routing restrictions.

2. **Content Fidelity**:
   - Extract headings, paragraphs, lists, code blocks, tables, and anchor links.
   - Preserve technical syntax, command-line arguments, API parameters, and code examples without modification.
   - Strip ephemeral web chrome (cookie notices, header navigation links, footer sitemaps, ads).

3. **Dealing with Paywalls and Auth**:
   - Never attempt to bypass authentication walls or paid subscriber login prompts.
   - If a page requires login, extract public metadata (title, meta description, author) and inform the user that the full body is gated behind credentials.

4. **Citation Discipline**:
   - Always reference the real canonical URL (e.g. `https://fastapi.tiangolo.com/tutorial/`), not intermediary proxies.
   - Include specific section titles or anchors where the fact was obtained.
