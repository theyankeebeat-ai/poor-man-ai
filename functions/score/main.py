"""Appwrite compute service for Poor Man AI.

Does lightweight math and text sanitization. Does not proxy the Go brain
and does not run AI-mode search engines.
"""

from __future__ import annotations

import json
import re
from typing import Any

CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, accept",
    "access-control-allow-methods": "GET, POST, OPTIONS",
}

BRAIN_TEXT_MAX = 8000
NOISE_LINE_RE = re.compile(
    r"^\s*(?:cookies?(?:\s+policy)?|privacy(?:\s+policy)?|terms(?:\s+of\s+(?:use|service))?|"
    r"subscribe|sign[\s-]?in|log[\s-]?in|advertisement|accept\s+all(?:\s+cookies?)?|"
    r"manage\s+preferences|share\s+this|follow\s+us|all\s+rights\s+reserved)\b.*$",
    re.I,
)
MATH_LEAD = re.compile(r"^\s*(?:what(?:'s| is)|calculate|compute|how much is)\s*", re.I)
SAFE_EXPR = re.compile(r"^[0-9+\-*/()%. ]+$")


def _json(context, payload: dict[str, Any], status: int = 200):
    headers = dict(CORS)
    headers["content-type"] = "application/json"
    headers["cache-control"] = "no-cache"
    return context.res.send(json.dumps(payload), status, headers)


def sanitize_for_brain(text: str, max_len: int = BRAIN_TEXT_MAX) -> str:
    s = str(text or "")
    s = s.replace("\x00", "")
    s = re.sub(r"[\u200b-\u200d\ufeff]", "", s)
    s = re.sub(r"data:[^\s]+", " ", s, flags=re.I)
    s = re.sub(r"!\[([^\]]*)\]\((https?:\/\/[^)]+|data:[^)]+)\)", r"\1", s, flags=re.I)
    s = re.sub(r"\[([^\]]+)\]\((https?:\/\/[^)]+)\)", r"\1", s, flags=re.I)
    s = re.sub(r"https?:\/\/[^\s<>\"'`)\]]+", " ", s, flags=re.I)
    s = re.sub(r"\bwww\.[^\s<>\"'`)\]]+", " ", s, flags=re.I)
    s = re.sub(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", " ", s, flags=re.I)
    s = re.sub(r"<script[\s\S]*?</script>", " ", s, flags=re.I)
    s = re.sub(r"<style[\s\S]*?</style>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    s = (
        s.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )
    lines = []
    for line in re.split(r"\r\n|\n|\r", s):
        trimmed = line.strip()
        if not trimmed or NOISE_LINE_RE.match(trimmed):
            continue
        lines.append(trimmed)
    s = "\n".join(lines)
    s = re.sub(r"[ \t\f\v]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    s = re.sub(r"[.]{4,}", "...", s).strip()
    if len(s) > max_len:
        s = s[:max_len].rsplit(" ", 1)[0].rstrip() + "…"
    return s


def try_math(message: str) -> str | None:
    raw = str(message or "").strip()
    if not raw:
        return None
    head = raw
    # Drop trailing "just the number" style tails lightly.
    head = re.split(r"[.!?]\s+(?:reply|answer|just|only|please|give|show|return)\b", head, maxsplit=1)[0]
    expr = MATH_LEAD.sub("", head).strip()
    expr = re.sub(r"[.!?]+$", "", expr)
    expr = (
        expr.replace("×", "*")
        .replace("÷", "/")
        .replace("^", "**")
    )
    expr = re.sub(r"\s+plus\s+", "+", expr, flags=re.I)
    expr = re.sub(r"\s+minus\s+", "-", expr, flags=re.I)
    expr = re.sub(r"\s+(?:times|multiplied\s+by)\s+", "*", expr, flags=re.I)
    expr = re.sub(r"\s+(?:divided\s+by|over)\s+", "/", expr, flags=re.I)
    expr = re.sub(r"\s+", "", expr)
    check = expr.replace("**", "")
    if not check or not SAFE_EXPR.match(check):
        return None
    try:
        # Restricted eval: digits and arithmetic operators only (already gated).
        value = eval(expr, {"__builtins__": {}}, {})  # noqa: S307
    except Exception:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    shown = expr.replace("**", "^")
    return f"{shown} = **{value}**."


def main(context):
    method = (context.req.method or "GET").upper()
    if method == "OPTIONS":
        return context.res.send("", 204, CORS)

    path = context.req.path or "/"
    if not path.startswith("/"):
        path = "/" + path

    if method == "GET" and path in ("/", "/health", "/health/"):
        return _json(
            context,
            {
                "status": "ok",
                "role": "compute",
                "search": "disabled",
                "note": "Appwrite compute: sanitize + math. Not a brain proxy. No AI-mode search.",
                "endpoints": ["/health", "/sanitize", "/math", "/compute"],
            },
        )

    payload = context.req.body
    if isinstance(payload, str) and payload:
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            payload = {"text": payload}
    if not isinstance(payload, dict):
        payload = {}

    if method == "POST" and path in ("/sanitize", "/sanitize/"):
        text = payload.get("text") or payload.get("message") or ""
        cleaned = sanitize_for_brain(str(text))
        return _json(
            context,
            {
                "ok": True,
                "role": "compute",
                "original_chars": len(str(text)),
                "cleaned_chars": len(cleaned),
                "text": cleaned,
            },
        )

    if method == "POST" and path in ("/math", "/math/"):
        expression = payload.get("expression") or payload.get("message") or payload.get("text") or ""
        result = try_math(str(expression))
        if not result:
            return _json(
                context,
                {"ok": False, "role": "compute", "error": "expression_not_safe"},
                status=400,
            )
        return _json(context, {"ok": True, "role": "compute", "content": result, "model": "appwrite-math"})

    if method == "POST" and path in ("/compute", "/compute/"):
        op = str(payload.get("op") or payload.get("action") or "").strip().lower()
        if op in ("sanitize", "clean"):
            text = payload.get("text") or payload.get("message") or ""
            cleaned = sanitize_for_brain(str(text))
            return _json(
                context,
                {"ok": True, "role": "compute", "op": "sanitize", "text": cleaned},
            )
        if op in ("math", "calculate"):
            expression = payload.get("expression") or payload.get("message") or payload.get("text") or ""
            result = try_math(str(expression))
            if not result:
                return _json(
                    context,
                    {"ok": False, "role": "compute", "op": "math", "error": "expression_not_safe"},
                    status=400,
                )
            return _json(
                context,
                {"ok": True, "role": "compute", "op": "math", "content": result},
            )
        return _json(
            context,
            {"ok": False, "role": "compute", "error": "unknown_op", "hint": "sanitize|math"},
            status=400,
        )

    return _json(
        context,
        {
            "status": "error",
            "role": "compute",
            "detail": "not found",
            "endpoints": ["/health", "/sanitize", "/math", "/compute"],
        },
        status=404,
    )
