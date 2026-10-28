#!/usr/bin/env python3
"""Write dataset and parameter JSON into buckets the local model can search.

The checkpoint's two large matrices are sharded so each file stays within
the 32 MB Appwrite cap and each bucket stays under 50 MB. Run from the repo:

    python scripts/build_json_buckets.py
"""

from __future__ import annotations

import csv
import hashlib
import json
import shutil
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server.buckets import (  # noqa: E402
    BUCKET_LIMIT_BYTES,
    FILE_LIMIT_BYTES,
    BucketWriter,
    bucket_kind,
    connect_index,
)

HF_DIR = ROOT / "hf"
MODEL_DIR = HF_DIR / "prajjwal1-bert-tiny"
WIKI_DIR = HF_DIR / "wikitext-2-raw-v1" / "wikitext-2-raw-v1"
KAGGLE_DIR = ROOT / "kaggle_dataset" / "data"
DOMAIN_DIR = ROOT / "server" / "mcp" / "knowledge" / "domains"
SHARD_TARGET = 20_000_000
SKIP_TELEMETRY = {"hf_tokenizer_vocab.csv", "hf_wikitext_sample.csv"}


def _tensor_group(name: str) -> str:
    if name == "bert.embeddings.word_embeddings.weight":
        return "parameters-word-embeddings"
    if name == "cls.predictions.decoder.weight":
        return "parameters-decoder"
    if name.startswith("cls."):
        return "parameters-mlm-head"
    return "parameters-encoder"


def _safe(name: str) -> str:
    return name.replace("/", "-")


def _encode_row(index: int, values: list[float]) -> bytes:
    body = ",".join(format(value, ".6g") for value in values)
    return f'{{"i":{index},"v":[{body}]}}\n'.encode("ascii")


def _write_matrix(writer: BucketWriter, conn: Any, name: str, tensor: Any) -> dict[str, Any]:
    array = tensor.detach().float().cpu().numpy()
    rows, cols = array.shape
    group = _tensor_group(name)
    shard_index = 0
    pending: list[tuple[int, int, int]] = []
    pieces: list[bytes] = []
    used = 0
    shards: list[dict[str, Any]] = []
    row_start = 0

    def flush(end: int) -> None:
        nonlocal shard_index, pending, pieces, used, row_start
        if not pieces:
            return
        raw = b"".join(pieces)
        filename = f"{_safe(name)}-{shard_index:03d}.jsonl"
        bucket, relative = writer.place(group, filename, raw)
        for row_index, offset, nbytes in pending:
            conn.execute(
                "INSERT INTO parameter_rows (name, row_index, bucket, file, offset, nbytes) VALUES (?,?,?,?,?,?)",
                (name, row_index, bucket, relative, offset, nbytes),
            )
        shards.append({
            "file": relative,
            "bucket": bucket,
            "row_start": row_start,
            "row_end": end,
            "bytes": len(raw),
        })
        print(f"  {relative} {len(raw)} bytes rows {row_start}-{end - 1}")
        shard_index += 1
        pending = []
        pieces = []
        used = 0
        row_start = end

    for index in range(rows):
        line = _encode_row(index, array[index].tolist())
        if pieces and used + len(line) > SHARD_TARGET:
            flush(index)
        pending.append((index, used, len(line)))
        pieces.append(line)
        used += len(line)
    flush(rows)
    return {
        "id": name,
        "kind": "parameters",
        "bucket": shards[0]["bucket"],
        "shape": [rows, cols],
        "rows": rows,
        "bytes": sum(item["bytes"] for item in shards),
        "summary": "Search copy of one checkpoint matrix. Row i is the stored row. The model still loads pytorch_model.bin.",
        "shards": shards,
    }


