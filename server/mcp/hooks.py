from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable

from server.mcp.skills import Skill, skills_for
from server.reason import Plan, Turn

THOUGHT_ORDER = (
    "understand",
    "plan",
    "gather",
    "control",
    "compose",
    "verify",
    "stop",
)

_STOP = {
    "that",
    "this",
    "with",
    "from",
    "what",
    "when",
    "where",
    "which",
    "have",
    "need",
    "does",
    "make",
    "just",
    "about",
    "please",
    "could",
    "would",
    "should",
}


@dataclass
class HookCtx:
    event: str
    message: str
    history: list[Turn]
    plan: Plan | None = None
    observations: list[tuple[str, str]] = field(default_factory=list)
    draft: str = ""
    extras: dict[str, Any] = field(default_factory=dict)


def _terms(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-z]{4,}", (text or "").lower()) if w not in _STOP]


def classify_intent(message: str, history: list[Turn]) -> dict[str, Any]:
    q = (message or "").lower()
    follow = bool(
        re.search(
            r"\b(it|they|them|their|there|today|tonight|this|that|also|and|same|do they|does it)\b",
            q,
        )
    )
    topic_shift = False
    if history:
        prior = " ".join(t.text for t in history[-6:] if t.role == "user")
        prior_t = set(_terms(prior))
        now_t = set(_terms(message))
        from server.reason import location_from

        same_place = bool(
            location_from(message)
            and location_from(prior)
            and location_from(message) == location_from(prior)
        )
        if same_place:
            follow = True
        shared = now_t & prior_t
        if now_t and prior_t and len(now_t - prior_t) >= 3 and not follow and not shared:
            topic_shift = True
        elif shared and not topic_shift:
            follow = True
    kind = "factual"
    if re.search(
        r"\b(nfl|nba|wnba|mlb|nhl|kickoff|this weekend|what teams|who(?:'s| is) playing)\b",
        q,
    ) or (
        history
        and re.search(r"\b(what time|which teams|who is playing|what teams)\b", q)
        and re.search(
            r"\b(nfl|nba|wnba|sport|football|basketball)\b",
            " ".join(t.text for t in history[-6:] if t.role == "user").lower(),
        )
    ):
        kind = "sports"
    elif re.search(r"\b(weather|forecast|rain|umbrella|temp|°)\b", q):
        kind = "weather"
    elif re.search(
        r"\b((?:run|execute)\s+(?:yarn|npm|pnpm|pytest|npx)|"
        r"yarn\s+(?:install|lint|add|ci|run)|npm\s+(?:install|ci|i\b|run|add)|"
        r"pnpm\s+(?:install|i\b|lint|add|run)|apply_patch|write_file|pytest)\b",
        q,
    ):
        kind = "code"
    elif re.search(r"\b(how|code|example|write|program|install|setup)\b", q):
        kind = "howto"
    elif re.search(r"\b(image|picture|photo|video|youtube)\b", q):
        kind = "media"
    elif re.search(r"\b(remember|memory|last time)\b", q):
        kind = "memory"
    if history and not topic_shift:
        from server.reason import location_from, units_from

        if units_from(message) or (location_from(message) and len((message or "").split()) <= 8):
            follow = True
    if follow and history and not topic_shift:
        kind = "followup" if kind == "factual" else kind
    return {
        "kind": kind,
        "follow_up": follow and bool(history) and not topic_shift,
        "topic_shift": topic_shift,
        "thought_order": list(THOUGHT_ORDER),
    }


