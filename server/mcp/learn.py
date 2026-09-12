"""Sandboxed self-modification: install skills and knowledge packs under server/mcp/."""

from __future__ import annotations

import json
import re
from typing import Any

from server.mcp.knowledge import KNOWLEDGE_DIR, load_packs
from server.mcp.skills import SKILLS_DIR, load_skills

_NAME_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
_MAX_BODY = 24_000


def _invalidate() -> None:
    import server.mcp.knowledge as kmod
    import server.mcp.skills as smod

    smod._cache = None
    kmod._cache = None


def _valid_name(name: str) -> str | None:
    n = (name or "").strip().lower().replace("_", "-")
    if not _NAME_RE.match(n):
        return None
    return n


async def list_learned(args: dict[str, Any]) -> str:
    kind = str(args.get("kind") or "all").lower()
    out: dict[str, Any] = {}
    if kind in {"all", "skills"}:
        out["skills"] = [
            {"name": s.name, "description": s.description[:200], "phase": s.phase, "priority": s.priority}
            for s in load_skills()
        ]
    if kind in {"all", "knowledge"}:
        out["knowledge"] = [
            {"name": p.name, "topics": p.topics, "chars": len(p.body)} for p in load_packs()
        ]
    return json.dumps(out, ensure_ascii=False)


async def write_skill(args: dict[str, Any]) -> str:
    """Install or update a skill at server/mcp/skills/<name>/SKILL.md."""
    name = _valid_name(str(args.get("name") or ""))
    if not name:
        return json.dumps(
            {
                "ok": False,
                "error": "invalid name: use lowercase letters, digits, hyphens; 2–64 chars",
            }
        )
    description = str(args.get("description") or "").strip()
    body = str(args.get("body") or args.get("content") or "").strip()
    if not description:
        return json.dumps({"ok": False, "error": "description required"})
    if not body:
        return json.dumps({"ok": False, "error": "body required"})
    if len(body) > _MAX_BODY:
        return json.dumps({"ok": False, "error": f"body too large (max {_MAX_BODY} chars)"})

    hooks = args.get("hooks") or ["on_user_message", "on_plan"]
    if isinstance(hooks, str):
        hooks = [h.strip() for h in re.split(r"[\[\],]", hooks) if h.strip()]
    tools = args.get("tools") or []
    if isinstance(tools, str):
        tools = [t.strip() for t in re.split(r"[\[\],]", tools) if t.strip()]
    phase = str(args.get("phase") or "gather").strip() or "gather"
    try:
        priority = int(args.get("priority") or 40)
    except (TypeError, ValueError):
        priority = 40
    sources = args.get("sources") or []
    if isinstance(sources, str):
        sources = [sources] if sources.strip() else []

    meta_lines = [
        "---",
        f"name: {name}",
        f"description: {description}",
        f"hooks: [{', '.join(hooks)}]",
    ]
    if tools:
        meta_lines.append(f"tools: [{', '.join(str(t) for t in tools)}]")
    meta_lines.append(f"phase: {phase}")
    meta_lines.append(f"priority: {priority}")
    if sources:
        meta_lines.append(f"sources: [{', '.join(str(s) for s in sources[:12])}]")
    meta_lines.append("---")
    meta_lines.append("")

    # Strip accidental frontmatter from body so we own the header.
    raw = body
    if raw.startswith("---"):
        m = re.match(r"^---\n.*?\n---\n(.*)$", raw, re.S)
        if m:
            raw = m.group(1).strip()
    text = "\n".join(meta_lines) + raw + "\n"
    if len(text) > _MAX_BODY + 2000:
        return json.dumps({"ok": False, "error": "skill file too large"})

    dest_dir = SKILLS_DIR / name
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / "SKILL.md"
    existed = dest.exists()
    dest.write_text(text, encoding="utf-8")
    _invalidate()
    return json.dumps(
        {
            "ok": True,
            "action": "updated" if existed else "created",
            "path": str(dest),
            "name": name,
            "bytes": len(text.encode("utf-8")),
        },
        ensure_ascii=False,
    )


