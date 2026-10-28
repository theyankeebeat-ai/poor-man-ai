from __future__ import annotations

import re
from collections.abc import AsyncIterator
from typing import Any

from server.mcp.hooks import HookCtx, gap_queries, media_jobs_from, run_hooks
from server.parallel import run_many
from server.reason import Plan, Turn, parse_hits
from server.tools import run_tool

OUTDOOR_RE = re.compile(
    r"\b(weather|forecast|temperature|temp|rain|precip|humid|wind|umbrella|"
    r"jacket|coat|celsius|fahrenheit|°[cf]|sunny|storm|snow)\b",
    re.I,
)

FINANCE_RE = re.compile(
    r"\b(stock|shares?|nasdaq|nyse|marketwatch|google finance|yahoo finance|"
    r"after-?hours|pre-?market|ticker|quote|earnings|market cap|[A-Z]{1,5}:[A-Z]{3,8})\b|"
    r"https?://(?:www\.)?(?:google\.com/finance|nasdaq\.com|finance\.yahoo\.com|marketwatch\.com)",
    re.I,
)

_HOP_ENTITY_RE = re.compile(r"\b[A-Z][a-z]{3,}(?:\s+[A-Z][a-z]{3,})?\b")
_HOP_STOP = frozenset(
    {
        "about",
        "after",
        "again",
        "because",
        "before",
        "being",
        "between",
        "could",
        "first",
        "their",
        "there",
        "these",
        "those",
        "under",
        "where",
        "which",
        "while",
        "would",
        "during",
        "other",
        "every",
        "this",
        "that",
        "they",
        "them",
        "then",
        "have",
        "been",
        "were",
        "with",
        "from",
        "into",
        "over",
        "also",
        "such",
        "many",
        "some",
        "however",
        "therefore",
        "although",
    }
)


def _hop_in_question(question: str, term: str) -> bool:
    q = (question or "").lower()
    t = (term or "").strip().lower()
    if not t:
        return True
    return re.search(rf"\b{re.escape(t)}\b", q) is not None


def hop_query(question: str, passage: str) -> str | None:
    """Up to two new spans from the passage, appended to the question."""
    question = question or ""
    passage = passage or ""
    picked: list[str] = []
    seen: set[str] = set()

    def take(term: str) -> None:
        if len(picked) >= 2:
            return
        raw = term.strip()
        key = raw.lower()
        if not raw or key in seen or key in _HOP_STOP or _hop_in_question(question, raw):
            return
        seen.add(key)
        picked.append(raw)

    for match in _HOP_ENTITY_RE.finditer(passage):
        take(match.group(0))
        if len(picked) >= 2:
            break
    if not picked:
        for word in re.findall(r"\b[a-z]{5,}\b", passage.lower()):
            take(word)
            if len(picked) >= 2:
                break
    if not picked:
        return None
    return f"{question} {' '.join(picked)}".strip()[:240] or None


def _sse(payload: dict[str, Any]) -> str:
    import json

    return json.dumps(payload, ensure_ascii=False) + "\n"


async def _dispatch(name: str, args: dict[str, Any]) -> str:
    return await run_tool(name, args)


