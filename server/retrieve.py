"""FTS5 over memory.jsonl. jsonl stays source of truth; index is derived."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from server.memory import MEMORY_PATH, read_all

DATA_DIR = Path(__file__).resolve().parent / "data"
FTS_PATH = DATA_DIR / "memory.sqlite"
_stamp: float = 0.0


def _conn() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(FTS_PATH)
    c.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS mem USING fts5(ts, fact, source_url)"
    )
    return c


def rebuild_if_stale() -> None:
    global _stamp
    MEMORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not MEMORY_PATH.exists():
        MEMORY_PATH.touch()
    mtime = MEMORY_PATH.stat().st_mtime
    if mtime == _stamp and FTS_PATH.exists():
        return
    rows = read_all()
    with _conn() as c:
        c.execute("DELETE FROM mem")
        c.executemany(
            "INSERT INTO mem (ts, fact, source_url) VALUES (?,?,?)",
            [
                (
                    str(r.get("ts") or ""),
                    str(r.get("fact") or ""),
                    str(r.get("source_url") or ""),
                )
                for r in rows
            ],
        )
    _stamp = mtime


def search_fts(query: str, limit: int = 8) -> list[dict]:
    rebuild_if_stale()
    q = (query or "").strip()
    if not q:
        return read_all()[-limit:]
    # FTS5 MATCH: quote tokens, fall back to last-n on syntax error
    tokens = [t for t in q.replace('"', " ").split() if t]
    match = " ".join(f'"{t}"' for t in tokens[:12])
    try:
        with _conn() as c:
            cur = c.execute(
                "SELECT ts, fact, source_url FROM mem WHERE mem MATCH ? LIMIT ?",
                (match, limit),
            )
            out = []
            for ts, fact, url in cur.fetchall():
                out.append({"ts": ts, "fact": fact, "source_url": url or None})
            if out:
                return out
    except sqlite3.OperationalError:
        pass
    from server.memory import search_linear

    return search_linear(query, limit)


def snippets(query: str, limit: int = 6) -> str:
    hits = search_fts(query, limit)
    if not hits:
        return ""
    lines = []
    for h in hits[:limit]:
        lines.append(f"- {str(h.get('fact') or '')[:280]}")
    return "Memory (top hits, not full file):\n" + "\n".join(lines)
