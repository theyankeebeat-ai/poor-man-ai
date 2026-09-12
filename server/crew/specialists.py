from __future__ import annotations

import json
import re
from collections.abc import Callable

from server.reason import synthesize
from server.crew.board import Blackboard
from server.mcp.answer import compose_answer
from server.mcp.agents import (
    companion_agent,
    exchange_agent,
    gap_agent,
    knowledge_agent,
    logic_agent,
    skill_router_agent,
    thread_agent,
    verifier_agent,
)
from server.mcp.hooks import HookCtx, run_hooks, verify_draft

AgentFn = Callable[[Blackboard], None]


def _q(board: Blackboard) -> str:
    return board.goal.lower()


def _blob(board: Blackboard) -> str:
    return board.obs_blob()


def context_agent(board: Blackboard) -> None:
    loc = board.plan.location or "unspecified"
    units = board.plan.units
    n = len(board.history)
    board.post(
        "context",
        "thread & coreference",
        f"Follow-up thread ({n} prior turns). Place={loc}. Units={units}. "
        f"Resolve they/it/today/there against this thread, not a new topic.",
        location=loc,
        units=units,
    )


def planner_agent(board: Blackboard) -> None:
    board.post(
        "planner",
        "task split",
        "Split: (1) gather evidence (2) extract facts/numbers (3) check contradictions "
        "(4) answer the asked question (5) cite. Specialists work in parallel on the board.",
        queries=board.plan.search_queries,
    )


def scout_agent(board: Blackboard) -> None:
    qs = board.plan.search_queries
    board.post(
        "scout",
        "search strategy",
        f"Queries: {'; '.join(qs) or board.goal}. Prefer official docs when the goal is technical.",
        queries=qs,
    )


def librarian_agent(board: Blackboard) -> None:
    pages = [n for n, _ in board.observations if n == "read_url"]
    hits = [n for n, _ in board.observations if n == "web_search"]
    board.post(
        "librarian",
        "source inventory",
        f"{len(hits)} search batches, {len(pages)} pages read. Use page bodies over titles.",
        searches=len(hits),
        pages=len(pages),
    )


def api_agent(board: Blackboard) -> None:
    structured = [t for n, t in board.observations if n not in {"web_search", "read_url", "memory_write"}]
    if not structured:
        board.post("api", "structured APIs", "No structured API payload this turn.")
        return
    board.post(
        "api",
        "structured APIs",
        f"{len(structured)} structured tool payload(s). Treat as higher trust than SERP titles.",
        count=len(structured),
    )


def facts_agent(board: Blackboard) -> None:
    blob = _blob(board)
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", blob) if 40 < len(s.strip()) < 240]
    terms = [w for w in re.findall(r"[a-z]{4,}", _q(board)) if w not in {"that", "this", "with", "from"}]
    scored = []
    for s in sents:
        if s.startswith("{") or s.startswith("["):
            continue
        score = sum(1 for t in terms if t in s.lower())
        if score:
            scored.append((score, s))
    scored.sort(key=lambda x: x[0], reverse=True)
    picks = [s for _, s in scored[:4]]
    board.post(
        "facts",
        "claim extraction",
        "Key claims: " + (" | ".join(picks) if picks else "none extracted from pages."),
        claims=picks,
    )


def numbers_agent(board: Blackboard) -> None:
    blob = _blob(board) + "\n" + "\n".join(t.text for t in board.history)
    fs = re.findall(r"(\d+(?:\.\d+)?)\s*°F", blob)
    cs = re.findall(r"(\d+(?:\.\d+)?)\s*°C", blob)
    temps_c: list[float] = []
    for f in fs:
        temps_c.append((float(f) - 32) * 5 / 9)
    for c in cs:
        temps_c.append(float(c))
    for _, text in board.observations:
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        for s in data.get("sources") or []:
            if not isinstance(s, dict):
                continue
            for k in ("current_c", "temp_c", "air_temp_c"):
                if s.get(k) is not None:
                    try:
                        temps_c.append(float(s[k]))
                    except (TypeError, ValueError):
                        pass
    board.post(
        "numbers",
        "quantities",
        f"Temperatures found: {len(temps_c)}. "
        + (f"Mean {sum(temps_c)/len(temps_c):.1f}°C." if temps_c else "No numeric temps."),
        temps_c=temps_c,
    )


