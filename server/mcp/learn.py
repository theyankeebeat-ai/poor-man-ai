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