def _write_tensor(writer: BucketWriter, name: str, tensor: Any) -> dict[str, Any]:
    if tensor.ndim == 2 and tensor.shape[0] >= 1024 and tensor.shape[1] >= 32:
        raise RuntimeError(f"{name} should be sharded")
    if tensor.dtype.is_floating_point:
        values: list[Any] = [round(float(value), 6) for value in tensor.detach().reshape(-1).tolist()]
        dtype = "float"
    else:
        values = [int(value) for value in tensor.detach().reshape(-1).tolist()]
        dtype = "int"
    payload = {
        "name": name,
        "shape": list(tensor.shape),
        "dtype": dtype,
        "count": len(values),
        "values": values,
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    bucket, relative = writer.place(_tensor_group(name), f"{_safe(name)}.json", raw)
    print(f"  {relative} {len(raw)} bytes")
    return {
        "id": name,
        "kind": "parameters",
        "bucket": bucket,
        "file": relative,
        "shape": list(tensor.shape),
        "rows": int(tensor.shape[0]) if tensor.ndim else 1,
        "bytes": len(raw),
        "summary": "Search copy of one checkpoint tensor. The model still loads pytorch_model.bin.",
        "shards": [{"file": relative, "bucket": bucket, "bytes": len(raw)}],
    }


def _write_weights(writer: BucketWriter, conn: Any) -> list[dict[str, Any]]:
    import torch

    path = MODEL_DIR / "pytorch_model.bin"
    state = torch.load(path, map_location="cpu", weights_only=True)
    entries = []
    counted = 0
    for name, tensor in state.items():
        counted += int(tensor.numel())
        print(f"  tensor {name} {tuple(tensor.shape)}", flush=True)
        if tensor.ndim == 2 and tensor.shape[0] >= 1024 and tensor.shape[1] >= 32:
            entries.append(_write_matrix(writer, conn, name, tensor))
        else:
            entries.append(_write_tensor(writer, name, tensor))
    print(f"checkpoint values {counted}")
    return entries


def _flush_lines(writer: BucketWriter, group: str, stem: str, lines: list[bytes], shard_index: int) -> tuple[str, str, int]:
    raw = b"".join(lines)
    filename = f"{stem}-{shard_index:03d}.jsonl" if shard_index else f"{stem}.jsonl"
    bucket, relative = writer.place(group, filename, raw)
    print(f"  {relative} {len(raw)} bytes")
    return bucket, relative, len(raw)


def _write_wikitext(writer: BucketWriter, conn: Any) -> list[dict[str, Any]]:
    import pyarrow.parquet as pq

    entries = []
    for split, filename in (
        ("train", "train-00000-of-00001.parquet"),
        ("validation", "validation-00000-of-00001.parquet"),
        ("test", "test-00000-of-00001.parquet"),
    ):
        path = WIKI_DIR / filename
        table = pq.ParquetFile(path)
        group = f"dataset-wikitext-{split}"
        lines: list[bytes] = []
        used = 0
        shard_index = 0
        shards: list[dict[str, Any]] = []
        rows = 0
        indexed = 0
        file_offset = 0
        next_id = conn.execute("SELECT COALESCE(MAX(id), 0) FROM passages").fetchone()[0] + 1
        batch_rows: list[tuple[Any, ...]] = []

        def flush() -> None:
            nonlocal lines, used, shard_index, file_offset, next_id
            if not lines:
                return
            bucket, relative, size = _flush_lines(writer, group, "passages", lines, shard_index)
            shards.append({"file": relative, "bucket": bucket, "bytes": size})
            for text, offset, nbytes, keep in batch_rows:
                if not keep:
                    continue
                passage_id = next_id
                next_id += 1
                conn.execute(
                    "INSERT INTO passages (id, split, bucket, file, offset, nbytes, snippet) VALUES (?,?,?,?,?,?,?)",
                    (passage_id, split, bucket, relative, offset, nbytes, text[:280]),
                )
                conn.execute(
                    "INSERT INTO passage_fts (rowid, text) VALUES (?,?)",
                    (passage_id, text),
                )
            lines = []
            used = 0
            file_offset = 0
            shard_index += 1
            batch_rows.clear()

        for batch in table.iter_batches(batch_size=512, columns=["text"]):
            for text in batch.column(0).to_pylist():
                value = text or ""
                raw = (json.dumps({"i": rows, "split": split, "text": value}, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
                if lines and used + len(raw) > SHARD_TARGET:
                    flush()
                stripped = value.strip()
                batch_rows.append((stripped, file_offset, len(raw), len(stripped) >= 40))
                if len(stripped) >= 40:
                    indexed += 1
                lines.append(raw)
                used += len(raw)
                file_offset += len(raw)
                rows += 1
        flush()
        entries.append({
            "id": f"wikitext-2-raw-v1-{split}",
            "kind": "dataset",
            "bucket": shards[0]["bucket"],
            "rows": rows,
            "indexed_rows": indexed,
            "bytes": sum(item["bytes"] for item in shards),
            "summary": f"Salesforce WikiText-2 raw v1 {split} split. Passages of 40 characters or more are in the search index.",
            "shards": shards,
        })
    return entries


def _write_tokenizer(writer: BucketWriter, conn: Any) -> dict[str, Any]:
    lines_out: list[bytes] = []
    offset = 0
    rows = []
    vocab = (MODEL_DIR / "vocab.txt").read_text(encoding="utf-8").splitlines()
    special = {"[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]"}
    for token_id, token in enumerate(vocab):
        raw = (json.dumps({
            "token_id": token_id,
            "token": token,
            "special": int(token in special),
            "subword": int(token.startswith("##")),
        }, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
        rows.append((token_id, token, offset, len(raw)))
        lines_out.append(raw)
        offset += len(raw)
    raw_file = b"".join(lines_out)
    bucket, relative = writer.place("tokenizer", "vocab.jsonl", raw_file)
    conn.executemany(
        "INSERT INTO tokens (token_id, token, bucket, file, offset, nbytes) VALUES (?,?,?,?,?,?)",
        [(token_id, token, bucket, relative, off, nbytes) for token_id, token, off, nbytes in rows],
    )
    print(f"  {relative} {len(raw_file)} bytes")
    return {
        "id": "bert-tiny-vocab",
        "kind": "tokenizer",
        "bucket": bucket,
        "rows": len(vocab),
        "bytes": len(raw_file),
        "summary": "WordPiece vocab for prajjwal1/bert-tiny. token_id matches the embedding row.",
        "shards": [{"file": relative, "bucket": bucket, "bytes": len(raw_file)}],
    }


def _records_from_table(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() == ".jsonl":
        rows = []
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                rows.append(json.loads(line))
        return rows
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def _record_text(row: dict[str, Any]) -> str:
    parts = [str(value).strip() for value in row.values() if str(value).strip()]
    return "\n".join(parts)[:2000]


def _write_tables(writer: BucketWriter, conn: Any) -> list[dict[str, Any]]:
    entries = []
    router_names = {"neuron_routing_topology.csv", "hf_bert_tiny_model.csv", "hf_bert_tiny_parameters.csv"}
    jsonl_stems = {path.stem for path in KAGGLE_DIR.glob("*.jsonl")}
    for path in sorted(KAGGLE_DIR.iterdir()):
        if not path.is_file() or path.name in SKIP_TELEMETRY:
            continue
        if path.suffix.lower() not in {".csv", ".jsonl"}:
            continue
        if path.suffix.lower() == ".csv" and path.stem in jsonl_stems:
            continue
        rows = _records_from_table(path)
        group = "parameters-router" if path.name in router_names else "dataset-telemetry"
        raw = json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        bucket, relative = writer.place(group, f"{path.stem}.json", raw)
        kind = "parameters" if group == "parameters-router" else "dataset"
        for row in rows:
            text = _record_text(row)
            if text:
                conn.execute(
                    "INSERT INTO record_fts (text, kind, bucket, file) VALUES (?,?,?,?)",
                    (text, kind, bucket, relative),
                )
        entries.append({
            "id": path.stem,
            "kind": kind,
            "bucket": bucket,
            "file": relative,
            "rows": len(rows),
            "bytes": len(raw),
            "summary": f"JSON copy of {path.name}.",
            "shards": [{"file": relative, "bucket": bucket, "bytes": len(raw)}],
        })
        print(f"  {relative} {len(raw)} bytes")
    return entries


def _write_domains(writer: BucketWriter, conn: Any) -> list[dict[str, Any]]:
    entries = []
    for path in sorted(DOMAIN_DIR.glob("*.json")):
        raw = path.read_bytes()
        bucket, relative = writer.place("knowledge-domains", path.name, raw)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            payload = {}
        text = _record_text({
            "title": payload.get("title", path.stem),
            "topics": " ".join(payload.get("topics") or []),
            "scope": payload.get("scope", ""),
            "method": " ".join(payload.get("method") or []),
        })
        if text:
            conn.execute(
                "INSERT INTO record_fts (text, kind, bucket, file) VALUES (?,?,?,?)",
                (text, "knowledge", bucket, relative),
            )
        entries.append({
            "id": f"domain-{path.stem}",
            "kind": "knowledge",
            "bucket": bucket,
            "file": relative,
            "bytes": len(raw),
            "summary": str(payload.get("scope") or payload.get("title") or path.stem),
            "shards": [{"file": relative, "bucket": bucket, "bytes": len(raw)}],
        })
    print(f"  knowledge-domains {len(entries)} cards")
    return entries


def _bucket_payload(writer: BucketWriter) -> list[dict[str, Any]]:
    buckets = []
    for bucket_id in sorted(writer.files):
        files = writer.files[bucket_id]
        buckets.append({
            "id": bucket_id,
            "kind": bucket_kind(bucket_id),
            "bytes": sum(item["bytes"] for item in files),
            "files": files,
        })
    return buckets


def _check(writer: BucketWriter) -> None:
    for bucket_id, total in writer.used.items():
        if total >= BUCKET_LIMIT_BYTES:
            raise RuntimeError(f"{bucket_id} is {total} bytes")
        for item in writer.files.get(bucket_id, []):
            if item["bytes"] > FILE_LIMIT_BYTES:
                raise RuntimeError(f"{item['path']} is {item['bytes']} bytes")


def build(staging: Path) -> None:
    writer = BucketWriter(staging)
    db_path = staging / "index" / "lookup.sqlite"
    conn = connect_index(db_path)
    try:
        entries: list[dict[str, Any]] = []
        print("parameters")
        entries.extend(_write_weights(writer, conn))
        print("wikitext")
        entries.extend(_write_wikitext(writer, conn))
        print("tokenizer")
        entries.append(_write_tokenizer(writer, conn))
        print("tables")
        entries.extend(_write_tables(writer, conn))
        print("domains")
        entries.extend(_write_domains(writer, conn))
        conn.commit()
    finally:
        conn.close()
    writer.note_file("index", db_path)
    payload = {
        "bucket_limit_bytes": BUCKET_LIMIT_BYTES,
        "file_limit_bytes": FILE_LIMIT_BYTES,
        "note": "Read this index, then query lookup.sqlite. Do not scan shard files to find a tensor or a passage.",
        "buckets": _bucket_payload(writer),
        "entries": entries,
    }
    index_path = staging / "index" / "index.json"
    for _ in range(3):
        raw = json.dumps(payload, indent=2).encode("utf-8")
        index_path.write_bytes(raw)
        files = [item for item in writer.files.get("index", []) if not item["path"].endswith("/index.json")]
        record = {"path": "buckets/index/index.json", "bytes": len(raw)}
        files.append(record)
        writer.files["index"] = files
        writer.used["index"] = sum(item["bytes"] for item in files)
        payload["buckets"] = _bucket_payload(writer)
        if json.dumps(payload, indent=2).encode("utf-8") == raw:
            break
    _check(writer)
    print("buckets")
    for item in payload["buckets"]:
        print(f"  {item['id']:32} {item['bytes']:10} bytes  {len(item['files'])} files")


def main() -> None:
    staging = HF_DIR / "_buckets_staging"
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)
    try:
        build(staging)
        final = HF_DIR / "buckets"
        backup = HF_DIR / "_buckets_previous"
        if backup.exists():
            shutil.rmtree(backup)
        if final.exists():
            final.rename(backup)
        staging.rename(final)
        if backup.exists():
            shutil.rmtree(backup)
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    print("wrote hf/buckets")


if __name__ == "__main__":
    main()
