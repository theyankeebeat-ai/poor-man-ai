import hashlib
from pathlib import Path

import httpx
import pytest

from server import backends, hf_storage, hf_tiny


def test_secret_key_headers():
    assert backends._supabase_headers({"key": "sb_secret_test"}) == {"apikey": "sb_secret_test"}
    assert backends._supabase_headers({"key": "jwt"})["Authorization"] == "Bearer jwt"


def test_restore_failover_integrity_and_cache(monkeypatch, tmp_path):
    data = b"matching model data"
    entry = {"path": "model/vocab.txt", "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    calls = []

    def handle(req):
        calls.append(str(req.url))
        if req.url.host == "supabase.invalid":
            return httpx.Response(503)
        if backends._file_id("manifest.json") in req.url.path:
            return httpx.Response(200, json={"files": [entry]})
        return httpx.Response(200, content=data)

    client = httpx.Client(transport=httpx.MockTransport(handle))
    monkeypatch.setenv("HF_STORAGE_PROVIDER", "auto")
    monkeypatch.setattr(hf_storage.httpx, "Client", lambda **kwargs: client)
    monkeypatch.setattr(hf_storage, "_supabase", lambda: {"url": "https://supabase.invalid", "bucket": "hf", "key": "secret"})
    monkeypatch.setattr(hf_storage, "_appwrite", lambda: {"endpoint": "https://appwrite.invalid", "bucket": "hf", "project": "p", "key": "secret"})
    result = hf_storage.restore_snapshot(tmp_path)
    assert result == {"provider": "appwrite", "downloaded": 1}
    assert (tmp_path / entry["path"]).read_bytes() == data
    assert not list(tmp_path.rglob("*.part"))


@pytest.mark.parametrize("name,checksum", [("../outside", "a" * 64), ("model.bin", "a" * 64), ("model.bin", "")])
def test_restore_rejects_unsafe_or_corrupt_files(monkeypatch, tmp_path, name, checksum):
    def handle(req):
        if req.url.path.endswith("manifest.json"):
            return httpx.Response(200, json={"files": [{"path": name, "bytes": 3, "sha256": checksum}]})
        return httpx.Response(200, content=b"bad")
    client = httpx.Client(transport=httpx.MockTransport(handle))
    monkeypatch.setenv("HF_STORAGE_PROVIDER", "supabase")
    monkeypatch.setattr(hf_storage.httpx, "Client", lambda **kwargs: client)
    monkeypatch.setattr(hf_storage, "_supabase", lambda: {"url": "https://storage.invalid", "bucket": "hf", "key": "secret"})
    with pytest.raises(RuntimeError, match="Snapshot restore failed"):
        hf_storage.restore_snapshot(tmp_path)
    assert not (tmp_path / "model.bin").exists()


@pytest.mark.skipif(not (hf_tiny.MODEL_DIR / "pytorch_model.bin").is_file(), reason="Requires the local hf snapshot")
def test_real_checkpoint_inference(monkeypatch):
    monkeypatch.setenv("HF_STORAGE_PROVIDER", "local")
    result = hf_tiny.run_query("the history of the Roman Empire", top_k=2)
    assert result["model"]["weights_loaded"] is True
    assert result["model"]["parameter_count"] == 4385920
    assert len(result["hits"]) == 2
    assert all(hit["split"] == "train" and -1.001 <= hit["score"] <= 1.001 for hit in result["hits"])
    assert result["input_ids"][0] == 101
    assert result["input_ids"][-1] == 102
    repeat = hf_tiny.run_query("the history of the Roman Empire", top_k=2)
    assert repeat["hits"] == result["hits"]


@pytest.mark.parametrize("query,k", [("", 3), ("test", 0), ("test", 11), ("x" * 8001, 1)])
def test_query_validation(query, k):
    with pytest.raises(ValueError):
        hf_tiny.run_query(query, k)