async def write_knowledge(args: dict[str, Any]) -> str:
    """Install or update a knowledge pack at server/mcp/knowledge/<name>.md."""
    name = _valid_name(str(args.get("name") or ""))
    if not name:
        return json.dumps(
            {
                "ok": False,
                "error": "invalid name: use lowercase letters, digits, hyphens; 2–64 chars",
            }
        )
    body = str(args.get("body") or args.get("content") or "").strip()
    if not body:
        return json.dumps({"ok": False, "error": "body required"})
    if len(body) > _MAX_BODY:
        return json.dumps({"ok": False, "error": f"body too large (max {_MAX_BODY} chars)"})

    topics = args.get("topics") or []
    if isinstance(topics, str):
        topics = [t.strip() for t in re.split(r"[\[\],]", topics) if t.strip()]
    if not topics:
        topics = [name]
    sources = args.get("sources") or []
    if isinstance(sources, str):
        sources = [sources] if sources.strip() else []

    raw = body
    if raw.startswith("---"):
        m = re.match(r"^---\n.*?\n---\n(.*)$", raw, re.S)
        if m:
            raw = m.group(1).strip()

    lines = [
        "---",
        f"name: {name}",
        f"topics: [{', '.join(str(t) for t in topics)}]",
    ]
    if sources:
        lines.append(f"sources: [{', '.join(str(s) for s in sources[:12])}]")
    lines.append("---")
    lines.append("")
    text = "\n".join(lines) + raw + "\n"
    KNOWLEDGE_DIR.mkdir(parents=True, exist_ok=True)
    dest = KNOWLEDGE_DIR / f"{name}.md"
    existed = dest.exists()
    dest.write_text(text, encoding="utf-8")
    _invalidate()
    return json.dumps(
        {
            "ok": True,
            "action": "updated" if existed else "created",
            "path": str(dest),
            "name": name,
            "bytes": len(text.encode("utf-8")),
        },
        ensure_ascii=False,
    )


# Continual lessons: playbook memory, not AGI / not weight training.

from datetime import datetime, timezone

from server.memory import DATA_DIR, write_fact

LESSONS_PATH = DATA_DIR / "lessons.jsonl"
_RUNTIME_PACK = "learned-runtime"
_MAX_LESSONS_READ = 400
_MATCHUP_RE = re.compile(
    r"([A-Z][A-Za-z.]{2,}(?:\s+[A-Z][A-Za-z.]{2,}){0,3})\s+(?:at|@|vs\.?|versus)\s+([A-Z][A-Za-z.]{2,}(?:\s+[A-Z][A-Za-z.]{2,}){0,3})",
)
_URL_RE = re.compile(r"https?://[^\s\]\"'<>]+")
_SPORTS_RE = re.compile(r"\b(nfl|nba|wnba|mlb|nhl|kickoff|this weekend|what teams)\b", re.I)


def _lesson_terms(text: str) -> set[str]:
    return {
        w
        for w in re.findall(r"[a-z]{4,}", (text or "").lower())
        if w not in {"this", "that", "with", "from", "have"}
    }


def _read_lessons() -> list[dict[str, Any]]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not LESSONS_PATH.exists():
        return []
    rows: list[dict[str, Any]] = []
    with LESSONS_PATH.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows[-_MAX_LESSONS_READ:]


def recall_lessons(query: str, limit: int = 4) -> list[dict[str, Any]]:
    qterms = _lesson_terms(query)
    if not qterms:
        return []
    scored: list[tuple[int, dict[str, Any]]] = []
    for row in _read_lessons():
        hay = _lesson_terms(
            str(row.get("query") or "")
            + " "
            + str(row.get("rule") or "")
            + " "
            + str(row.get("kind") or "")
        )
        n = len(qterms & hay)
        if n:
            scored.append((n, row))
    scored.sort(key=lambda x: x[0], reverse=True)
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for _, row in scored:
        rule = str(row.get("rule") or "").strip()
        if not rule or rule.lower() in seen:
            continue
        seen.add(rule.lower())
        out.append(row)
        if len(out) >= limit:
            break
    return out


def _urls_from_obs(observations: list[tuple[str, str]] | None) -> list[str]:
    blob = "\n".join(t for _, t in (observations or [])[-12:])
    urls: list[str] = []
    seen: set[str] = set()
    for u in _URL_RE.findall(blob):
        u = u.rstrip(").,;]")
        if u in seen:
            continue
        seen.add(u)
        urls.append(u)
        if len(urls) >= 6:
            break
    return urls


