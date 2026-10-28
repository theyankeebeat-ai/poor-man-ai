"""Disk SQLite cache with TTL. Identical research repeats a lot."""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import time
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent / "data"
DB_PATH = DATA_DIR / "cache.sqlite"

TTL = {
    "search": 6 * 3600,
    "url": 7 * 24 * 3600,
    "weather": 20 * 60,
    "youtube": 7 * 24 * 3600,
    "answer": 3600,
    "probe": 10 * 365 * 24 * 3600,
    "code_err_search": 6 * 3600,
}

_hits = 0
_misses = 0


def _conn() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH)
    c.execute(
        """CREATE TABLE IF NOT EXISTS kv (
            k TEXT PRIMARY KEY,
            v TEXT NOT NULL,
            exp REAL NOT NULL
        )"""
    )
    return c


def normalize_query(q: str) -> str:
    s = (q or "").lower().strip()
    s = re.sub(r"[^\w\s:/.-]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def make_key(kind: str, *parts: str) -> str:
    blob = kind + ":" + "|".join(normalize_query(p) for p in parts)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def get(kind: str, *parts: str) -> Any | None:
    global _hits, _misses
    key = make_key(kind, *parts)
    now = time.time()
    with _conn() as c:
        row = c.execute("SELECT v, exp FROM kv WHERE k=?", (key,)).fetchone()
        if not row or row[1] < now:
            _misses += 1
            if row:
                c.execute("DELETE FROM kv WHERE k=?", (key,))
            return None
        _hits += 1
        try:
            return json.loads(row[0])
        except json.JSONDecodeError:
            return row[0]


def put(kind: str, value: Any, *parts: str, ttl: int | None = None) -> None:
    key = make_key(kind, *parts)
    exp = time.time() + (ttl if ttl is not None else TTL.get(kind, 3600))
    payload = json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else json.dumps(value)
    with _conn() as c:
        c.execute("INSERT OR REPLACE INTO kv (k, v, exp) VALUES (?,?,?)", (key, payload, exp))


def delete(kind: str, *parts: str) -> bool:
    key = make_key(kind, *parts)
    with _conn() as c:
        cur = c.execute("DELETE FROM kv WHERE k=?", (key,))
        return cur.rowcount > 0


def clear_all() -> int:
    """Drop every kv row. Empty cache is intentional, not a missing table."""
    with _conn() as c:
        n = int(c.execute("SELECT COUNT(*) FROM kv").fetchone()[0])
        c.execute("DELETE FROM kv")
        return n


def purge_matching(pattern: str) -> int:
    """Delete any cached payload whose value matches a regex (case-insensitive)."""
    rx = re.compile(pattern, re.I)
    removed = 0
    with _conn() as c:
        rows = c.execute("SELECT k, v FROM kv").fetchall()
        for key, payload in rows:
            try:
                val = json.loads(payload)
            except json.JSONDecodeError:
                val = payload
            text = val if isinstance(val, str) else json.dumps(val, ensure_ascii=False)
            if rx.search(text or ""):
                c.execute("DELETE FROM kv WHERE k=?", (key,))
                removed += 1
    return removed


def stats() -> dict[str, float | int]:
    total = _hits + _misses
    return {
        "hits": _hits,
        "misses": _misses,
        "hit_rate": (_hits / total) if total else 0.0,
    }
