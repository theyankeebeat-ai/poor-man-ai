"""CPU BERT-tiny inference over a bounded WikiText training-split shortlist."""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
HF_DIR = Path(os.getenv("HF_SNAPSHOT_DIR", str(ROOT / "hf")))
MODEL_DIR = HF_DIR / "prajjwal1-bert-tiny"
WIKI_DIR = HF_DIR / "wikitext-2-raw-v1" / "wikitext-2-raw-v1"
TEXT_SUFFIXES = {".txt", ".json", ".md", ".gitignore"}
SPECIAL = {"[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]"}
MAX_LENGTH = 128
SHORTLIST_SIZE = 16

_lock = threading.Lock()
_tokenizer: "WordPiece | None" = None
_model_card: dict[str, Any] | None = None
_passages: list[dict[str, Any]] | None = None
_model = None
_inference_lock = threading.Lock()
_runtime = {"loaded": False, "weights_loaded": False}


class WordPiece:
    def __init__(self, vocab_path: Path) -> None:
        from transformers import BertTokenizerFast
        self.backend = BertTokenizerFast(vocab_file=str(vocab_path), do_lower_case=True)
        self.ids: dict[str, int] = {}
        for token_id, line in enumerate(vocab_path.read_text(encoding="utf-8").splitlines()):
            self.ids[line] = token_id

    def tokenize(self, text: str) -> list[str]:
        return ["[CLS]", *self.backend.tokenize(text), "[SEP]"]


def _load() -> tuple[WordPiece, dict[str, Any], list[dict[str, Any]]]:
    global _tokenizer, _model_card, _passages, _model
    with _lock:
        if _tokenizer is not None and _model_card is not None and _passages is not None:
            return _tokenizer, _model_card, _passages
        from server.hf_storage import restore_snapshot
        restored = restore_snapshot(HF_DIR)
        import torch
        from transformers import BertConfig, BertModel
        torch.set_num_threads(max(1, int(os.getenv("HF_NUM_THREADS", "1"))))
        config_path = MODEL_DIR / "config.json"
        vocab_path = MODEL_DIR / "vocab.txt"
        weights_path = MODEL_DIR / "pytorch_model.bin"
        if not config_path.exists() or not vocab_path.exists() or not weights_path.exists():
            raise FileNotFoundError(f"BERT-tiny snapshot missing under {MODEL_DIR}")
        config = json.loads(config_path.read_text(encoding="utf-8"))
        model, loading = BertModel.from_pretrained(
            str(MODEL_DIR), config=BertConfig.from_dict(config),
            local_files_only=True, weights_only=True, output_loading_info=True,
        )
        if loading.get("missing_keys") or loading.get("mismatched_keys"):
            raise RuntimeError("BERT checkpoint does not match its configuration")
        model.eval()
        weight_bytes = weights_path.stat().st_size if weights_path.exists() else 0
        card = {
            "model_id": "prajjwal1/bert-tiny",
            "tokenizer": "vocab.txt",
            "weights_file": "pytorch_model.bin",
            "weights_bytes": weight_bytes,
            "parameter_count": sum(p.numel() for p in model.parameters()),
            "weights_loaded": True,
            "inference": "bert_mean_pool_cosine_rerank",
            "dataset_split": "train",
            "max_length": MAX_LENGTH,
            "shortlist_size": SHORTLIST_SIZE,
            "hidden_size": config["hidden_size"],
            "num_hidden_layers": config["num_hidden_layers"],
            "num_attention_heads": config["num_attention_heads"],
            "vocab_size": config["vocab_size"],
            "dataset_id": "Salesforce/wikitext",
            "dataset_config": "wikitext-2-raw-v1",
        }
        passages = _read_wiki()
        if not passages:
            raise FileNotFoundError("WikiText training split has no passages")
        _tokenizer = WordPiece(vocab_path)
        if len(_tokenizer.ids) != config["vocab_size"]:
            raise RuntimeError("Tokenizer vocabulary does not match model embeddings")
        for passage in passages:
            passage["terms"] = _content_tokens(_tokenizer.tokenize(passage["text"][:800]), _tokenizer.ids)
        _model = model
        _model_card = card
        _passages = passages
        _runtime.update(loaded=True, weights_loaded=True, provider=restored["provider"],
                        parameter_count=card["parameter_count"], passages=len(passages), dataset_split="train")
        return _tokenizer, card, passages


