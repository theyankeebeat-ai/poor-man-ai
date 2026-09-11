from __future__ import annotations

import json
from typing import Any

from server.mcp.hooks import coverage, gap_queries, thread_entities, verify_draft
from server.reason import Turn, parse_hits, plan_from


async def _run(name: str, args: dict[str, Any]) -> str:
    from server.tools import run_tool

    return await run_tool(name, args)


async def resolve_thread(args: dict[str, Any]) -> str:
    from server.mcp.hooks import classify_intent

    message = str(args.get("message") or "")
    raw_hist = args.get("history") or []
    history: list[Turn] = []
    for item in raw_hist:
        if isinstance(item, dict) and item.get("text"):
            history.append(Turn(role=str(item.get("role") or "user"), text=str(item["text"])[:2000]))
    ent = thread_entities(history, message)
    intent = classify_intent(message, history)
    ent["kind"] = intent["kind"]
    ent["intent_follow_up"] = bool(intent["follow_up"])
    ent["topic_shift"] = "yes" if intent["topic_shift"] else ent.get("topic_shift", "no")
    ent["thought_order"] = intent["thought_order"]
    return json.dumps(ent, ensure_ascii=False)


async def followup_search(args: dict[str, Any]) -> str:
    """Search using thread-expanded queries, then optionally read top URL."""
    query = str(args.get("query") or args.get("message") or "").strip()
    if not query:
        return "error: empty query"
    site = args.get("site")
    raw = await _run("web_search", {"query": query, **({"site": site} if site else {})})
    hits = parse_hits(raw)
    pages: list[dict[str, str]] = []
    if hits and args.get("read_top", True):
        url = hits[0].get("url") or ""
        if url.startswith("http"):
            body = await _run("read_url", {"url": url})
            pages.append({"url": url, "excerpt": body[:3000]})
    return json.dumps({"query": query, "hits": hits[:6], "pages": pages}, ensure_ascii=False)


async def gap_search(args: dict[str, Any]) -> str:
    message = str(args.get("message") or "")
    obs = args.get("observations") or []
    pairs: list[tuple[str, str]] = []
    for item in obs:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            pairs.append((str(item[0]), str(item[1])))
    hist = [Turn(role="user", text=message)]
    plan = plan_from(message, hist)
    qs = gap_queries(message, plan, pairs)
    cov = coverage(message, pairs)
    gathered: list[dict[str, Any]] = []
    for q in qs:
        raw = await _run("web_search", {"query": q})
        gathered.append({"query": q, "raw": raw[:4000], "hits": parse_hits(raw)[:5]})
    return json.dumps({"coverage": cov, "extra_queries": qs, "results": gathered}, ensure_ascii=False)


async def verify_claims(args: dict[str, Any]) -> str:
    draft = str(args.get("draft") or args.get("answer") or "")
    obs = args.get("observations") or []
    pairs: list[tuple[str, str]] = []
    for item in obs:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            pairs.append((str(item[0]), str(item[1])))
        elif isinstance(item, dict):
            pairs.append((str(item.get("name") or "obs"), str(item.get("text") or "")))
    report = verify_draft(draft, pairs)
    if not report["ok"] and args.get("search_if_weak", True):
        q = " ".join((report.get("unsupported") or [draft])[:1])[:180]
        extra = await _run("web_search", {"query": q})
        report["extra_search"] = extra[:4000]
        report["extra_hits"] = parse_hits(extra)[:5]
    return json.dumps(report, ensure_ascii=False)


async def final_answer(args: dict[str, Any]) -> str:
    from server.mcp.answer import final_answer as _final

    return await _final(args)


async def consult_knowledge(args: dict[str, Any]) -> str:
    from server.mcp.knowledge import consult

    q = str(args.get("query") or args.get("message") or "")
    hits = consult(q, limit=int(args.get("limit") or 3))
    return json.dumps({"query": q, "packs": hits}, ensure_ascii=False)


async def agent_talk(args: dict[str, Any]) -> str:
    from server.mcp.talk import agent_talk_payload
    from server.reason import Turn, plan_from
    from server.crew.board import Blackboard

    src = str(args.get("from") or args.get("src") or "gap")
    dst = str(args.get("to") or args.get("dst") or "librarian")
    question = str(args.get("question") or args.get("message") or "")
    message = str(args.get("message") or question)
    obs = args.get("observations") or []
    pairs: list[tuple[str, str]] = []
    for item in obs:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            pairs.append((str(item[0]), str(item[1])))
        elif isinstance(item, dict):
            pairs.append((str(item.get("name") or "obs"), str(item.get("text") or "")))
    hist: list[Turn] = []
    for item in args.get("history") or []:
        if isinstance(item, dict) and item.get("text"):
            hist.append(Turn(role=str(item.get("role") or "user"), text=str(item["text"])[:2000]))
    plan = plan_from(message, hist)
    board = Blackboard(goal=message, plan=plan, history=hist, observations=pairs)
    payload = agent_talk_payload(src, dst, question or message, board)
    return json.dumps(payload, ensure_ascii=False)


