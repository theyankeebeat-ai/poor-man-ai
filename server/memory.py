from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

DATA_DIR = Path(__file__).resolve().parent / "data"
MEMORY_PATH = DATA_DIR / "memory.jsonl"


def _ensure() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not MEMORY_PATH.exists():
        MEMORY_PATH.touch()


def _is_junk_fact(fact: str) -> bool:
    """Drop tool-failure dumps that pollute coding/research context."""
    low = (fact or "").strip().lower()
    if not low:
        return True
    if low.startswith('{"error"') or low.startswith("{'error'"):
        return True
    if "web_search failed" in low or "tool error (" in low:
        return True
    if "401 unauthorized" in low and "jina" in low:
        return True
    if "client error '401" in low or "s.jina.ai" in low:
        return True
    if low.startswith("timeout (") or low.startswith("error:"):
        return True
    if "i could not extract a supported answer" in low:
        return True
    # Past web-dump answers that pollute the Context Memory rail.
    if "from the pages i read:" in low:
        return True
    if low.startswith("speed up python scraping") or "this post is about developing" in low:
        return True
    if "with some nice syntactic sugar" in low:
        return True
    return False


def write_fact(fact: str, source_url: Optional[str] = None) -> dict:
    _ensure()
    cleaned = fact.strip()
    if _is_junk_fact(cleaned):
        return {"skipped": True, "reason": "junk fact refused", "fact": cleaned[:120]}
    row = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "fact": cleaned,
        "source_url": source_url,
    }
    with MEMORY_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    return row


def read_all(include_junk: bool = False) -> list[dict]:
    _ensure()
    out: list[dict] = []
    with MEMORY_PATH.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not include_junk and _is_junk_fact(str(row.get("fact") or "")):
                continue
            out.append(row)
    return out


def scrub_junk() -> dict:
    """Rewrite memory.jsonl without junk rows. Returns counts."""
    _ensure()
    keep: list[dict] = []
    dropped = 0
    with MEMORY_PATH.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                dropped += 1
                continue
            if _is_junk_fact(str(row.get("fact") or "")):
                dropped += 1
                continue
            keep.append(row)
    with MEMORY_PATH.open("w", encoding="utf-8") as f:
        for row in keep:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    return {"kept": len(keep), "dropped": dropped}


def search_linear(query: str, limit: int = 10) -> list[dict]:
    tokens = [t.lower() for t in re.split(r"\W+", query) if t]
    rows = [r for r in read_all() if not _is_junk_fact(str(r.get("fact") or ""))]
    if not tokens:
        return rows[-limit:]
    scored: list[tuple[int, dict]] = []
    for row in rows:
        blob = f"{row.get('fact', '')} {row.get('source_url') or ''}".lower()
        score = sum(1 for t in tokens if t in blob)
        if score:
            scored.append((score, row))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [r for _, r in scored[:limit]]


def search(query: str, limit: int = 10) -> list[dict]:
    try:
        from server.retrieve import search_fts

        hits = search_fts(query, limit * 2)
        if hits:
            clean = [h for h in hits if not _is_junk_fact(str(h.get("fact") or ""))]
            if clean:
                return clean[:limit]
    except Exception:
        pass
    return search_linear(query, limit)
