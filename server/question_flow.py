"""Every chat question tokenizes with the JSON vocab, reads parameter shards, and runs web-search MCPs.

The spoken answer can still be local math or a domain card. These reads happen first.
JSON weights stay a search copy. This module does not load pytorch_model.bin.
"""

from __future__ import annotations

import asyncio
import json
import re
import threading
import unicodedata
from collections.abc import AsyncIterator
from typing import Any

from server.buckets import HF_DIR, read_dataset_passages, read_parameter_row

EMBED_NAME = "bert.embeddings.word_embeddings.weight"
VOCAB_FILE = "buckets/tokenizer/vocab.jsonl"
MAX_IDS = 128
MAX_ROWS = 32
VOCAB_ROWS = 30522
_SPECIAL = {"[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]"}
MCP_ENGINES = (
    "duckduckgo-ai-search-mcp",
    "google-ai-search-mcp",
    "bing-copilot-search-mcp",
    "yandex-ai-search-mcp",
)

_vocab: dict[str, int] | None = None
_vocab_lock = threading.Lock()
_heads: list[dict[str, Any]] | None = None
_heads_lock = threading.Lock()
_SHAPE = re.compile(r'"shape"\s*:\s*\[([^\]]*)\]')


def _sse(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False) + "\n"


def _ensure_snapshot() -> None:
    """Download the JSON buckets once when this process does not have them yet."""
    path = HF_DIR / "buckets" / "tokenizer" / "vocab.jsonl"
    if path.is_file():
        return
    from server.hf_storage import restore_snapshot

    restore_snapshot(HF_DIR)