def units_agent(board: Blackboard) -> None:
    nums = next((p.data.get("temps_c") for p in board.posts if p.agent == "numbers"), []) or []
    u = board.plan.units
    if not nums:
        board.post("units", "unit conversion", f"User units={u}. Nothing to convert.")
        return
    mean = sum(nums) / len(nums)
    if u == "imperial":
        board.post("units", "unit conversion", f"Report imperial: {mean * 9 / 5 + 32:.0f}°F (from {mean:.1f}°C).")
    else:
        board.post("units", "unit conversion", f"Report metric: {mean:.1f}°C.")


def time_agent(board: Blackboard) -> None:
    q = _q(board)
    when = "today" if "today" in q or "tonight" in q else "as-of now"
    if re.search(r"\b(weekend|sunday|monday|nfl|nba|kickoff)\b", q):
        when = "this weekend slate (named games + kickoff times, not generic TV windows)"
    board.post("time", "temporal scope", f"Question time window: {when}. Prefer current observations over old pages.")


_MATCHUP_RE = re.compile(
    r"([A-Z][A-Za-z.]{2,}(?:\s+[A-Z][A-Za-z.]{2,}){0,3})\s+(?:at|@|vs\.?|versus)\s+([A-Z][A-Za-z.]{2,}(?:\s+[A-Z][A-Za-z.]{2,}){0,3})",
)


def schedule_agent(board: Blackboard) -> None:
    blob = _blob(board)
    games = []
    seen: set[str] = set()
    for m in _MATCHUP_RE.finditer(blob):
        pair = f"{m.group(1).strip()} at {m.group(2).strip()}"
        k = pair.lower()
        if k in seen or len(pair) > 80:
            continue
        seen.add(k)
        games.append(pair)
        if len(games) >= 16:
            break
    times = re.findall(r"\b\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)(?:\s*ET)?\b", blob, re.I)
    q = _q(board)
    sports = bool(re.search(r"\b(nfl|nba|wnba|mlb|nhl|soccer|weekend|kickoff|teams?)\b", q))
    if not sports and not games:
        board.post("schedule", "slate", "No sports slate requested.")
        return
    if games:
        board.post(
            "schedule",
            "slate",
            "Named matchups from pages: " + "; ".join(games[:12])
            + (f". Kickoffs seen: {', '.join(times[:8])}." if times else ". Read official schedule if times missing."),
            games=games,
            times=times[:12],
        )
        return
    board.post(
        "schedule",
        "slate",
        "Sports question but no Away-at-Home / vs matchups in observations. "
        "Gap-search nfl.com/schedules or espn.com/nfl/schedule — do not recap generic 1pm/4pm/SNF windows.",
        games=[],
        times=times[:8],
    )


def compare_agent(board: Blackboard) -> None:
    from server.mcp.hooks import HookCtx, run_hooks

    h = run_hooks(
        HookCtx(
            event="on_observations",
            message=board.goal,
            history=board.history,
            plan=board.plan,
            observations=board.observations,
        ),
        prefer=["compare-evidence"],
    )
    report = h.extras.get("compare_report") or {}
    temps = list(report.get("temps_c") or []) or (
        next((p.data.get("temps_c") for p in board.posts if p.agent == "numbers"), []) or []
    )
    if len(temps) >= 2:
        board.post(
            "compare",
            "disagreement",
            f"Source spread {min(temps):.1f}–{max(temps):.1f}°C "
            f"(Δ {max(temps) - min(temps):.1f})"
            + ("; yes/no conflict in sources." if report.get("yes_and_no") else "."),
            **{k: v for k, v in report.items() if k != "temps_c"},
            temps_c=temps,
        )
    else:
        board.post(
            "compare",
            "disagreement",
            "Not enough numeric sources to score disagreement."
            + (" Yes/no conflict noted." if report.get("yes_and_no") else ""),
            **report,
        )


def howto_agent(board: Blackboard) -> None:
    q = _q(board)
    if re.search(r"\b(how|steps?|install|setup|wear|need)\b", q):
        board.post(
            "howto",
            "procedure",
            "This is a decision/how-to. Answer with a recommendation plus why, not a dump of links.",
        )
    else:
        board.post("howto", "procedure", "Not a procedure question; skip how-to framing.")


def risk_agent(board: Blackboard) -> None:
    board.post(
        "risk",
        "caveats",
        "Do not invent tool results. SERP titles are ads/SEO. Live API beats a page that only contains the query words.",
    )


def skeptic_agent(board: Blackboard) -> None:
    blob = _blob(board).lower()
    q = _q(board)
    trap = False
    if "umbrella" in q and "insurance" in blob:
        trap = True
    if re.search(r"\brain\b", q):
        # titles about rain ≠ rain at the place
        if "sunny" in blob or "clear" in blob:
            trap = True
            board.post(
                "skeptic",
                "title trap",
                "Search hits are rain-keyword sites; structured/live text looks dry. Do not answer yes from titles.",
                trap=True,
            )
            return
    board.post(
        "skeptic",
        "title trap",
        "Watch for keyword-only pages." + (" Possible trap." if trap else " No obvious trap."),
        trap=trap,
    )