async def extract_claims(args: dict[str, Any]) -> str:
    import re

    obs = args.get("observations") or []
    blob_parts: list[str] = []
    for item in obs:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            blob_parts.append(str(item[1]))
        elif isinstance(item, dict):
            blob_parts.append(str(item.get("text") or ""))
        elif isinstance(item, str):
            blob_parts.append(item)
    blob = "\n".join(blob_parts)
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", blob) if 40 < len(s.strip()) < 240]
    junk = re.compile(r'"title"\s*:|"snippet"\s*:|URL Source:', re.I)
    claims = [s for s in sents if not junk.search(s) and not s.startswith("{")][:8]
    return json.dumps({"claims": claims}, ensure_ascii=False)


async def compare_sources(args: dict[str, Any]) -> str:
    import re

    obs = args.get("observations") or []
    blob = ""
    for item in obs:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            blob += "\n" + str(item[1])
        elif isinstance(item, dict):
            blob += "\n" + str(item.get("text") or "")
    cs = [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)\s*°C", blob)]
    fs = [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)\s*°F", blob)]
    temps = cs + [(f - 32) * 5 / 9 for f in fs]
    spread = (max(temps) - min(temps)) if len(temps) >= 2 else 0.0
    yes = bool(re.search(r"\byes\b", blob.lower()))
    no = bool(re.search(r"\bno\b|\bunlikely\b", blob.lower()))
    return json.dumps(
        {
            "temps_c": [round(t, 1) for t in temps[:12]],
            "spread_c": round(spread, 1),
            "disagree_numeric": spread > 3,
            "yes_and_no": yes and no,
        },
        ensure_ascii=False,
    )


async def cite_pack(args: dict[str, Any]) -> str:
    import re

    obs = args.get("observations") or []
    urls: list[str] = []
    for item in obs:
        text = ""
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            text = str(item[1])
        elif isinstance(item, dict):
            text = str(item.get("text") or "")
        for u in re.findall(r"https?://[^\s\"'<>]+", text):
            u = u.rstrip(").,]}\\\"'")
            if "jina.ai" in u:
                continue
            if u not in urls:
                urls.append(u)
    return json.dumps({"urls": urls[:8], "count": len(urls[:8])}, ensure_ascii=False)


async def list_learned(args: dict[str, Any]) -> str:
    from server.mcp.learn import list_learned as _list

    return await _list(args)


async def write_skill(args: dict[str, Any]) -> str:
    from server.mcp.learn import write_skill as _write

    return await _write(args)


async def write_knowledge(args: dict[str, Any]) -> str:
    from server.mcp.learn import write_knowledge as _write

    return await _write(args)


async def financial_quote(args: dict[str, Any]) -> str:
    from server.finance import fetch_financial_quote

    symbol = str(args.get("symbol") or args.get("ticker") or args.get("query") or "").strip()
    if not symbol:
        return json.dumps({"error": "symbol is required (e.g. SHOE, AAPL, SHOE:NASDAQ)"})
    source = str(args.get("source") or "all")
    include_after_hours = bool(args.get("include_after_hours", True))
    res = await fetch_financial_quote(symbol, source=source, include_after_hours=include_after_hours)
    return json.dumps(res, ensure_ascii=False)


async def financial_compare(args: dict[str, Any]) -> str:
    from server.finance import compare_financial_quotes

    symbol = str(args.get("symbol") or args.get("ticker") or args.get("query") or "").strip()
    if not symbol:
        return json.dumps({"error": "symbol is required"})
    sources = args.get("sources")
    res = await compare_financial_quotes(symbol, sources=sources)
    return json.dumps(res, ensure_ascii=False)


async def financial_news(args: dict[str, Any]) -> str:
    from server.finance import fetch_financial_news

    symbol = str(args.get("symbol") or args.get("ticker") or args.get("query") or "").strip()
    if not symbol:
        return json.dumps({"error": "symbol or query is required"})
    source = str(args.get("source") or "all")
    res = await fetch_financial_news(symbol, source=source)
    return json.dumps(res, ensure_ascii=False)


