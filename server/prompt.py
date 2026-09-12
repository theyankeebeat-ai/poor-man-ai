"""On-demand skills, compressed history, short tool observations."""

from __future__ import annotations

import json
import re
from typing import Any

from server.mcp.knowledge import consult, knowledge_prompt
from server.mcp.skills import load_skills
from server.reason import Turn
from server.retrieve import snippets

ALWAYS_SKILLS = frozenset({"think-first", "cite-sources", "thread-context", "control-logic", "multilingual-grammar", "conversational-chat"})

SYSTEM_CORE = """You are an intelligent agent and companion. Plan once, then tools, then compose.
1. Understand the thread (place/units/pronouns/language/sentiment).
2. Auto-recognize user language: Automatically detect the user's language from their input (whether text or voice transcript). Always formulate and compose your response in the exact same language detected (or explicitly requested), with flawless, native grammar, orthography, and natural phrasing (across English, French, Russian, Spanish, German, Italian, Portuguese, Chinese, Japanese, Korean, Arabic, Hindi, Turkish, Dutch, Polish, Swedish, Ukrainian, and more).
3. Natural, engaging conversation: converse normally and empathetically about any topic with anyone, providing thoughtful, warm, and articulate dialogue.
4. Smallest tool set. Cite URLs when researching. Prefer official docs.
5. Call final_answer with prose, not JSON/SERP dumps.
6. memory_write useful facts. Do not invent tool results.
Memory is append-only JSONL — never claim to train a model.
"""


def skill_prompt_for(mode: str, message: str, max_chars: int = 1800) -> str:
    want = set(ALWAYS_SKILLS)
    m = (mode or "").lower()
    if m == "research":
        want |= {"gap-search", "knowledge-first", "compare-evidence"}
    if m == "code":
        want = {"code-agent", "think-first"}
        msg_l = (message or "").lower()
        if any(
            k in msg_l
            for k in ("lint", "eslint", "yarn lint", "npm run lint", "fix lint", "tsc --noemit")
        ):
            want.add("lint-fix")
        # code-agent first — never drop it for budget; trim others instead.
        by_name = {s.name: s for s in load_skills() if s.name in want}
        order = ["code-agent", "lint-fix", "think-first"]
        parts: list[str] = []
        budget = max_chars + 2200
        for name in order:
            s = by_name.get(name)
            if not s:
                continue
            block = f"### {s.name}\n{s.description}\n{s.body}\n"
            used = sum(len(p) for p in parts)
            if name != "code-agent" and used + len(block) > budget:
                if name == "lint-fix":
                    block = f"### {s.name}\n{s.description}\n"
                else:
                    continue
            parts.append(block)
        # Teach coding/CLI via knowledge packs (coding-cli, howto-code, …).
        packs = consult(f"code cli powershell {message}", limit=2)
        if packs:
            play = "\n".join(
                f"### {p['name']}\n{p['excerpt'][:700]}" for p in packs
            )
            parts.append("Coding playbook:\n" + play[:1400])
        if parts:
            return "\n".join(parts)
    if m == "howto":
        want |= {"knowledge-first"}
    if m in {"research", "howto", "weather"}:
        want |= {"cite-sources", "verify-answer"}
    parts: list[str] = []
    n = 0
    for s in load_skills():
        if s.name not in want and not any(t in (message or "").lower() for t in s.name.split("-")):
            continue
        block = f"### {s.name}\n{s.description}\n"
        if n + len(block) > max_chars:
            break
        parts.append(block)
        n += len(block)
    packs = consult(f"{mode} {message}", limit=2)
    if packs and m in {"research", "howto"}:
        extra = knowledge_prompt(500)
        if extra:
            parts.append("Playbook excerpt:\n" + extra[:500])
    return "\n".join(parts)


def compress_history(turns: list[Turn], keep: int = 6) -> list[Turn]:
    if len(turns) <= keep:
        return turns
    older = turns[:-keep]
    blob = " ".join(t.text[:200] for t in older if t.role == "user")
    summary = Turn(role="user", text=f"[Earlier thread summary] {blob[:400]}")
    return [summary, *turns[-keep:]]


def digest_obs(name: str, text: str, limit: int = 700) -> str:
    if name in {"run_cmd", "read_file", "grep", "git_diff", "git_status", "list_dir"}:
        limit = max(limit, 2500)
    raw = text or ""
    if name in {"web_search", "followup_search", "gap_search"}:
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                lines = []
                for item in data[:6]:
                    if not isinstance(item, dict):
                        continue
                    title = str(item.get("title") or "")[:80]
                    url = str(item.get("url") or "")
                    snip = str(item.get("snippet") or "")[:160]
                    lines.append(f"- {title} | {url} | {snip}")
                return "\n".join(lines)[:limit]
        except json.JSONDecodeError:
            pass
    if name in {"financial_quote", "financial_compare"}:
        try:
            d = json.loads(raw)
            sym = d.get("symbol")
            cons = d.get("consensus") or {}
            c_name = cons.get("company_name") or sym
            reg_p = cons.get("regular_market_consensus_price")
            ah_p = cons.get("after_hours_consensus_price")
            lines = [f"**{c_name} ({sym}) Quote & Tape:**"]
            if reg_p is not None:
                lines.append(f"- **Regular Session Consensus Close**: ${reg_p}")
            if ah_p is not None:
                lines.append(f"- **After-Hours Consensus Price**: ${ah_p}")
            srcs = d.get("sources") or {}
            for sname, sdata in srcs.items():
                if isinstance(sdata, dict) and not sdata.get("error"):
                    rm = sdata.get("regular_market") or {}
                    ah = sdata.get("after_hours") or {}
                    p_txt = rm.get("price")
                    chg_txt = rm.get("change_percent") or rm.get("change") or ""
                    ah_txt = ah.get("price") if ah else None
                    ah_time = ah.get("timestamp") if ah else ""
                    detail = f"- {sname.title()}: Close {p_txt} ({chg_txt})"
                    if ah_txt:
                        detail += f" | After-Hours: {ah_txt} ({ah_time})"
                    lines.append(detail)
            return "\n".join(lines)
        except Exception:
            pass
    if name == "read_url":
        body = re.sub(r"\s+", " ", raw)[:limit]
        return body
    if len(raw) <= limit:
        return raw
    return raw[:limit] + "…"


def memory_block(message: str, limit: int = 6) -> str:
    return snippets(message, limit=max(0, int(limit)))


def build_system(mode: str, message: str, extras: str = "", memory_limit: int = 6) -> str:
    mem = memory_block(message, limit=memory_limit)
    skills = skill_prompt_for(mode, message)
    parts = [SYSTEM_CORE, "Active skills:\n" + skills]
    if mem:
        parts.append(mem)
    if extras:
        parts.append(extras)
    return "\n".join(parts)
