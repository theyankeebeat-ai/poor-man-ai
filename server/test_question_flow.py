import asyncio
import json

import pytest

from server import buckets, hf_tiny
from server.question_flow import (
    MCP_ENGINES,
    read_parameter_shards,
    tokenize_question,
)


def test_tokenize_hello_wraps_cls_and_sep():
    out = tokenize_question("hello")
    assert out["tokens"][0] == "[CLS]"
    assert out["tokens"][-1] == "[SEP]"
    assert out["token_ids"][0] == 101
    assert out["token_ids"][-1] == 102
    assert "hello" in out["tokens"]
    assert out["vocab_file"] == "buckets/tokenizer/vocab.jsonl"
    assert out["vocab_rows"] == 30522


def test_tokenize_roman_empire_matches_bert_ids():
    out = tokenize_question("the history of the Roman Empire")
    assert out["tokens"] == ["[CLS]", "the", "history", "of", "the", "roman", "empire", "[SEP]"]
    assert out["token_ids"] == [101, 1996, 2381, 1997, 1996, 3142, 3400, 102]


def test_read_parameter_shards_opens_cls_row_or_skips():
    index, sqlite_path = buckets.index_paths(hf_tiny.HF_DIR)
    if not index.is_file() or not sqlite_path.is_file():
        pytest.skip("Run python scripts/build_json_buckets.py")
    out = read_parameter_shards([101])
    assert out["rows_read"] == 1
    assert out["vector_length"] == 128
    assert out["row_indexes"] == [101]
    assert out["rows"][0]["row"] == 101
    assert out["rows"][0]["dims"] == 128
    assert "v" not in out["rows"][0]
    assert any("word_embeddings" in item["file"] for item in out["files"])
    assert out["shard_heads"]
    assert not any("word_embeddings.weight" in item["file"] for item in out["shard_heads"])


def test_dataset_passage_seeks_the_jsonl_line():
    index, sqlite_path = buckets.index_paths(hf_tiny.HF_DIR)
    if not index.is_file() or not sqlite_path.is_file():
        pytest.skip("Run python scripts/build_json_buckets.py")
    from server.buckets import read_dataset_passages

    out = read_dataset_passages("Roman Empire", limit=1)
    assert out["passages"]
    hit = out["passages"][0]
    assert hit["bytes"] > 40
    assert hit["file"].endswith("passages.jsonl")
    assert hit["text"]


def test_math_stream_runs_bucket_tools_and_four_mcp_then_answers_4(monkeypatch):
    async def offline_mcp(query: str):
        return [
            (
                name,
                json.dumps({
                    "engine": name,
                    "query": query,
                    "hits": [{
                        "title": "stub",
                        "url": "https://example.invalid/stub",
                        "snippet": "offline",
                    }],
                }),
            )
            for name in MCP_ENGINES
        ]

    monkeypatch.setattr("server.question_flow.run_search_mcps", offline_mcp)
    monkeypatch.setattr("server.agent.openai_client", lambda: None)
    monkeypatch.setattr("server.agent.cache_get", lambda *_args, **_kwargs: None)

    async def collect():
        from server.agent import run_agent

        events = []
        async for line in run_agent("what is 2 + 2?", max_steps=8, thinking_level="low"):
            events.append(json.loads(line))
        return events

    events = asyncio.run(collect())
    names = [event.get("name") for event in events if event.get("type") == "tool"]
    for required in ("json_tokenizer", "read_parameter_shards", "json_dataset", *MCP_ENGINES):
        assert required in names
    done = next(event["text"] for event in events if event.get("type") == "done")
    assert "4" in done
    assert "Skipped web" not in done