def _read_wiki() -> list[dict[str, Any]]:
    import pyarrow.parquet as pq

    rows: list[dict[str, Any]] = []
    for split, name in (
        ("train", "train-00000-of-00001.parquet"),
    ):
        path = WIKI_DIR / name
        if not path.exists():
            continue
        table = pq.read_table(path, columns=["text"])
        for text in table.column("text").to_pylist():
            value = (text or "").strip()
            if len(value) < 40:
                continue
            rows.append({"split": split, "text": value})
    return rows


def _content_tokens(pieces: list[str], ids: dict[str, int]) -> set[int]:
    # Reuse vocabulary IDs rather than retaining duplicate strings per passage.
    return {ids[p] for p in pieces if p not in SPECIAL and len(p) > 2}


def resolve_hf_path(relative: str) -> Path:
    """Resolve a path that must stay inside the local hf/ snapshot."""
    raw = (relative or "").replace("\\", "/").strip().lstrip("/")
    if not raw or raw.startswith("..") or "/../" in f"/{raw}/":
        raise ValueError("Path must stay inside hf/")
    root = HF_DIR.resolve()
    path = (root / raw).resolve()
    if path != root and root not in path.parents:
        raise ValueError("Path must stay inside hf/")
    return path


def catalog_hf() -> dict[str, Any]:
    """Every file under hf/, including weights and parquet, skipping download caches."""
    if not HF_DIR.exists():
        return {"root": "hf", "exists": False, "files": [], "total_bytes": 0}
    files: list[dict[str, Any]] = []
    for path in sorted(HF_DIR.rglob("*")):
        if not path.is_file() or ".cache" in path.parts:
            continue
        relative = path.relative_to(HF_DIR).as_posix()
        size = path.stat().st_size
        suffix = path.suffix.lower()
        if suffix == ".parquet":
            kind = "dataset"
        elif suffix == ".bin":
            kind = "weights"
        elif path.name == "vocab.txt":
            kind = "tokenizer"
        elif suffix in TEXT_SUFFIXES:
            kind = "text"
        else:
            kind = "file"
        files.append({
            "path": relative,
            "bytes": size,
            "kind": kind,
            "url": f"/static/hf/{relative}",
        })
    return {
        "root": "hf",
        "exists": True,
        "absolute": str(HF_DIR),
        "files": files,
        "file_count": len(files),
        "total_bytes": sum(item["bytes"] for item in files),
    }


def read_hf_file(relative: str, limit: int = 12000) -> dict[str, Any]:
    """Read one file inside hf/. Binary weights are described, not inlined."""
    path = resolve_hf_path(relative)
    if not path.is_file():
        raise FileNotFoundError(relative)
    size = path.stat().st_size
    suffix = path.suffix.lower()
    payload: dict[str, Any] = {
        "path": path.relative_to(HF_DIR.resolve()).as_posix(),
        "bytes": size,
        "url": f"/static/hf/{path.relative_to(HF_DIR.resolve()).as_posix()}",
    }
    if suffix == ".parquet":
        import pyarrow.parquet as pq

        table = pq.read_table(path, columns=["text"])
        texts = table.column("text").to_pylist()
        samples = []
        for text in texts:
            value = (text or "").strip()
            if not value:
                continue
            samples.append(value[:400])
            if len(samples) >= 5:
                break
        payload["kind"] = "dataset"
        payload["rows"] = len(texts)
        payload["text"] = "\n\n---\n\n".join(samples)
        return payload
    if suffix in TEXT_SUFFIXES or path.name == "vocab.txt":
        text = path.read_text(encoding="utf-8", errors="replace")
        payload["kind"] = "tokenizer" if path.name == "vocab.txt" else "text"
        payload["truncated"] = len(text) > limit
        payload["text"] = text[:limit]
        payload["lines"] = text.count("\n") + (0 if text.endswith("\n") or not text else 1)
        return payload
    payload["kind"] = "weights" if suffix == ".bin" else "file"
    payload["text"] = (
        f"Binary file, {size:,} bytes. Open {payload['url']} to download it. "
        "The weight file is not unpickled in the browser."
    )
    return payload


