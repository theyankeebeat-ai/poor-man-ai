---
name: howto-code
topics: [howto, code, install, setup]
---

# How-to and code

If the intent is howto/code:
- Answer with a recommendation, then a complete minimal example, then run commands.
- Prefer official docs hosts. Do not dump JSON or SERP titles into the reply.
- Include language fences. Do not omit imports or class wrappers when the language needs them.
- If evidence is thin, one extra docs search (`site:learn.microsoft.com` or GitHub README), then compose.
- On Windows, show PowerShell (or allowlisted agent bins: python/npm/npx/node/git/yarn/pip/pytest/tsc/uv). Translate bash when the user pastes it.
- Order: install → minimal file → run/verify command → done-when check.