def coverage(message: str, observations: list[tuple[str, str]]) -> float:
    terms = _terms(message)
    if not terms:
        return 1.0
    blob = "\n".join(t for _, t in observations).lower()
    if not blob.strip():
        return 0.0
    hit = sum(1 for t in terms if t in blob)
    score = hit / max(len(terms), 1)
    q = (message or "").lower()
    sports = bool(
        re.search(r"\b(nfl|nba|wnba|mlb|nhl|kickoff|weekend|teams?|playing)\b", q)
    )
    if sports:
        has_matchup = bool(re.search(r"\b(vs\.?|versus|\bat\b|@)\b", blob))
        has_team = bool(
            re.search(
                r"\b(buccaneers|bengals|chiefs|eagles|lakers|celtics|knicks|warriors|"
                r"cowboys|packers|patriots|49ers|rams|steelers)\b",
                blob,
            )
        )
        if not has_matchup and not has_team:
            score = min(score, 0.28)
        elif has_matchup or has_team:
            score = max(score, 0.72)
    return score


def missing_terms(message: str, observations: list[tuple[str, str]]) -> list[str]:
    blob = "\n".join(t for _, t in observations).lower()
    return [t for t in _terms(message) if t not in blob][:8]


def thread_entities(history: list[Turn], message: str) -> dict[str, str]:
    from server.reason import location_from, units_from

    blob = " ".join(t.text for t in history[-8:] if t.role == "user")
    intent = classify_intent(message, history)
    loc = location_from(message) or (None if intent["topic_shift"] else location_from(blob))
    units = units_from(message) or (None if intent["topic_shift"] else units_from(blob)) or "metric"
    last_user = next((t.text for t in reversed(history) if t.role == "user"), "")
    return {
        "location": loc or "",
        "units": units,
        "follow_up": "yes" if intent["follow_up"] else "no",
        "topic_shift": "yes" if intent["topic_shift"] else "no",
        "kind": intent["kind"],
        "prior_user": last_user[:240],
    }


def gap_queries(message: str, plan: Plan, observations: list[tuple[str, str]]) -> list[str]:
    cov = coverage(message, observations)
    miss = missing_terms(message, observations)
    if cov >= 0.62 and observations and not miss:
        return []
    loc = plan.location or ""
    base = plan.search_queries[0] if plan.search_queries else message
    extras = []
    if miss:
        extras.append(f"{message} {' '.join(miss[:4])}".strip())
    blob = "\n".join(t for _, t in observations).lower()
    if re.search(r"\b(nfl|nba|wnba|mlb|nhl|weekend|kickoff|teams?)\b", (message or "").lower()):
        if not re.search(r"\b(vs\.?|versus|\bat\b)\b", blob):
            extras = [
                "NFL schedule this weekend site:nfl.com",
                "NFL week schedule site:espn.com/nfl/schedule",
            ]
    extras.append(f"{base} official documentation")
    extras.append(f"{message} {loc} current".strip())
    seen: set[str] = {q.lower() for q in plan.search_queries}
    out: list[str] = []
    for q in extras:
        k = q.lower()
        if k not in seen and q.strip() and k != message.lower():
            seen.add(k)
            out.append(q)
    return out[:2]