MCP_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "final_answer",
            "description": "Write the user-facing final answer from question + observations. Direct prose and code, not JSON dumps.",
            "parameters": {
                "type": "object",
                "properties": {
                    "message": {"type": "string"},
                    "question": {"type": "string"},
                    "draft": {"type": "string"},
                    "observations": {"type": "array"},
                    "history": {"type": "array"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "resolve_thread",
            "description": "Map the current question onto conversation history (place, units, follow-up, intent, topic shift). Call first on follow-ups.",
            "parameters": {
                "type": "object",
                "properties": {
                    "message": {"type": "string"},
                    "history": {"type": "array", "items": {"type": "object"}},
                },
                "required": ["message"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "followup_search",
            "description": "Web search plus optional top-URL read, for in-thread follow-ups.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "site": {"type": "string"},
                    "read_top": {"type": "boolean"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "gap_search",
            "description": "If first-pass evidence is thin, run extra searches using the question + thread.",
            "parameters": {
                "type": "object",
                "properties": {
                    "message": {"type": "string"},
                    "observations": {"type": "array"},
                },
                "required": ["message"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "verify_claims",
            "description": "Check a draft answer against observations; optional corroborating search.",
            "parameters": {
                "type": "object",
                "properties": {
                    "draft": {"type": "string"},
                    "answer": {"type": "string"},
                    "observations": {"type": "array"},
                    "search_if_weak": {"type": "boolean"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "consult_knowledge",
            "description": "Retrieve local MCP playbooks (research, source trust, media literacy, writing forms, argument logic, skill-learning, etc.).",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "message": {"type": "string"},
                    "limit": {"type": "integer"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "agent_talk",
            "description": "Send a question from one specialist to another on the shared blackboard and get a reply.",
            "parameters": {
                "type": "object",
                "properties": {
                    "from": {"type": "string"},
                    "to": {"type": "string"},
                    "src": {"type": "string"},
                    "dst": {"type": "string"},
                    "question": {"type": "string"},
                    "message": {"type": "string"},
                    "observations": {"type": "array"},
                    "history": {"type": "array"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "extract_claims",
            "description": "Pull short factual sentences from observations (skip JSON/SERP junk).",
            "parameters": {
                "type": "object",
                "properties": {"observations": {"type": "array"}},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_sources",
            "description": "Score numeric spread and yes/no disagreement across observations.",
            "parameters": {
                "type": "object",
                "properties": {"observations": {"type": "array"}},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "cite_pack",
            "description": "Deduped citation URLs from observations, dropping jina wrappers.",
            "parameters": {
                "type": "object",
                "properties": {"observations": {"type": "array"}},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_learned",
            "description": "List installed MCP skills and knowledge packs (self-learning inventory).",
            "parameters": {
                "type": "object",
                "properties": {
                    "kind": {
                        "type": "string",
                        "description": "all | skills | knowledge",
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_skill",
            "description": "Install or update a skill under server/mcp/skills/<name>/SKILL.md. Use after researching a method from the web. Does not train a model.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "body": {"type": "string"},
                    "hooks": {"type": "array", "items": {"type": "string"}},
                    "tools": {"type": "array", "items": {"type": "string"}},
                    "phase": {"type": "string"},
                    "priority": {"type": "integer"},
                    "sources": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["name", "description", "body"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_knowledge",
            "description": "Install or update a knowledge playbook under server/mcp/knowledge/<name>.md. Use after synthesizing trusted sources.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "body": {"type": "string"},
                    "topics": {"type": "array", "items": {"type": "string"}},
                    "sources": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["name", "body"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "financial_quote",
            "description": "Fetch real-time, closing, and extended-hours (pre-market, after-hours) stock quotes and tape across Google Finance, Nasdaq, Yahoo Finance, and MarketWatch.",
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol": {
                        "type": "string",
                        "description": "Stock ticker or symbol, e.g. 'SHOE', 'AAPL', 'SHOE:NASDAQ', or 'TSLA'.",
                    },
                    "source": {
                        "type": "string",
                        "description": "Financial source to query: 'all', 'google', 'nasdaq', 'yahoo', or 'marketwatch'. Default is 'all'.",
                    },
                    "include_after_hours": {
                        "type": "boolean",
                        "description": "Whether to include after-hours and pre-market extended trading data. Defaults to true.",
                    },
                },
                "required": ["symbol"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "financial_compare",
            "description": "Cross-check and compare quotes, after-hours prints, volume, and timestamps across Google Finance, Nasdaq, Yahoo Finance, and MarketWatch to reconcile differences and detect discrepancies.",
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol": {
                        "type": "string",
                        "description": "Stock ticker or symbol, e.g. 'SHOE', 'AAPL', or 'SHOE:NASDAQ'.",
                    },
                    "sources": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of sources to compare. Defaults to all four platforms.",
                    },
                },
                "required": ["symbol"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "financial_news",
            "description": "Fetch financial news headlines, analyst commentary, and earnings reports from MarketWatch, Google Finance, and Yahoo Finance.",
            "parameters": {
                "type": "object",
                "properties": {
                    "symbol": {
                        "type": "string",
                        "description": "Stock ticker, symbol, or company name to retrieve news for.",
                    },
                    "source": {
                        "type": "string",
                        "description": "Financial news source: 'all', 'marketwatch', or 'google'. Defaults to 'all'.",
                    },
                },
                "required": ["symbol"],
            },
        },
    },
]
