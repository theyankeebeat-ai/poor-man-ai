"""Wipe local memory and caches. Leaves the data directory and untouched stores in place."""

from __future__ import annotations

import sqlite3
import time
from pathlib import Path

from server.cache import clear_all as clear_cache
from server.memory import clear_all as clear_memory
from server.retrieve import clear_index

DATA_DIR = Path(__file__).resolve().parent / "data"
LESSONS_PATH = DATA_DIR / "lessons.jsonl"
RAG_INDEX_PATH = DATA_DIR / "rag_index.json"


def _retry_locked(fn, attempts: int = 6):
    last: Exception | None = None
    for i in range(attempts):
        try:
            return fn()
        except sqlite3.OperationalError as exc:
            last = exc
            if "locked" not in str(exc).lower() or i == attempts - 1:
                raise
            time.sleep(0.5 * (i + 1))
    raise last  # pragma: no cover


def _write_if_file(path: Path, text: str) -> bool:
    if not path.is_file():
        return False
    path.write_text(text, encoding="utf-8")
    return True


def clean_local_stores() -> dict:
    cache_rows = _retry_locked(clear_cache)
    memory_state = clear_memory()
    _retry_locked(clear_index)
    return {
        "cache_rows": cache_rows,
        "memory": memory_state,
        "index_cleared": True,
        "lessons_truncated": _write_if_file(LESSONS_PATH, ""),
        "rag_index_reset": _write_if_file(RAG_INDEX_PATH, "{}"),
    }