def verify_draft(draft: str, observations: list[tuple[str, str]]) -> dict[str, Any]:
    blob = "\n".join(t for _, t in observations).lower()
    claims = [s.strip() for s in re.split(r"(?<=[.!?])\s+", draft) if 20 < len(s.strip()) < 280]
    unsupported: list[str] = []
    contradicted: list[str] = []
    supported = 0
    nums_draft = re.findall(r"-?\d+(?:\.\d+)?", draft)
    nums_blob = set(re.findall(r"-?\d+(?:\.\d+)?", blob))
    for c in claims[:10]:
        words = _terms(c)
        if not words:
            continue
        score = sum(1 for w in words if w in blob)
        cnums = re.findall(r"-?\d+(?:\.\d+)?", c)
        if cnums and blob and any(n not in nums_blob for n in cnums) and score < max(2, len(words) // 3):
            contradicted.append(c[:180])
            continue
        if score < max(1, len(words) // 4):
            unsupported.append(c[:180])
        else:
            supported += 1
    ok = not contradicted and (not unsupported or supported >= len(unsupported))
    return {
        "ok": ok,
        "supported": supported,
        "unsupported": unsupported[:4],
        "contradicted": contradicted[:3],
        "draft_numbers": nums_draft[:12],
    }


def _apply_think(ctx: HookCtx, _skill: Skill) -> None:
    intent = classify_intent(ctx.message, ctx.history)
    ctx.extras["intent"] = intent
    ctx.extras["thought_order"] = intent["thought_order"]


def _apply_thread(ctx: HookCtx, _skill: Skill) -> None:
    ctx.extras["thread"] = thread_entities(ctx.history, ctx.message)


def _apply_logic(ctx: HookCtx, _skill: Skill) -> None:
    cov = coverage(ctx.message, ctx.observations)
    n = len(ctx.observations)
    ctx.extras["coverage"] = cov
    ctx.extras["stop"] = bool(cov >= 0.55 and n > 0)
    ctx.extras["missing"] = missing_terms(ctx.message, ctx.observations)


def _apply_gap(ctx: HookCtx, _skill: Skill) -> None:
    if not ctx.plan:
        return
    ctx.extras["coverage"] = coverage(ctx.message, ctx.observations)
    ctx.extras["gap_queries"] = gap_queries(ctx.message, ctx.plan, ctx.observations)
    ctx.extras["missing"] = missing_terms(ctx.message, ctx.observations)


def _apply_verify(ctx: HookCtx, _skill: Skill) -> None:
    ctx.extras["verify"] = verify_draft(ctx.draft, ctx.observations)


def _apply_final(ctx: HookCtx, _skill: Skill) -> None:
    ctx.extras["compose"] = True


def _apply_knowledge(ctx: HookCtx, _skill: Skill) -> None:
    from server.mcp.knowledge import consult

    ctx.extras["knowledge"] = consult(ctx.message, limit=3)


def _apply_exchange(ctx: HookCtx, _skill: Skill) -> None:
    ctx.extras["exchange"] = True


def _apply_cite(ctx: HookCtx, _skill: Skill) -> None:
    urls: list[str] = []
    for _, text in ctx.observations:
        for u in re.findall(r"https?://[^\s\"'<>]+", text or ""):
            u = u.rstrip(").,]}\\\"'")
            if "jina.ai" in u:
                continue
            if u not in urls:
                urls.append(u)
    ctx.extras["cite"] = True
    ctx.extras["cite_pack"] = {"urls": urls[:8], "count": len(urls[:8])}


def _apply_compare(ctx: HookCtx, _skill: Skill) -> None:
    blob = "\n".join(t for _, t in ctx.observations)
    cs = [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)\s*°C", blob)]
    fs = [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)\s*°F", blob)]
    temps = cs + [(f - 32) * 5 / 9 for f in fs]
    spread = (max(temps) - min(temps)) if len(temps) >= 2 else 0.0
    yes = bool(re.search(r"\byes\b", blob.lower()))
    no = bool(re.search(r"\bno\b|\bunlikely\b", blob.lower()))
    ctx.extras["compare"] = True
    ctx.extras["compare_report"] = {
        "temps_c": [round(t, 1) for t in temps[:12]],
        "spread_c": round(spread, 1),
        "disagree_numeric": spread > 3,
        "yes_and_no": yes and no,
    }


def media_jobs_from(message: str) -> list[tuple[str, dict[str, Any]]]:
    """Detect concrete media tool calls from a user message."""
    q = message or ""
    jobs: list[tuple[str, dict[str, Any]]] = []
    seen: set[str] = set()

    def _add(name: str, args: dict[str, Any], key: str) -> None:
        if key in seen:
            return
        seen.add(key)
        jobs.append((name, args))

    for m in re.finditer(
        r"https?://(?:www\.)?(?:youtube\.com/(?:watch\?[^\s]+|shorts/[A-Za-z0-9_-]+)|youtu\.be/[A-Za-z0-9_-]+)",
        q,
        re.I,
    ):
        _add("youtube_summarize", {"url": m.group(0)}, f"yt:{m.group(0)}")

    for m in re.finditer(
        r"https?://[^\s\"'<>]+\.(?:png|jpe?g|gif|webp|bmp)(?:\?[^\s\"'<>]*)?",
        q,
        re.I,
    ):
        _add("read_image", {"path_or_url": m.group(0)}, f"img:{m.group(0)}")

    for m in re.finditer(
        r"(?:^|[\s\"'])([A-Za-z]:\\[^\s\"']+\.(?:png|jpe?g|gif|webp|bmp)|"
        r"/(?:Users|home|tmp|var)[^\s\"']+\.(?:png|jpe?g|gif|webp|bmp))",
        q,
        re.I,
    ):
        path = m.group(1)
        _add("read_image", {"path_or_url": path}, f"img:{path}")

    for m in re.finditer(
        r"(?:^|[\s\"'])([A-Za-z]:\\[^\s\"']+\.(?:mp4|mkv|mov|webm|wav|mp3|m4a|ogg|flac)|"
        r"/(?:Users|home|tmp|var)[^\s\"']+\.(?:mp4|mkv|mov|webm|wav|mp3|m4a|ogg|flac))",
        q,
        re.I,
    ):
        path = m.group(1)
        _add("local_video_summarize", {"path": path}, f"vid:{path}")

    if re.search(
        r"\b(?:generate|create|draw|make|imagine)\b.{0,60}\b(?:image|picture|photo|illustration|logo)\b"
        r"|\b(?:image|picture|photo) of\b",
        q,
        re.I,
    ):
        prompt = re.sub(
            r"^\s*(?:please\s+)?(?:generate|create|draw|make|imagine)\s+(?:an?\s+)?(?:image|picture|photo|illustration|logo)\s*(?:of\s+)?",
            "",
            q,
            count=1,
            flags=re.I,
        ).strip() or q
        _add("generate_image", {"prompt": prompt[:800]}, "gen:image")

    return jobs[:4]


def _apply_read_media(ctx: HookCtx, _skill: Skill) -> None:
    jobs = media_jobs_from(ctx.message)
    ctx.extras["media"] = True
    ctx.extras["media_jobs"] = [{"name": n, "args": a} for n, a in jobs]
    from server.mcp.knowledge import consult

    packs = consult("media-literacy " + ctx.message, limit=1)
    if packs:
        ctx.extras["media_playbook"] = packs[0].get("name")


def _apply_summarize(ctx: HookCtx, _skill: Skill) -> None:
    q = (ctx.message or "").lower()
    level = "standard"
    if re.search(r"\b(headline|tl;?dr|one.?line)\b", q):
        level = "headline"
    elif re.search(r"\b(brief|short)\b", q):
        level = "brief"
    elif re.search(r"\b(analytical|detailed|deep)\b", q):
        level = "analytical"
    ctx.extras["summarize"] = True
    ctx.extras["summarize_level"] = level
    from server.mcp.knowledge import consult

    packs = consult("summarize-method", limit=1)
    if packs:
        ctx.extras["summarize_playbook"] = packs[0].get("name")


def _apply_write_forms(ctx: HookCtx, _skill: Skill) -> None:
    q = (ctx.message or "").lower()
    form = "essay"
    for name, rx in (
        ("journal", r"\bjournal\b"),
        ("documentary", r"\bdocumentary\b"),
        ("podcast", r"\bpodcast\b"),
        ("editorial", r"\b(editorial|op-?ed)\b"),
        ("script", r"\bscript\b"),
    ):
        if re.search(rx, q):
            form = name
            break
    ctx.extras["write_forms"] = True
    ctx.extras["write_form"] = form
    from server.mcp.knowledge import consult

    packs = consult("writing-forms " + form, limit=1)
    if packs:
        ctx.extras["write_playbook"] = packs[0].get("name")


def _apply_argue(ctx: HookCtx, _skill: Skill) -> None:
    ctx.extras["argue"] = True
    ctx.extras["exchange"] = True
    from server.mcp.knowledge import consult

    packs = consult("argument-logic epistemic-virtues", limit=2)
    ctx.extras["argue_packs"] = [p.get("name") for p in packs]


def _apply_stay_grounded(ctx: HookCtx, _skill: Skill) -> None:
    report = verify_draft(ctx.draft or "", ctx.observations) if (ctx.draft or ctx.observations) else {
        "ok": True,
        "supported": 0,
        "unsupported": [],
        "contradicted": [],
    }
    ctx.extras["stay_grounded"] = True
    ctx.extras["verify"] = report
    from server.mcp.knowledge import consult

    packs = consult("epistemic-virtues", limit=1)
    if packs:
        ctx.extras["grounded_playbook"] = packs[0].get("name")


def _apply_learn_skill(ctx: HookCtx, _skill: Skill) -> None:
    ctx.extras["learn_skill"] = True
    q = ctx.message or ""
    m = re.search(
        r"(?:learn|teach(?:\s+yourself)?|install(?:\s+a)?\s+skill|self-improve)\s+(?:how\s+to\s+)?(.+)$",
        q,
        re.I,
    )
    topic = (m.group(1).strip() if m else q)[:160]
    ctx.extras["learn_topic"] = topic
    from server.mcp.knowledge import consult

    packs = consult("skill-learning " + topic, limit=1)
    if packs:
        ctx.extras["learn_playbook"] = packs[0].get("name")


def _apply_lint_fix(ctx: HookCtx, _skill: Skill) -> None:
    ctx.extras["lint_fix"] = True
    ctx.extras["code_mode"] = True


def _apply_code_agent(ctx: HookCtx, _skill: Skill) -> None:
    ctx.extras["code_agent"] = True
    ctx.extras["code_mode"] = True


def _apply_conversational_chat(ctx: HookCtx, _skill: Skill) -> None:
    ctx.extras["conversational"] = True
    ctx.extras["compose"] = True
    from server.mcp.knowledge import consult

    packs = consult("conversational-chat " + (ctx.message or ""), limit=1)
    if packs:
        ctx.extras["conversation_playbook"] = packs[0].get("name")


_HANDLERS: dict[str, Callable[[HookCtx, Skill], None]] = {
    "think-first": _apply_think,
    "thread-context": _apply_thread,
    "control-logic": _apply_logic,
    "conversational-chat": _apply_conversational_chat,
    "gap-search": _apply_gap,
    "verify-answer": _apply_verify,
    "final-answer": _apply_final,
    "knowledge-first": _apply_knowledge,
    "agent-exchange": _apply_exchange,
    "cite-sources": _apply_cite,
    "compare-evidence": _apply_compare,
    "read-media": _apply_read_media,
    "summarize": _apply_summarize,
    "write-forms": _apply_write_forms,
    "argue-and-synthesize": _apply_argue,
    "stay-grounded": _apply_stay_grounded,
    "learn-skill": _apply_learn_skill,
    "lint-fix": _apply_lint_fix,
    "code-agent": _apply_code_agent,
}


def run_hooks(ctx: HookCtx, prefer: list[str] | None = None) -> HookCtx:
    from server.neurons import ALWAYS_SKILLS, neuron_score

    applied: list[str] = []
    skipped: list[str] = []
    scores: dict[str, float] = {}
    q = f"{ctx.event} {ctx.message}"
    force = set(prefer or ctx.extras.get("prefer_skills") or [])
    for skill in skills_for(ctx.event):
        sc = neuron_score(q, f"{skill.name} {skill.description}", bank="hooks")
        scores[skill.name] = round(sc, 3)
        if skill.name not in ALWAYS_SKILLS and skill.name not in force and sc < 0.38:
            skipped.append(skill.name)
            continue
        applied.append(skill.name)
        fn = _HANDLERS.get(skill.name)
        if fn:
            fn(ctx, skill)
    ctx.extras["skills"] = applied
    ctx.extras["skill_skip"] = skipped
    ctx.extras["skill_neurons"] = scores
    if "thought_order" not in ctx.extras:
        ctx.extras["thought_order"] = list(THOUGHT_ORDER)
    return ctx
