"""One local system. Health routes are not parts."""

from __future__ import annotations

from typing import Any

import httpx

PY = "http://127.0.0.1:8000"
NODE = "http://127.0.0.1:3001"

PARTS: list[dict[str, Any]] = [
    {"id": "backends", "address": PY, "method": "GET", "path": "/api/backends", "owns": ["registry"]},
    {"id": "brain-hf", "address": PY, "method": "GET", "path": "/api/brain/hf", "owns": ["catalog"]},
    {"id": "brain-hf-file", "address": PY, "method": "GET", "path": "/api/brain/hf/file", "owns": ["snapshot"]},
    {"id": "api-read-url", "address": PY, "method": "GET", "path": "/api/read-url", "owns": ["page"]},
    {"id": "api-read-url-post", "address": PY, "method": "POST", "path": "/api/read-url", "owns": ["page"]},
    {"id": "guardrails", "address": PY, "method": "POST", "path": "/api/real-ai/guardrails/evaluate", "owns": ["safety"]},
    {"id": "providers", "address": PY, "method": "GET", "path": "/api/real-ai/providers", "owns": ["providers"]},
    {"id": "rag-documents", "address": PY, "method": "GET", "path": "/api/real-ai/rag/documents", "owns": ["documents"]},
    {"id": "rag-index", "address": PY, "method": "POST", "path": "/api/real-ai/rag/index", "owns": ["index"]},
    {"id": "rag-search", "address": PY, "method": "POST", "path": "/api/real-ai/rag/search", "owns": ["matches"]},
    {"id": "model", "address": PY, "method": "POST", "path": "/api/webai/hf", "owns": ["parameters", "dataset", "tokenizer"]},
    {"id": "chat", "address": PY, "method": "POST", "path": "/chat", "owns": ["messages"]},
    {"id": "crew-broadcast", "address": PY, "method": "POST", "path": "/crew/broadcast-test", "owns": ["bus"]},
    {"id": "crew-router", "address": PY, "method": "GET", "path": "/crew/router", "owns": ["topology"]},
    {"id": "debug-route", "address": PY, "method": "POST", "path": "/debug/route", "owns": ["route"]},
    {"id": "knowledge", "address": PY, "method": "GET", "path": "/mcp/knowledge", "owns": ["packs"]},
    {"id": "neurons", "address": PY, "method": "GET", "path": "/mcp/neurons", "owns": ["banks"]},
    {"id": "skills", "address": PY, "method": "GET", "path": "/mcp/skills", "owns": ["skills"]},
    {"id": "memory", "address": PY, "method": "GET", "path": "/memory", "owns": ["facts"]},
    {"id": "architecture", "address": PY, "method": "GET", "path": "/model/architecture", "owns": ["blueprints"]},
    {"id": "train", "address": PY, "method": "POST", "path": "/model/train", "owns": ["presets"]},
    {"id": "read-url", "address": PY, "method": "POST", "path": "/read-url", "owns": ["page"]},
    {"id": "tools", "address": PY, "method": "GET", "path": "/tools", "owns": ["tools"]},
    {"id": "tts", "address": PY, "method": "POST", "path": "/tts", "owns": ["audio"]},
    {"id": "voices", "address": PY, "method": "GET", "path": "/tts/voices", "owns": ["voices"]},
    {"id": "upload", "address": PY, "method": "POST", "path": "/upload", "owns": ["uploads"]},
    {"id": "node", "address": NODE, "method": "GET", "path": "/api/node/inspect-package", "owns": ["package"]},
]


def registry() -> dict[str, Any]:
    return {
        "system": "poor-man-ai",
        "mode": "one",
        "skipped": ["health"],
        "parts": PARTS,
    }


def call_model(query: str, top_k: int = 3) -> dict[str, Any]:
    """POST the model part. Fall back only when that part cannot be connected to."""
    part = next(item for item in PARTS if item["id"] == "model")
    url = f"{part['address']}{part['path']}"
    try:
        response = httpx.post(
            url,
            json={"query": query, "top_k": top_k},
            timeout=120.0,
            trust_env=False,
        )
    except (httpx.ConnectError, httpx.ConnectTimeout):
        from server.hf_tiny import run_query

        return run_query(query, top_k)
    if response.status_code >= 400:
        raise RuntimeError(str(response.status_code))
    try:
        return response.json()
    except ValueError:
        raise RuntimeError(str(response.status_code)) from None