def _distill_rule(
    message: str,
    answer: str,
    observations: list[tuple[str, str]] | None,
    kind: str,
) -> str | None:
    q = (message or "").strip()
    a = (answer or "").strip()
    if len(a) < 40 or a.lower().startswith(("{", "error:", "timeout")):
        return None
    if kind in {"chat", "calc"}:
        return None
    urls = _urls_from_obs(observations)
    src = f" Sources: {', '.join(urls[:3])}." if urls else ""
    if _SPORTS_RE.search(q) or _SPORTS_RE.search(a) or kind == "sports":
        games: list[str] = []
        seen: set[str] = set()
        skip_team = {"sunday", "monday", "tuesday", "et", "nfl", "nba", "pm", "am"}
        for m in _MATCHUP_RE.finditer(a):
            a_team, b_team = m.group(1).strip(), m.group(2).strip()
            if a_team.lower() in skip_team or b_team.lower() in skip_team:
                continue
            if a_team.lower().startswith("et.") or " p.m" in a_team.lower():
                continue
            pair = f"{a_team} at {b_team}"
            k = pair.lower()
            if k in seen:
                continue
            seen.add(k)
            games.append(pair)
            if len(games) >= 8:
                break
        if games:
            return (
                "When asked who plays / what time this weekend, list named matchups "
                f"({'; '.join(games[:8])}), not generic 1pm/4pm/SNF windows.{src}"
            )
        if re.search(r"\b(1:00|4:25|8:20)\s*p\.?m\.?\s*ET\b", a) and not games:
            return (
                "Generic ET kickoff windows are not a sports answer. "
                "Next time read nfl.com / espn.com / nba.com schedule pages and name teams."
            )
        return None
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", a) if 40 < len(s.strip()) < 220]
    pick = next((s for s in sentences if re.search(r"\d|https?://", s)), None) or (
        sentences[0] if sentences else None
    )
    if not pick:
        return None
    return f"From prior research on “{q[:80]}”: {pick}{src}"


def _append_lesson(row: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with LESSONS_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def _refresh_runtime_pack(rows: list[dict[str, Any]]) -> None:
    recent = rows[-24:]
    if len(recent) < 2:
        return
    lines = [
        "# Learned at runtime",
        "",
        "Distilled from past turns. Not model training. Prefer these over repeating failed patterns.",
        "",
    ]
    topics: list[str] = ["learned", "runtime", "lessons"]
    for row in reversed(recent):
        rule = str(row.get("rule") or "").strip()
        kind = str(row.get("kind") or "fact")
        if not rule:
            continue
        lines.append(f"- ({kind}) {rule}")
        if kind not in topics:
            topics.append(kind)
    body = "\n".join(lines)[:8000]
    dest = KNOWLEDGE_DIR / f"{_RUNTIME_PACK}.md"
    text = (
        "---\n"
        f"name: {_RUNTIME_PACK}\n"
        f"topics: [{', '.join(topics[:12])}]\n"
        "---\n\n" + body + "\n"
    )
    dest.write_text(text, encoding="utf-8")
    _invalidate()


def harvest_turn(
    message: str,
    answer: str,
    observations: list[tuple[str, str]] | None = None,
    kind: str = "research",
) -> dict[str, Any]:
    rule = _distill_rule(message, answer, observations, kind)
    if not rule:
        return {"ok": False, "skipped": True, "reason": "nothing durable to store"}
    existing = _read_lessons()
    if any(str(r.get("rule") or "").strip().lower() == rule.lower() for r in existing[-80:]):
        return {"ok": True, "skipped": True, "reason": "duplicate rule"}
    row = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "query": (message or "")[:240],
        "kind": kind or "research",
        "rule": rule[:600],
        "sources": _urls_from_obs(observations)[:6],
    }
    _append_lesson(row)
    mem = write_fact(rule[:400], source_url=(row["sources"][0] if row["sources"] else None))
    all_rows = existing + [row]
    if len(all_rows) >= 3:
        _refresh_runtime_pack(all_rows)
    return {"ok": True, "lesson": row, "memory": mem, "agi": False}


async def harvest_lesson(args: dict[str, Any]) -> str:
    obs_raw = args.get("observations") or []
    observations: list[tuple[str, str]] = []
    if isinstance(obs_raw, list):
        for item in obs_raw:
            if isinstance(item, (list, tuple)) and len(item) >= 2:
                observations.append((str(item[0]), str(item[1])))
            elif isinstance(item, dict):
                observations.append((str(item.get("name") or "obs"), str(item.get("text") or "")))
    out = harvest_turn(
        str(args.get("message") or args.get("query") or ""),
        str(args.get("answer") or args.get("draft") or ""),
        observations,
        str(args.get("kind") or "research"),
    )
    return json.dumps(out, ensure_ascii=False)


async def recall_learned(args: dict[str, Any]) -> str:
    q = str(args.get("query") or args.get("message") or "")
    try:
        limit = int(args.get("limit") or 4)
    except (TypeError, ValueError):
        limit = 4
    hits = recall_lessons(q, limit=max(1, min(limit, 8)))
    return json.dumps(
        {"query": q, "lessons": hits, "note": "playbook recall, not weight training"},
        ensure_ascii=False,
    )