async def gather(
    plan: Plan,
    max_steps: int,
    history: list[Turn] | None = None,
) -> AsyncIterator[str | tuple[str, str]]:
    """Search + weather + media + reads in parallel waves. Yields SSE and (name, obs)."""
    steps = 0
    hits: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    obs: list[tuple[str, str]] = []

    # Media tools first when the goal names YouTube / image / local video / generate.
    media_wave: list[tuple[str, dict[str, Any], Any]] = []
    for name, args in media_jobs_from(plan.goal):
        if steps >= max_steps:
            break
        media_wave.append((name, args, _dispatch))
        steps += 1
    for name, args, _ in media_wave:
        yield _sse({"type": "tool", "name": name, "args": args})
    for name, args, text in await run_many(media_wave):
        clip = text[:8000]
        yield _sse({"type": "observation", "name": name, "text": clip})
        yield (name, clip)
        obs.append((name, clip))

    # Explicit URLs in goal/prompt: read directly before generic search
    URL_RE = re.compile(r"https?://[^\s<>\"'()]+", re.I)
    explicit_urls = [
        u.rstrip(".,;!?: \t\\/\"'")
        for u in URL_RE.findall(plan.goal)
        if not any(yt in u for yt in ("youtube.com", "youtu.be"))
    ]
    explicit_reads: list[tuple[str, dict[str, Any], Any]] = []
    for u in explicit_urls:
        if steps >= max_steps:
            break
        if u not in seen_urls:
            seen_urls.add(u)
            explicit_reads.append(("read_url", {"url": u}, _dispatch))
            steps += 1

    for name, args, _ in explicit_reads:
        yield _sse({"type": "tool", "name": name, "args": args})
    for name, args, text in await run_many(explicit_reads):
        clip = text[:8000]
        yield _sse({"type": "observation", "name": name, "text": clip})
        yield (name, clip)
        obs.append((name, clip))

    wave: list[tuple[str, dict[str, Any], Any]] = []
    wx_place = (plan.location or "").strip()
    if not wx_place and OUTDOOR_RE.search(plan.goal):
        wx_place = re.sub(
            r"^\s*(?:what(?:'s| is)|how(?:'s| is)|tell me)\s+",
            "",
            plan.goal,
            flags=re.I,
        )
        wx_place = re.sub(
            r"\b(the\s+)?(weather|forecast|temperature|temp)\s+(in|for|at|near)\s+",
            "",
            wx_place,
            flags=re.I,
        ).strip(" ?!.")
    if OUTDOOR_RE.search(plan.goal) and wx_place and steps < max_steps:
        wave.append(("weather_compare", {"place": wx_place, "units": plan.units}, _dispatch))
        steps += 1

    fin_matches = re.findall(r"\b([A-Z]{1,5}:[A-Z]{3,8}|[A-Z]{2,5})\b", plan.goal)
    if FINANCE_RE.search(plan.goal) and fin_matches and steps < max_steps:
        stop_words = {"IN", "THE", "AFTER", "HOURS", "FOR", "HOW", "MUCH", "WHAT", "IS", "ARE", "AND", "STOCK", "PRICE", "TODAY", "USA", "ETF", "CEO", "INC", "CORP", "LTD", "GROUP"}
        symbols = [s for s in fin_matches if s.upper() not in stop_words]
        if symbols:
            wave.append(("financial_quote", {"symbol": symbols[0], "source": "all"}, _dispatch))
            steps += 1
    # Skip generic web search when media or explicit URLs already answered
    media_done = {n for n, _ in obs} & {
        "youtube_summarize",
        "read_image",
        "local_video_summarize",
        "generate_image",
        "read_url",
    }
    has_finance = any(name == "financial_quote" for name, _, _ in wave)
    skip_search = (bool(media_done) or has_finance) and not OUTDOOR_RE.search(plan.goal)
    if not skip_search:
        for q in plan.search_queries:
            if steps >= max_steps:
                break
            wave.append(("web_search", {"query": q}, _dispatch))
            steps += 1

    for name, args, _ in wave:
        yield _sse({"type": "tool", "name": name, "args": args})
    for name, args, text in await run_many(wave):
        clip = text[:8000]
        yield _sse({"type": "observation", "name": name, "text": clip})
        yield (name, clip)
        obs.append((name, clip))
        if name == "web_search":
            hits.extend(parse_hits(text))

    # Prefer official docs over Medium / SEO blogs (faster + better extracts).
    _DOCS = (
        "fastapi.tiangolo.com",
        "react.dev",
        "docs.python.org",
        "developer.mozilla.org",
        "vite.dev",
        "tailwindcss.com",
        "learn.microsoft.com",
        "nodejs.org",
        "github.com",
        "stackoverflow.com",
        "nfl.com",
        "nba.com",
        "espn.com",
        "wnba.com",
        "mlb.com",
        "nhl.com",
    )

    def _hit_rank(h: dict[str, str]) -> tuple[int, int]:
        url = (h.get("url") or "").lower()
        for i, host in enumerate(_DOCS):
            if host in url:
                return (0, i)
        # Deprioritize essay hosts that produced dump answers in the UI.
        if any(b in url for b in ("medium.com", "dev.to", "hashnode", "substack")):
            return (2, 99)
        return (1, 50)

    ranked = sorted(hits, key=_hit_rank)
    reads: list[tuple[str, dict[str, Any], Any]] = []
    for h in ranked:
        if len(reads) + steps >= max_steps:
            break
        url = h.get("url") or ""
        if not url.startswith("http") or url in seen_urls:
            continue
        seen_urls.add(url)
        reads.append(("read_url", {"url": url}, _dispatch))
        steps += 1
        if len(reads) >= max(1, int(plan.fetch_urls or 1)):
            break
    for name, args, _ in reads:
        yield _sse({"type": "tool", "name": name, "args": args})
    for name, args, text in await run_many(reads):
        clip = text[:8000]
        yield _sse({"type": "observation", "name": name, "text": clip})
        yield (name, clip)
        obs.append((name, clip))

    if skip_search:
        # Media tools already produced the primary evidence — skip gap SERP noise.
        return

    # One follow-up search built from the first page, then the gap block.
    pages = [text for name, text in obs if name == "read_url"]
    if pages:
        q = hop_query(plan.goal, max(pages, key=len)[:1200])
        if q and steps < max_steps and q.lower() not in {s.lower() for s in plan.search_queries}:
            yield _sse({"type": "plan", "text": "Second search after the first page: " + q})
            yield _sse({"type": "tool", "name": "web_search", "args": {"query": q}})
            raw = await run_tool("web_search", {"query": q})
            steps += 1
            clip = raw[:8000]
            yield _sse({"type": "observation", "name": "web_search", "text": clip})
            yield ("web_search", clip)
            obs.append(("web_search", clip))
            hop_hits = parse_hits(raw)
            hits.extend(hop_hits)
            for h in hop_hits:
                url = h.get("url") or ""
                if not url.startswith("http") or url in seen_urls or steps >= max_steps:
                    continue
                seen_urls.add(url)
                yield _sse({"type": "tool", "name": "read_url", "args": {"url": url}})
                body = await run_tool("read_url", {"url": url})
                yield _sse({"type": "observation", "name": "read_url", "text": body[:8000]})
                yield ("read_url", body[:8000])
                obs.append(("read_url", body[:8000]))
                steps += 1
                break

    ctx = run_hooks(
        HookCtx(
            event="on_observations",
            message=plan.goal,
            history=history or [],
            plan=plan,
            observations=obs,
        )
    )
    extra_qs = ctx.extras.get("gap_queries") or gap_queries(plan.goal, plan, obs)
    gap_jobs: list[tuple[str, dict[str, Any], Any]] = []
    for q in extra_qs[:2]:
        if steps >= max_steps:
            break
        gap_jobs.append(("web_search", {"query": q}, _dispatch))
        steps += 1
    for name, args, _ in gap_jobs:
        yield _sse({"type": "tool", "name": name, "args": {**args, "via": "gap_search"}})
    for name, args, text in await run_many(gap_jobs):
        clip = text[:8000]
        yield _sse({"type": "observation", "name": name, "text": clip})
        yield (name, clip)
        for h in parse_hits(text):
            url = h.get("url") or ""
            if not url.startswith("http") or url in seen_urls or steps >= max_steps:
                continue
            seen_urls.add(url)
            yield _sse({"type": "tool", "name": "read_url", "args": {"url": url}})
            body = await run_tool("read_url", {"url": url})
            yield _sse({"type": "observation", "name": "read_url", "text": body[:8000]})
            yield ("read_url", body[:8000])
            steps += 1
            break
