"""JSON bucket index for the local BERT-tiny runtime.

Each local bucket stays under 50,000,000 bytes. Each file stays within the
Appwrite maximumFileSize already set in backends.py (33,554,432 bytes).
The little model reads index.json and lookup.sqlite. It does not scan shards.
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
HF_DIR = ROOT / "hf"
BUCKET_LIMIT_BYTES = 50_000_000
FILE_LIMIT_BYTES = 33_554_432
BUCKET_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$")
_TOKEN = re.compile(r"[A-Za-z0-9]+")


def bucket_kind(bucket_id: str) -> str:
    if bucket_id.startswith("parameters"):
        return "parameters"
    if bucket_id.startswith("dataset"):
        return "dataset"
    if bucket_id.startswith("tokenizer"):
        return "tokenizer"
    if bucket_id.startswith("knowledge"):
        return "knowledge"
    if bucket_id == "index" or bucket_id.startswith("index-"):
        return "index"
    return "file"


def local_bucket(relative: str) -> str | None:
    parts = relative.replace("\\", "/").split("/")
    if len(parts) >= 2 and parts[0] == "buckets" and parts[1] and parts[1] != "..":
        return parts[1]
    return None


def remote_bucket(primary: str, relative: str) -> str:
    """Cloud bucket for one hf-relative path. Primary keeps the checkpoint."""
    local = local_bucket(relative)
    bucket = primary if local is None else f"{primary}-{local}"
    if not BUCKET_ID.fullmatch(bucket):
        raise ValueError(f"Unsafe bucket id: {bucket}")
    return bucket


def plan_storage(files: list[tuple[str, int]], primary: str = "hf") -> dict[str, int]:
    """Sum bytes per cloud bucket. Refuse a file or a bucket that is over the cap."""
    totals: dict[str, int] = {}
    for relative, size in files:
        if size > FILE_LIMIT_BYTES:
            raise ValueError(f"{relative} is {size} bytes, over the {FILE_LIMIT_BYTES} byte file cap")
        bucket = remote_bucket(primary, relative)
        totals[bucket] = totals.get(bucket, 0) + size
        if totals[bucket] >= BUCKET_LIMIT_BYTES:
            raise ValueError(f"{bucket} would be {totals[bucket]} bytes, over the 50 MB bucket cap")
    return totals


class BucketWriter:
    """Place files into local bucket directories without crossing either cap."""

    def __init__(
        self,
        root: Path,
        *,
        bucket_limit: int = BUCKET_LIMIT_BYTES,
        file_limit: int = FILE_LIMIT_BYTES,
    ) -> None:
        self.root = root
        self.bucket_limit = bucket_limit
        self.file_limit = file_limit
        self.used: dict[str, int] = {}
        self.part: dict[str, int] = {}
        self.files: dict[str, list[dict[str, Any]]] = {}

    def place(self, group: str, filename: str, data: bytes) -> tuple[str, str]:
        if len(data) > self.file_limit or len(data) >= self.bucket_limit:
            raise ValueError(f"{filename} is {len(data)} bytes and does not fit in an empty bucket")
        part = self.part.get(group, 1)
        bucket = group if part == 1 else f"{group}-{part}"
        while self.used.get(bucket, 0) and self.used[bucket] + len(data) >= self.bucket_limit:
            part += 1
            bucket = group if part == 1 else f"{group}-{part}"
        self.part[group] = part
        dest = self.root / bucket
        dest.mkdir(parents=True, exist_ok=True)
        (dest / filename).write_bytes(data)
        rel = f"buckets/{bucket}/{filename}"
        self.used[bucket] = self.used.get(bucket, 0) + len(data)
        self.files.setdefault(bucket, []).append({
            "path": rel,
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        })
        return bucket, rel

    def note_file(self, group: str, path: Path) -> tuple[str, str]:
        data = path.read_bytes()
        recorded = self.files.get(group, [])
        rel = f"buckets/{group}/{path.name}"
        if any(item["path"] == rel for item in recorded):
            return group, rel
        if path.parent != (self.root / group):
            return self.place(group, path.name, data)
        size = len(data)
        if size > self.file_limit or size >= self.bucket_limit:
            raise ValueError(f"{path.name} is {size} bytes and does not fit in an empty bucket")
        if self.used.get(group, 0) and self.used.get(group, 0) + size >= self.bucket_limit:
            raise ValueError(f"{group} cannot hold {path.name}")
        self.part.setdefault(group, 1)
        self.used[group] = self.used.get(group, 0) + size
        self.files.setdefault(group, []).append({
            "path": rel,
            "bytes": size,
            "sha256": hashlib.sha256(data).hexdigest(),
        })
        return group, rel


SCHEMA = """
CREATE TABLE IF NOT EXISTS tokens (
  token_id INTEGER PRIMARY KEY,
  token TEXT NOT NULL,
  bucket TEXT NOT NULL,
  file TEXT NOT NULL,
  offset INTEGER NOT NULL,
  nbytes INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tokens_token ON tokens(token);
CREATE TABLE IF NOT EXISTS parameter_rows (
  name TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  bucket TEXT NOT NULL,
  file TEXT NOT NULL,
  offset INTEGER NOT NULL,
  nbytes INTEGER NOT NULL,
  PRIMARY KEY (name, row_index)
);
CREATE TABLE IF NOT EXISTS passages (
  id INTEGER PRIMARY KEY,
  split TEXT NOT NULL,
  bucket TEXT NOT NULL,
  file TEXT NOT NULL,
  offset INTEGER NOT NULL,
  nbytes INTEGER NOT NULL,
  snippet TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS passage_fts USING fts5(text, content='');
CREATE VIRTUAL TABLE IF NOT EXISTS record_fts USING fts5(
  text,
  kind UNINDEXED,
  bucket UNINDEXED,
  file UNINDEXED
);
"""


def connect_index(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    return conn


def index_paths(root: Path | None = None) -> tuple[Path, Path]:
    base = root or HF_DIR
    folder = base / "buckets" / "index"
    return folder / "index.json", folder / "lookup.sqlite"


def _load(root: Path) -> dict[str, Any] | None:
    path, _sqlite = index_paths(root)
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def status(root: Path | None = None) -> dict[str, Any]:
    """Small bucket list. This does not open weight shards."""
    payload = _load(root or HF_DIR)
    if not payload:
        return {"ready": False, "bucket_limit_bytes": BUCKET_LIMIT_BYTES, "buckets": []}
    buckets = []
    for item in payload.get("buckets") or []:
        buckets.append({
            "id": item.get("id"),
            "kind": item.get("kind"),
            "bytes": item.get("bytes", 0),
            "files": len(item.get("files") or []),
        })
    return {
        "ready": True,
        "bucket_limit_bytes": payload.get("bucket_limit_bytes", BUCKET_LIMIT_BYTES),
        "file_limit_bytes": payload.get("file_limit_bytes", FILE_LIMIT_BYTES),
        "buckets": buckets,
    }


def audit_hf(root: Path | None = None) -> list[dict[str, Any]]:
    """Measure real directories. `hf` is the checkpoint bucket; the rest are JSON buckets."""
    base = root or HF_DIR
    totals: dict[str, dict[str, Any]] = {}
    if not base.exists():
        return []
    for path in base.rglob("*"):
        if not path.is_file() or ".cache" in path.parts:
            continue
        relative = path.relative_to(base).as_posix()
        size = path.stat().st_size
        key = local_bucket(relative) or "hf"
        row = totals.setdefault(key, {"id": key, "bytes": 0, "files": 0, "over_file": 0})
        row["bytes"] += size
        row["files"] += 1
        if size > FILE_LIMIT_BYTES:
            row["over_file"] += 1
    return [totals[key] for key in sorted(totals)]


def _entry_score(query: str, entry: dict[str, Any]) -> int:
    blob = " ".join([
        str(entry.get("id") or ""),
        str(entry.get("kind") or ""),
        str(entry.get("bucket") or ""),
        str(entry.get("summary") or ""),
    ]).lower()
    needle = query.lower().strip()
    if not needle:
        return 0
    if needle == str(entry.get("id") or "").lower():
        return 1000
    if needle in blob:
        return 100
    return sum(3 for token in _TOKEN.findall(needle) if token.lower() in blob)


def _match(query: str) -> str:
    tokens = [token for token in _TOKEN.findall(query) if len(token) > 1][:12]
    return " ".join(f'"{token}"' for token in tokens)


def _entry_hit(entry: dict[str, Any]) -> dict[str, Any]:
    shards = entry.get("shards") or []
    first = shards[0] if shards else {}
    buckets: list[str] = []
    files: list[str] = []
    for shard in shards:
        bucket = shard.get("bucket")
        if bucket and bucket not in buckets:
            buckets.append(bucket)
        if shard.get("file"):
            files.append(shard["file"])
    if not buckets and entry.get("bucket"):
        buckets.append(entry["bucket"])
    return {
        "kind": entry.get("kind"),
        "id": entry.get("id"),
        "bucket": entry.get("bucket"),
        "buckets": buckets,
        "file": first.get("file") or entry.get("file"),
        "files": files,
        "bytes": entry.get("bytes"),
        "shape": entry.get("shape"),
        "rows": entry.get("rows"),
        "summary": entry.get("summary"),
    }


def find(query: str, limit: int = 8, root: Path | None = None) -> dict[str, Any]:
    """Locate buckets, passages, tokens, and records. Does not load tensor values."""
    text = (query or "").strip()
    if not text or len(text) > 500:
        raise ValueError("Query must contain 1 to 500 characters")
    if not 1 <= limit <= 20:
        raise ValueError("limit must be between 1 and 20")
    base = root or HF_DIR
    payload = _load(base)
    if not payload:
        return {
            "ready": False,
            "query": text,
            "bucket_limit_bytes": BUCKET_LIMIT_BYTES,
            "entries": [],
            "passages": [],
            "tokens": [],
            "records": [],
            "detail": "Bucket index is not built",
        }
    ranked = [
        (_entry_score(text, entry), str(entry.get("id") or ""), entry)
        for entry in payload.get("entries") or []
    ]
    ranked.sort(key=lambda item: (-item[0], item[1]))
    entries = [_entry_hit(entry) for score, _name, entry in ranked if score > 0]
    passages: list[dict[str, Any]] = []
    tokens: list[dict[str, Any]] = []
    records: list[dict[str, Any]] = []
    _index, sqlite_path = index_paths(base)
    if sqlite_path.is_file():
        match = _match(text)
        with sqlite3.connect(sqlite_path) as conn:
            if match:
                try:
                    rows = conn.execute(
                        """
                        SELECT p.split, p.bucket, p.file, p.offset, p.nbytes, p.snippet
                        FROM passage_fts
                        JOIN passages p ON p.id = passage_fts.rowid
                        WHERE passage_fts MATCH ?
                        LIMIT ?
                        """,
                        (match, limit),
                    ).fetchall()
                except sqlite3.OperationalError:
                    rows = []
                for split, bucket, file, offset, nbytes, body in rows:
                    passages.append({
                        "kind": "passage",
                        "split": split,
                        "bucket": bucket,
                        "file": file,
                        "offset": offset,
                        "bytes": nbytes,
                        "text": (body or "")[:280],
                    })
                try:
                    rows = conn.execute(
                        "SELECT kind, bucket, file, text FROM record_fts WHERE record_fts MATCH ? LIMIT ?",
                        (match, limit),
                    ).fetchall()
                except sqlite3.OperationalError:
                    rows = []
                for kind, bucket, file, body in rows:
                    records.append({
                        "kind": kind,
                        "bucket": bucket,
                        "file": file,
                        "text": (body or "")[:280],
                    })
            keys = [text]
            keys.extend(token for token in re.findall(r"[A-Za-z0-9#]+", text) if token not in keys)
            for key in keys[:8]:
                for token_id, token, bucket, file, offset, nbytes in conn.execute(
                    "SELECT token_id, token, bucket, file, offset, nbytes FROM tokens WHERE token = ? LIMIT ?",
                    (key, limit),
                ):
                    tokens.append({
                        "kind": "tokenizer",
                        "token_id": token_id,
                        "token": token,
                        "bucket": bucket,
                        "file": file,
                        "offset": offset,
                        "bytes": nbytes,
                    })
                if len(tokens) >= limit:
                    break
    return {
        "ready": True,
        "query": text,
        "bucket_limit_bytes": payload.get("bucket_limit_bytes", BUCKET_LIMIT_BYTES),
        "entries": entries[:limit],
        "passages": passages[:limit],
        "tokens": tokens[:limit],
        "records": records[:limit],
    }


def resolve_bucket_file(root: Path, relative: str) -> Path:
    parts = relative.replace("\\", "/").split("/")
    if len(parts) < 3 or parts[0] != "buckets" or ".." in parts:
        raise ValueError("Path must stay inside hf/buckets")
    path = (root / relative).resolve()
    base = (root / "buckets").resolve()
    if path != base and base not in path.parents:
        raise ValueError("Path must stay inside hf/buckets")
    return path


def read_parameter_row(name: str, row: int, root: Path | None = None) -> dict[str, Any]:
    """Seek one matrix row by the sqlite offset. Does not parse the rest of the shard."""
    base = root or HF_DIR
    _index, sqlite_path = index_paths(base)
    if not sqlite_path.is_file():
        raise FileNotFoundError("Bucket index is not built")
    with sqlite3.connect(sqlite_path) as conn:
        found = conn.execute(
            "SELECT bucket, file, offset, nbytes FROM parameter_rows WHERE name = ? AND row_index = ?",
            (name, row),
        ).fetchone()
    if not found:
        raise KeyError(f"{name} row {row}")
    bucket, relative, offset, nbytes = found
    if nbytes < 1 or nbytes > 2_000_000 or offset < 0:
        raise ValueError("Parameter row location is not usable")
    path = resolve_bucket_file(base, relative)
    with path.open("rb") as handle:
        handle.seek(offset)
        raw = handle.read(nbytes)
    if len(raw) != nbytes:
        raise ValueError("Parameter row is shorter than the index")
    payload = json.loads(raw.decode("utf-8"))
    payload["bucket"] = bucket
    payload["file"] = relative
    payload["nbytes"] = nbytes
    return payload


def read_dataset_passages(query: str, limit: int = 3, root: Path | None = None) -> dict[str, Any]:
    """Seek matching WikiText JSONL lines by the sqlite offset. Does not load the shard."""
    text = (query or "").strip()
    if not text or len(text) > 500:
        raise ValueError("Query must contain 1 to 500 characters")
    if not 1 <= limit <= 20:
        raise ValueError("limit must be between 1 and 20")
    base = root or HF_DIR
    _index, sqlite_path = index_paths(base)
    if not sqlite_path.is_file():
        raise FileNotFoundError("Bucket index is not built")
    match = _match(text)
    rows: list[tuple[Any, ...]] = []
    if match:
        with sqlite3.connect(sqlite_path) as conn:
            try:
                rows = conn.execute(
                    """
                    SELECT p.split, p.bucket, p.file, p.offset, p.nbytes
                    FROM passage_fts
                    JOIN passages p ON p.id = passage_fts.rowid
                    WHERE passage_fts MATCH ?
                    LIMIT ?
                    """,
                    (match, limit),
                ).fetchall()
            except sqlite3.OperationalError:
                rows = []
    passages: list[dict[str, Any]] = []
    for split, bucket, relative, offset, nbytes in rows:
        if nbytes < 1 or nbytes > 2_000_000 or offset < 0:
            raise ValueError("Passage location is not usable")
        path = resolve_bucket_file(base, relative)
        with path.open("rb") as handle:
            handle.seek(offset)
            raw = handle.read(nbytes)
        if len(raw) != nbytes:
            raise ValueError("Passage is shorter than the index")
        payload = json.loads(raw.decode("utf-8"))
        body = str(payload.get("text") or "").strip()
        passages.append({
            "kind": "passage",
            "split": payload.get("split") or split,
            "bucket": bucket,
            "file": relative,
            "offset": offset,
            "bytes": nbytes,
            "i": payload.get("i"),
            "text": body[:280],
        })
    return {"ready": True, "query": text, "passages": passages}