def citations_agent(board: Blackboard) -> None:
    # Prefer cite_pack from the cite-sources skill when hooks already ran.
    from server.mcp.hooks import HookCtx, run_hooks

    h = run_hooks(
        HookCtx(
            event="on_observations",
            message=board.goal,
            history=board.history,
            plan=board.plan,
            observations=board.observations,
        ),
        prefer=["cite-sources"],
    )
    pack = h.extras.get("cite_pack") or {}
    urls = list(pack.get("urls") or [])
    if not urls:
        for _, text in board.observations:
            for u in re.findall(r"https?://[^\s\"']+", text or ""):
                u = u.rstrip(").,]}\\\"'")
                if "jina.ai" in u:
                    continue
                if u not in urls:
                    urls.append(u)
    board.post(
        "citations",
        "provenance",
        f"{len(urls[:8])} unique URLs on the board.",
        urls=urls[:8],
        cite_pack=pack or {"urls": urls[:8], "count": len(urls[:8])},
    )


def memory_agent(board: Blackboard) -> None:
    loc = board.plan.location
    board.post(
        "memory",
        "what to keep",
        f"Persist: goal, {loc or 'no place'}, units={board.plan.units}, and the judge's final line. Append-only, not training.",
    )


def judge_agent(board: Blackboard) -> None:
    weatherish = bool(
        re.search(r"\b(weather|rain|umbrella|jacket|forecast|temperature)\b", board.goal, re.I)
    )
    has_wx = any(n == "weather_compare" for n, _ in board.observations)
    if weatherish and has_wx:
        draft = synthesize(board.goal, board.plan, board.observations, history=board.history)
        draft = re.sub(r"\nAnswered from live web/API observations[^\n]*", "", draft)
        draft = re.sub(r"^\*\*[^*]+\*\*[^\n]*\n+", "", draft)
    else:
        draft = compose_answer(board.goal, board.plan, board.observations, history=board.history)
        from server.local_reason import looks_like_dump, reason_from_observations

        if looks_like_dump(draft):
            draft = reason_from_observations(
                board.goal, board.plan, board.observations, board.history
            )
    skeptic = next((p for p in board.posts if p.agent == "skeptic"), None)
    extra: list[str] = []
    debate = next((p for p in board.posts if p.agent == "exchange"), None)
    if debate:
        extra.append("Judge read specialist exchange.")
    router = next((p for p in reversed(board.posts) if p.agent == "skill_router"), None)
    if router and router.data.get("skills"):
        extra.append("Skills: " + ", ".join(router.data["skills"][:8]))
    if skeptic and skeptic.data.get("trap") and re.search(r"\byes\b", draft, re.I):
        extra.append("Judge override: keyword SERP is not evidence of rain. Prefer live/sunny API.")
        draft = re.sub(
            r"Yes —[^\n]+",
            "Unlikely — live conditions look dry; search titles were generic rain sites.",
            draft,
            count=1,
        )
    vctx = run_hooks(
        HookCtx(
            event="on_before_judge",
            message=board.goal,
            history=board.history,
            plan=board.plan,
            observations=board.observations,
            draft=draft,
        )
    )
    report = vctx.extras.get("verify") or verify_draft(draft, board.observations)
    board.post(
        "judge",
        "final merge",
        draft,
        answer=draft,
        verify=report,
        notes=extra,
    )


ROSTER: list[tuple[str, AgentFn]] = [
    ("context", context_agent),
    ("thread", thread_agent),
    ("skill_router", skill_router_agent),
    ("knowledge", knowledge_agent),
    ("planner", planner_agent),
    ("scout", scout_agent),
    ("librarian", librarian_agent),
    ("api", api_agent),
    ("facts", facts_agent),
    ("numbers", numbers_agent),
    ("units", units_agent),
    ("time", time_agent),
    ("schedule", schedule_agent),
    ("compare", compare_agent),
    ("howto", howto_agent),
    ("risk", risk_agent),
    ("skeptic", skeptic_agent),
    ("logic", logic_agent),
    ("gap", gap_agent),
    ("exchange", exchange_agent),
    ("citations", citations_agent),
    ("memory", memory_agent),
    ("companion", companion_agent),
    ("judge", judge_agent),
    ("verifier", verifier_agent),
]
