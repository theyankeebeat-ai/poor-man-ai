from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

KNOWLEDGE_DIR = Path(__file__).resolve().parent / "knowledge"

_cache: tuple[float, list["Pack"]] | None = None


@dataclass
class Pack:
    name: str
    topics: list[str]
    body: str
    path: str
    triggers: list[str] | None = None
    domain: bool = False


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
    times: list[float] = []
    if KNOWLEDGE_DIR.exists():
        times.extend(p.stat().st_mtime for p in KNOWLEDGE_DIR.glob("*.md"))
        domain_dir = KNOWLEDGE_DIR / "domains"
        if domain_dir.exists():
            times.extend(p.stat().st_mtime for p in domain_dir.glob("*.json"))
    return max(times) if times else 0.0


def load_packs() -> list[Pack]:
    global _cache
    stamp = _mtime()
    if _cache and _cache[0] == stamp:
        return _cache[1]
    out: list[Pack] = []
    if KNOWLEDGE_DIR.exists():
        for md in sorted(KNOWLEDGE_DIR.glob("*.md")):
            meta, body = _front(md.read_text(encoding="utf-8"))
            topics = [t.strip() for t in re.split(r"[\[\],]", meta.get("topics", "")) if t.strip()]
            out.append(
                Pack(
                    name=meta.get("name") or md.stem,
                    topics=topics,
                    body=body,
                    path=str(md),
                )
            )
    from server.mcp.domains import packs as domain_packs

    for raw in domain_packs():
        out.append(
            Pack(
                name=raw["name"],
                topics=raw["topics"],
                body=raw["body"],
                path=raw["path"],
                triggers=raw["triggers"],
                domain=True,
            )
        )
    _cache = (stamp, out)
    return out


def _trigger_hit(query: str, trigger: str) -> bool:
    return re.search(rf"(?<![a-z0-9]){re.escape(trigger.lower())}(?![a-z0-9])", query.lower()) is not None


def consult(query: str, limit: int = 3) -> list[dict[str, str]]:
    terms = [w for w in re.findall(r"[a-z0-9]{3,}", (query or "").lower())]
    scored: list[tuple[int, Pack]] = []
    for p in load_packs():
        if p.domain:
            # Whole-word triggers only. The body must not steal unrelated questions.
            score = 5 * sum(1 for trigger in p.triggers or [] if _trigger_hit(query or "", trigger))
        else:
            hay = (p.name + " " + " ".join(p.topics) + " " + p.body).lower()
            score = sum(1 for t in terms if t in hay)
            score += 2 * sum(1 for t in p.topics if t in (query or "").lower())
        if score:
            scored.append((score, p))
    scored.sort(key=lambda x: x[0], reverse=True)
    hits: list[dict[str, str]] = []
    for score, p in scored[:limit]:
        hits.append(
            {
                "name": p.name,
                "topics": ", ".join(p.topics),
                "excerpt": p.body[:1200],
                "score": str(score),
            }
        )
    return hits


def knowledge_prompt(max_chars: int = 1800) -> str:
    parts: list[str] = []
    n = 0
    for p in load_packs():
        block = f"### {p.name}\n{p.body[:400]}\n"
        if n + len(block) > max_chars:
            break
        parts.append(block)
        n += len(block)
    return "\n".join(parts)