def _load_vocab() -> dict[str, int]:
    global _vocab
    with _vocab_lock:
        if _vocab is not None:
            return _vocab
        _ensure_snapshot()
        path = HF_DIR / "buckets" / "tokenizer" / "vocab.jsonl"
        vocab: dict[str, int] = {}
        with path.open(encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                row = json.loads(line)
                vocab[str(row["token"])] = int(row["token_id"])
        if len(vocab) != VOCAB_ROWS:
            raise RuntimeError(f"JSON tokenizer has {len(vocab)} rows, expected {VOCAB_ROWS}")
        _vocab = vocab
        return vocab


def _is_punct(ch: str) -> bool:
    code = ord(ch)
    if 33 <= code <= 47 or 58 <= code <= 64 or 91 <= code <= 96 or 123 <= code <= 126:
        return True
    return unicodedata.category(ch).startswith("P")


def _is_cjk(ch: str) -> bool:
    code = ord(ch)
    return (
        0x4E00 <= code <= 0x9FFF
        or 0x3400 <= code <= 0x4DBF
        or 0xF900 <= code <= 0xFAFF
        or 0x20000 <= code <= 0x2A6DF
        or 0x2A700 <= code <= 0x2CEAF
        or 0x2F800 <= code <= 0x2FA1F
    )


def _basic_tokens(text: str) -> list[str]:
    cleaned: list[str] = []
    for ch in text or "":
        if ch in "\x00\ufffd":
            continue
        category = unicodedata.category(ch)
        if category.startswith("C") and ch not in "\t\n\r":
            continue
        if ch.isspace() or category == "Zs":
            cleaned.append(" ")
        elif _is_cjk(ch):
            cleaned.append(f" {ch} ")
        else:
            cleaned.append(ch)
    tokens: list[str] = []
    for raw in "".join(cleaned).split():
        if raw in _SPECIAL:
            tokens.append(raw)
            continue
        word = unicodedata.normalize("NFD", raw.lower())
        word = "".join(ch for ch in word if unicodedata.category(ch) != "Mn")
        buf: list[str] = []
        for ch in word:
            if _is_punct(ch):
                if buf:
                    tokens.append("".join(buf))
                    buf = []
                tokens.append(ch)
            else:
                buf.append(ch)
        if buf:
            tokens.append("".join(buf))
    return tokens


def _wordpiece(word: str, vocab: dict[str, int]) -> list[str]:
    if word in vocab:
        return [word]
    if len(word) > 100:
        return ["[UNK]"]
    chars = list(word)
    start = 0
    pieces: list[str] = []
    while start < len(chars):
        end = len(chars)
        found: str | None = None
        while start < end:
            piece = "".join(chars[start:end])
            if start > 0:
                piece = "##" + piece
            if piece in vocab:
                found = piece
                break
            end -= 1
        if found is None:
            return ["[UNK]"]
        pieces.append(found)
        start = end
    return pieces or ["[UNK]"]


def tokenize_question(text: str) -> dict[str, Any]:
    """WordPiece one chat question from hf/buckets/tokenizer/vocab.jsonl."""
    vocab = _load_vocab()
    pieces: list[str] = []
    for word in _basic_tokens(text):
        pieces.extend(_wordpiece(word, vocab))
        if len(pieces) >= MAX_IDS - 2:
            pieces = pieces[: MAX_IDS - 2]
            break
    tokens = ["[CLS]", *pieces, "[SEP]"]
    unk = vocab["[UNK]"]
    return {
        "tokens": tokens,
        "token_ids": [vocab.get(token, unk) for token in tokens],
        "vocab_file": VOCAB_FILE,
        "vocab_rows": len(vocab),
    }


def _shape_from_head(raw: bytes) -> list[int] | None:
    match = _SHAPE.search(raw.decode("utf-8", errors="ignore"))
    if not match:
        return None
    body = match.group(1).strip()
    if not body:
        return []
    try:
        return [int(part.strip()) for part in body.split(",") if part.strip()]
    except ValueError:
        return None


def _parameter_heads() -> tuple[list[dict[str, Any]], bool]:
    """Open every parameter file except the word-embedding JSONL, once per process."""
    global _heads
    with _heads_lock:
        if _heads is not None:
            return _heads, True
        opened: list[dict[str, Any]] = []
        root = HF_DIR / "buckets"
        if root.is_dir():
            folders = [path for path in root.iterdir() if path.is_dir() and path.name.startswith("parameters-")]
            for folder in sorted(folders, key=lambda path: path.name):
                files = [path for path in folder.iterdir() if path.is_file()]
                for path in sorted(files, key=lambda item: item.name):
                    if path.name.startswith("bert.embeddings.word_embeddings.weight"):
                        continue
                    with path.open("rb") as handle:
                        raw = handle.read(200)
                    opened.append({
                        "file": f"buckets/{folder.name}/{path.name}",
                        "bytes_read": len(raw),
                        "shape": _shape_from_head(raw),
                    })
        _heads = opened
        return opened, False


def read_parameter_shards(token_ids: list[int]) -> dict[str, Any]:
    """Seek embedding rows for the question. Discard float vectors before returning."""
    unique: list[int] = []
    for raw in token_ids:
        try:
            token_id = int(raw)
        except (TypeError, ValueError):
            continue
        if token_id < 0 or token_id >= VOCAB_ROWS or token_id in unique:
            continue
        unique.append(token_id)
        if len(unique) >= MAX_ROWS:
            break
    rows: list[dict[str, Any]] = []
    files: dict[str, dict[str, Any]] = {}
    vector_length = 0
    for token_id in unique:
        try:
            payload = read_parameter_row(EMBED_NAME, token_id)
        except (OSError, KeyError, ValueError, json.JSONDecodeError) as exc:
            rows.append({"row": token_id, "error": str(exc)[:160]})
            continue
        vector = payload.get("v") if isinstance(payload.get("v"), list) else []
        if vector and not vector_length:
            vector_length = len(vector)
        relative = str(payload.get("file") or "")
        entry = files.setdefault(
            relative,
            {"file": relative, "bucket": payload.get("bucket"), "rows": [], "bytes": 0},
        )
        entry["rows"].append(token_id)
        entry["bytes"] += int(payload.get("nbytes") or 0)
        rows.append({"row": int(payload.get("i", token_id)), "dims": len(vector), "file": relative})
    heads, cached = _parameter_heads()
    return {
        "embedding": EMBED_NAME,
        "rows_read": sum(1 for row in rows if "error" not in row),
        "vector_length": vector_length,
        "row_indexes": unique,
        "rows": [{key: value for key, value in row.items() if key != "v"} for row in rows],
        "files": list(files.values()),
        "shard_heads": heads,
        "shard_heads_cached": cached,
    }


def _clip(payload: dict[str, Any], limit: int = 4000) -> str:
    raw = json.dumps(payload, ensure_ascii=False)
    if len(raw) <= limit:
        return raw
    return raw[: limit - 1] + "…"


async def _hits_for(name: str, query: str) -> list[dict[str, str]]:
    from server.clients import http_client
    from server.tools import _bing_search, _duckduckgo_html, _google_news_search, _wikipedia_opensearch

    client = http_client()
    if name.startswith("duckduckgo"):
        hits = await _duckduckgo_html(client, query)
    elif name.startswith("google"):
        hits = await _google_news_search(client, query)
    elif name.startswith("bing"):
        hits = await _bing_search(client, query)
    else:
        hits = await _wikipedia_opensearch(client, query)
    if not hits and not name.startswith("duckduckgo"):
        hits = await _wikipedia_opensearch(client, query)
    return hits[:5]


async def run_search_mcps(query: str) -> list[tuple[str, str]]:
    """Four web-search MCPs, one question, concurrent. Each body is JSON with hits."""

    async def one(name: str) -> tuple[str, str]:
        error = ""
        try:
            hits = await asyncio.wait_for(_hits_for(name, query), timeout=6.5)
        except Exception as exc:
            hits = []
            error = str(exc)[:200]
        body: dict[str, Any] = {"engine": name, "query": query, "hits": hits}
        if error:
            body["error"] = error
        return name, json.dumps(body, ensure_ascii=False)

    return list(await asyncio.gather(*(one(name) for name in MCP_ENGINES)))


def mcp_has_hits(observations: list[tuple[str, str]]) -> bool:
    for name, text in observations:
        if name not in MCP_ENGINES:
            continue
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and data.get("hits"):
            return True
    return False


def web_already_covered(observations: list[tuple[str, str]], mode: str) -> bool:
    """Skip a second generic web_search after the MCP wave, except empty research turns."""
    ran = any(name in MCP_ENGINES for name, _text in observations)
    if not ran:
        return False
    if mode == "research" and not mcp_has_hits(observations):
        return False
    return True


async def emit_question_flow(message: str) -> AsyncIterator[str | tuple[str, str]]:
    """Grok order: plan, tokenizer, parameter shards, dataset, then the four MCPs."""
    text = (message or "").strip()[:500]
    yield _sse({
        "type": "plan",
        "text": "Grok flow: JSON tokenizer, parameter shards, WikiText passages, then DuckDuckGo, Google, Bing, and Yandex in parallel.",
    })
    token_ids: list[int] = []
    try:
        token_pack = tokenize_question(text)
        token_ids = list(token_pack["token_ids"])
        token_obs = _clip({
            "vocab_file": token_pack["vocab_file"],
            "vocab_rows": token_pack["vocab_rows"],
            "token_count": len(token_pack["tokens"]),
            "tokens": token_pack["tokens"][:48],
            "token_ids": token_pack["token_ids"][:48],
        })
    except (OSError, json.JSONDecodeError, RuntimeError, KeyError) as exc:
        token_obs = _clip({"vocab_file": VOCAB_FILE, "error": str(exc)[:300]})
    yield _sse({"type": "tool", "name": "json_tokenizer", "args": {"source": VOCAB_FILE}})
    yield _sse({"type": "observation", "name": "json_tokenizer", "text": token_obs})
    yield ("json_tokenizer", token_obs)

    try:
        shard_obs = _clip(read_parameter_shards(token_ids))
    except (OSError, ValueError, RuntimeError) as exc:
        shard_obs = _clip({"embedding": EMBED_NAME, "error": str(exc)[:300]})
    yield _sse({"type": "tool", "name": "read_parameter_shards", "args": {"rows": len(token_ids[:MAX_ROWS])}})
    yield _sse({"type": "observation", "name": "read_parameter_shards", "text": shard_obs})
    yield ("read_parameter_shards", shard_obs)

    try:
        data_obs = _clip(read_dataset_passages(text or "the", limit=3))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        data_obs = _clip({"error": str(exc)[:300], "passages": []})
    yield _sse({"type": "tool", "name": "json_dataset", "args": {"query": text, "limit": 3}})
    yield _sse({"type": "observation", "name": "json_dataset", "text": data_obs})
    yield ("json_dataset", data_obs)

    yield _sse({
        "type": "plan",
        "text": "Web-search MCPs running together: DuckDuckGo, Google, Bing, Yandex.",
    })
    pairs = await run_search_mcps(text or "the")
    for name, body in pairs:
        clip = body if len(body) <= 8000 else body[:7999] + "…"
        yield _sse({"type": "tool", "name": name, "args": {"query": text}})
        yield _sse({"type": "observation", "name": name, "text": clip})
        yield (name, clip)
