import json

import pytest

from server import buckets, hf_tiny
from server.buckets import (
    BUCKET_LIMIT_BYTES,
    FILE_LIMIT_BYTES,
    BucketWriter,
    audit_hf,
    connect_index,
    find,
    plan_storage,
    read_parameter_row,
    remote_bucket,
)


def test_plan_storage_gives_each_group_its_own_bucket():
    files = [
        ("prajjwal1-bert-tiny/pytorch_model.bin", 17_000_000),
        ("buckets/parameters-word-embeddings/a.jsonl", 20_000_000),
        ("buckets/parameters-word-embeddings/b.jsonl", 20_000_000),
        ("buckets/dataset-wikitext-train/passages.jsonl", 12_000_000),
    ]
    plan = plan_storage(files, primary="hf")
    assert plan["hf"] == 17_000_000
    assert plan["hf-parameters-word-embeddings"] == 40_000_000
    assert plan["hf-dataset-wikitext-train"] == 12_000_000
    assert all(size < BUCKET_LIMIT_BYTES for size in plan.values())


def test_plan_storage_rejects_an_over_cap_bucket_or_file():
    with pytest.raises(ValueError, match="50 MB"):
        plan_storage(
            [
                ("buckets/too-big/a.bin", 30_000_000),
                ("buckets/too-big/b.bin", 20_000_000),
            ],
            primary="hf",
        )
    with pytest.raises(ValueError, match="file cap"):
        plan_storage([("buckets/wide/a.bin", FILE_LIMIT_BYTES + 1)], primary="hf")


def test_remote_bucket_rejects_unsafe_names():
    assert remote_bucket("hf", "prajjwal1-bert-tiny/config.json") == "hf"
    with pytest.raises(ValueError):
        remote_bucket("hf", "buckets/bad id/file.json")


def test_writer_opens_another_bucket_before_the_cap(tmp_path):
    writer = BucketWriter(tmp_path, bucket_limit=1000, file_limit=600)
    writer.place("weights", "a.bin", b"a" * 400)
    writer.place("weights", "b.bin", b"b" * 400)
    bucket, relative = writer.place("weights", "c.bin", b"c" * 400)
    assert bucket == "weights-2"
    assert relative == "buckets/weights-2/c.bin"
    assert writer.used["weights"] == 800
    assert writer.used["weights-2"] == 400
    assert (tmp_path / "weights" / "a.bin").read_bytes() == b"a" * 400
    with pytest.raises(ValueError):
        writer.place("weights", "too-big.bin", b"x" * 601)


def test_find_reads_the_index(tmp_path):
    index = {
        "bucket_limit_bytes": BUCKET_LIMIT_BYTES,
        "entries": [{
            "id": "bert.embeddings.word_embeddings.weight",
            "kind": "parameters",
            "bucket": "parameters-word-embeddings",
            "summary": "token embedding matrix",
            "shards": [{
                "file": "buckets/parameters-word-embeddings/word-000.jsonl",
                "bucket": "parameters-word-embeddings",
            }],
        }],
        "buckets": [{"id": "parameters-word-embeddings", "kind": "parameters", "bytes": 20, "files": []}],
    }
    folder = tmp_path / "buckets" / "index"
    folder.mkdir(parents=True)
    (folder / "index.json").write_text(json.dumps(index), encoding="utf-8")
    line = b'{"i":0,"v":[1,2]}\n'
    shard = tmp_path / "buckets" / "parameters-word-embeddings" / "word-000.jsonl"
    shard.parent.mkdir(parents=True)
    shard.write_bytes(line)
    with connect_index(folder / "lookup.sqlite") as conn:
        conn.execute(
            "INSERT INTO passages (id, split, bucket, file, offset, nbytes, snippet) VALUES (?,?,?,?,?,?,?)",
            (
                1,
                "train",
                "dataset-wikitext-train",
                "buckets/dataset-wikitext-train/passages.jsonl",
                0,
                40,
                "The Roman Empire ruled the Mediterranean.",
            ),
        )
        conn.execute(
            "INSERT INTO passage_fts (rowid, text) VALUES (?,?)",
            (1, "The Roman Empire ruled the Mediterranean."),
        )
        conn.execute(
            "INSERT INTO tokens (token_id, token, bucket, file, offset, nbytes) VALUES (?,?,?,?,?,?)",
            (101, "[CLS]", "tokenizer", "buckets/tokenizer/vocab.jsonl", 0, 20),
        )
        conn.execute(
            "INSERT INTO parameter_rows (name, row_index, bucket, file, offset, nbytes) VALUES (?,?,?,?,?,?)",
            (
                "bert.embeddings.word_embeddings.weight",
                0,
                "parameters-word-embeddings",
                "buckets/parameters-word-embeddings/word-000.jsonl",
                0,
                len(line),
            ),
        )
        conn.execute(
            "INSERT INTO record_fts (text, kind, bucket, file) VALUES (?,?,?,?)",
            ("quadratic formula", "knowledge", "knowledge-domains", "buckets/knowledge-domains/algebra.json"),
        )
    found = find("word_embeddings", root=tmp_path)
    assert found["ready"] is True
    assert found["entries"][0]["bucket"] == "parameters-word-embeddings"
    assert "v" not in found["entries"][0]
    roman = find("Roman Empire", root=tmp_path)
    assert roman["passages"][0]["bucket"] == "dataset-wikitext-train"
    assert roman["passages"][0]["text"].startswith("The Roman Empire")
    assert find("[CLS]", root=tmp_path)["tokens"][0]["token_id"] == 101
    assert find("quadratic formula", root=tmp_path)["records"][0]["bucket"] == "knowledge-domains"
    row = read_parameter_row("bert.embeddings.word_embeddings.weight", 0, root=tmp_path)
    assert row["v"] == [1, 2]
    assert row["bucket"] == "parameters-word-embeddings"


def test_built_buckets_stay_under_the_cap():
    index, _sqlite = buckets.index_paths(hf_tiny.HF_DIR)
    if not index.is_file():
        pytest.skip("Run python scripts/build_json_buckets.py")
    rows = audit_hf(hf_tiny.HF_DIR)
    assert rows
    payload = json.loads(index.read_text(encoding="utf-8"))
    for bucket in payload["buckets"]:
        folder = hf_tiny.HF_DIR / "buckets" / bucket["id"]
        disk = sum(path.stat().st_size for path in folder.iterdir() if path.is_file())
        names = [item["path"] for item in bucket["files"]]
        assert len(names) == len(set(names))
        assert bucket["bytes"] == disk
    for row in rows:
        assert row["bytes"] < BUCKET_LIMIT_BYTES, row
        assert row["over_file"] == 0, row
    found = find("bert.embeddings.word_embeddings.weight", root=hf_tiny.HF_DIR)
    assert found["entries"][0]["bucket"].startswith("parameters-word-embeddings")
    sample = read_parameter_row("bert.embeddings.word_embeddings.weight", 0, root=hf_tiny.HF_DIR)
    assert len(sample["v"]) == 128
    passage = find("Roman Empire", root=hf_tiny.HF_DIR)
    assert passage["passages"]
    assert passage["passages"][0]["bucket"].startswith("dataset-wikitext-train")
