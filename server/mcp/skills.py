from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

SKILLS_DIR = Path(__file__).resolve().parent / "skills"

_cache: tuple[float, list["Skill"]] | None = None


@dataclass
class Skill:
    name: str
    description: str
    body: str
    hooks: list[str] = field(default_factory=list)
    tools: list[str] = field(default_factory=list)
    phase: str = "gather"
    priority: int = 50
    path: str = ""


def _front(text: str) -> tuple[dict[str, str], str]:
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m:
        return {}, text
    meta: dict[str, str] = {}
    for line in m.group(1).splitlines():
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        meta[k.strip()] = v.strip()
    return meta, m.group(2).strip()


def _mtime() -> float:
    if not SKILLS_DIR.exists():
        return 0.0
    times = [p.stat().st_mtime for p in SKILLS_DIR.glob("*/SKILL.md")]
    return max(times) if times else 0.0


def load_skills() -> list[Skill]:
    global _cache
    stamp = _mtime()
    if _cache and _cache[0] == stamp:
        return _cache[1]
    out: list[Skill] = []
    if SKILLS_DIR.exists():
        for md in sorted(SKILLS_DIR.glob("*/SKILL.md")):
            meta, body = _front(md.read_text(encoding="utf-8"))
            hooks = [h.strip() for h in re.split(r"[\[\],]", meta.get("hooks", "")) if h.strip()]
            tools = [t.strip() for t in re.split(r"[\[\],]", meta.get("tools", "")) if t.strip()]
            try:
                pri = int(meta.get("priority", "50"))
            except ValueError:
                pri = 50
            out.append(
                Skill(
                    name=meta.get("name") or md.parent.name,
                    description=meta.get("description", ""),
                    body=body,
                    hooks=hooks,
                    tools=tools,
                    phase=meta.get("phase") or "gather",
                    priority=pri,
                    path=str(md),
                )
            )
    out.sort(key=lambda s: (s.priority, s.name))
    _cache = (stamp, out)
    return out


def skills_for(hook: str) -> list[Skill]:
    return [s for s in load_skills() if hook in s.hooks]


def skill_prompt(max_chars: int = 3600) -> str:
    parts: list[str] = []
    n = 0
    for s in load_skills():
        block = f"### {s.name} [{s.phase}]\n{s.description}\n"
        if n + len(block) > max_chars:
            break
        parts.append(block)
        n += len(block)
    try:
        from server.mcp.knowledge import knowledge_prompt

        extra = knowledge_prompt(1200)
        if extra and n + len(extra) < max_chars + 1200:
            parts.append("### knowledge packs\n" + extra)
    except Exception:
        pass
    return "\n".join(parts)