def run_query(query: str, top_k: int = 3) -> dict[str, Any]:
    query = query.strip()
    if not query or len(query) > 8000:
        raise ValueError("Query must contain 1 to 8000 characters")
    if not 1 <= top_k <= 10:
        raise ValueError("top_k must be between 1 and 10")
    tokenizer, card, passages = _load()
    pieces = tokenizer.tokenize(query)
    query_tokens = _content_tokens(pieces, tokenizer.ids)
    scored: list[tuple[int, dict[str, Any]]] = []
    if query_tokens:
        for passage in passages:
            doc_tokens = passage["terms"]
            overlap = len(query_tokens & doc_tokens)
            if overlap:
                scored.append((overlap, passage))
        scored.sort(key=lambda item: item[0], reverse=True)
    candidates = scored[:max(SHORTLIST_SIZE, top_k)]
    reranked = []
    if candidates:
        import torch
        with _inference_lock, torch.inference_mode():
            # Configure the worker executing this request, including cached-model requests.
            torch.set_num_threads(max(1, int(os.getenv("HF_NUM_THREADS", "1"))))
            def embed(texts):
                encoded = tokenizer.backend(
                    texts, padding=True, truncation=True, max_length=MAX_LENGTH, return_tensors="pt",
                )
                hidden = _model(**encoded).last_hidden_state
                mask = encoded["attention_mask"].unsqueeze(-1)
                pooled = (hidden * mask).sum(1) / mask.sum(1).clamp(min=1)
                return torch.nn.functional.normalize(pooled, dim=1)

            query_vector = embed([query])[0]
            similarities = []
            # Bound activation memory independently of shortlist size on 512 MB hosts.
            for start in range(0, len(candidates), 4):
                vectors = embed([p["text"][:800] for _, p in candidates[start:start + 4]])
                similarities.extend((vectors @ query_vector).tolist())
        reranked = sorted(zip(similarities, [p for _, p in candidates]), key=lambda item: item[0], reverse=True)
    hits = [
        {
            "split": passage["split"],
            "score": score,
            "text": passage["text"][:500],
        }
        for score, passage in reranked[:top_k]
    ]
    if hits:
        body = "\n\n".join(f"[{hit['split']} cosine {hit['score']:.3f}] {hit['text']}" for hit in hits)
    else:
        body = "No WikiText-2 passage shared WordPiece tokens with this query."
    answer = (
        f"BERT retrieval using {card['model_id']} loaded weights "
        f"({card['parameter_count']:,} parameters, {card['weights_bytes']:,} byte weights) "
        f"with the {card['dataset_id']} {card['dataset_config']} snapshot.\n\n"
        f"WordPiece: {' '.join(pieces[:48])}\n\n{body}"
        "\n\nThese are retrieved passages. BERT-tiny is an encoder, not a chat generator; no fine-tuning was performed."
    )
    return {
        "query": query,
        "model": card,
        "tokens": pieces[:64],
        "token_count": len(pieces),
        "input_ids": tokenizer.backend(query, truncation=True, max_length=MAX_LENGTH)["input_ids"],
        "hits": hits,
        "answer": answer,
    }


def runtime_status() -> dict[str, Any]:
    return dict(_runtime)
