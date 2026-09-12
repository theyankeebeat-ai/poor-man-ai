from __future__ import annotations

import json
import re
import time
from collections.abc import AsyncIterator
from typing import Any

from server.cache import get as cache_get
from server.cache import put as cache_put
from server.cache import stats as cache_stats
from server.crew.orchestra import run_crew
from server.local_brain import SIMPLE_PKG_RE, plan_text
from server.mcp.hooks import HookCtx, coverage, run_hooks
from server.parallel import run_many
from server.architecture import intelligence_prompt_extras, resolve_intelligence
from server.prompt import build_system, compress_history, digest_obs
from server.reason import Plan, Turn, plan_from
from server.research import gather
from server.router import route
from server.tools import RUNNERS, chat_model, openai_client, plan_model, run_tool, tools_for_mode
from server.workspace import path_from_message, set_workspace, workspace_root

_BAD_CACHE = re.compile(
    r"(?i)can'?t run commands|cannot run commands|i (?:can'?t|cannot) (?:run|execute) "
    r"(?:commands|shell|terminal)|run it locally|"
    r"no captions|caption fetch failed|must paste transcript|paste a transcript|"
    r"couldn'?t summarize|could not summarize|can'?t give an accurate summary|"
    r"without captions|no usable transcript|don'?t have a transcript|"
    r"could not access captions|type object 'YouTubeTranscriptApi'|"
    r"blocked the fetch|couldn'?t pull live|could not pull live|"
    # Tool / function-call dumps must never be user-facing or cached for TTS.
    r"^final_answer\s*:|"
    r'^\s*\{\s*"(?:question|message|draft|answer|text)"\s*:'
)


def unwrap_answer_payload(text: str) -> str:
    """If a tool dump or JSON envelope leaked into the answer, extract the prose."""
    raw = (text or "").strip()
    if not raw:
        return raw

    candidates: list[str] = [raw]
    m = re.match(r"(?is)^(?:final_answer|answer)\s*:\s*(\{.*\})\s*$", raw)
    if m:
        candidates.insert(0, m.group(1).strip())

    for cand in candidates:
        if not (cand.startswith("{") and cand.endswith("}")):
            continue
        try:
            data = json.loads(cand)
        except json.JSONDecodeError:
            # Cached answers sometimes keep JSON unicode-escape form.
            try:
                data = json.loads(cand.encode("utf-8").decode("unicode_escape"))
            except Exception:
                continue
        if not isinstance(data, dict):
            continue
        for key in ("message", "draft", "answer", "text", "content"):
            val = data.get(key)
            if isinstance(val, str) and len(val.strip()) >= 8:
                return val.strip()
    return raw

# create-vite / npm install exit 0 must NOT count as "done" — require a real verify.
_VERIFY_CMD = re.compile(
    r"(?:npm\s+run\s+(?:build|lint)|yarn\s+(?:run\s+)?(?:build|lint)|"
    r"pnpm\s+(?:run\s+)?(?:build|lint)|"
    r"tsc(?:\s|$)|eslint(?:\s|$)|pytest|vitest|npm\s+test|yarn\s+test|pnpm\s+test|"
    r"python\s+-m\s+pytest|cargo\s+test|go\s+test|dotnet\s+test)",
    re.I,
)

_LINT_CMD = re.compile(
    r"(?:yarn\s+(?:run\s+)?lint|npm\s+run\s+lint|pnpm\s+(?:run\s+)?lint|eslint(?:\s|$))",
    re.I,
)

_WANTS_LINT = re.compile(
    r"\b(yarn\s+lint|npm\s+run\s+lint|pnpm\s+lint|eslint|"
    r"lint(?:\s+(?:fix|error|issue|problem|the\s+(?:project|code|app)))?|"
    r"fix\s+(?:lint|eslint|typescript)|lint\s+and\s+fix)\b",
    re.I,
)


def _run_cmd_payload(text: str) -> dict[str, Any]:
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _path_from_message(message: str) -> str | None:
    return path_from_message(message, create=True)


def _simple_pkg_cmd(message: str) -> tuple[str, str] | None:
    """Return (package_manager, cmd) for a bare install/ci request, else None."""
    m = SIMPLE_PKG_RE.search(message or "")
    if not m:
        return None
    pm = m.group("pm").lower()
    sub = m.group("sub").lower()
    if pm == "npm" and sub == "i":
        sub = "install"
    if pm == "pnpm" and sub == "i":
        sub = "install"
    # Reject if the user asked for more than install (e.g. install && build).
    tail = (message or "")[m.end() :]
    if re.search(r"\b(and|then|&&|;)\b.{0,40}\b(build|dev|start|test|lint)\b", tail, re.I):
        return None
    return pm, f"{pm} {sub}"


async def _run_simple_pkg_install(message: str, t0: float) -> AsyncIterator[str]:
    """Execute yarn/npm/pnpm install without an LLM — this agent can run shell cmds."""
    parsed = _simple_pkg_cmd(message)
    if not parsed:
        return
    pm, cmd = parsed
    path = _path_from_message(message)
    yield _sse(
        {
            "type": "plan",
            "text": f"Local code path: run `{cmd}` in the workspace (no web howto).",
        }
    )
    if path:
        from pathlib import Path

        p = Path(path)
        p.mkdir(parents=True, exist_ok=True)
        try:
            set_workspace(p)
        except ValueError as e:
            err = f"Error: bad workspace `{path}`: {e}"
            yield _sse({"type": "error", "text": err})
            yield _sse({"type": "done", "text": err})
            return
    root = workspace_root()
    pkg = root / "package.json"
    if not pkg.is_file():
        answer = (
            f"Workspace `{root}` has no `package.json`, so `{cmd}` cannot succeed yet.\n\n"
            f"Add a Node project first (or ask me in **code** mode to scaffold one), then retry `{cmd}`."
        )
        yield _sse({"type": "tool", "name": "workspace_info", "args": {"path": str(root)}})
        yield _sse(
            {
                "type": "observation",
                "name": "workspace_info",
                "text": json.dumps({"root": str(root), "has_package_json": False}),
            }
        )
        for i in range(0, len(answer), 48):
            yield _sse({"type": "token", "text": answer[i : i + 48]})
        yield _sse({"type": "done", "text": answer})
        yield _sse(
            _metrics(n_llm_calls=0, n_tools=0, t_ms=int((time.perf_counter() - t0) * 1000), cache=cache_stats())
        )
        return

    yield _sse({"type": "tool", "name": "run_cmd", "args": {"cmd": cmd, "cwd": str(root)}})
    obs = await run_tool("run_cmd", {"cmd": cmd, "timeout_sec": 180})
    yield _sse({"type": "observation", "name": "run_cmd", "text": obs[:3500]})
    data = _run_cmd_payload(obs)
    code = data.get("exit", -1)
    stdout = str(data.get("stdout") or "").strip()
    stderr = str(data.get("stderr") or data.get("error") or "").strip()
    ok = code == 0
    answer = (
        f"**`{cmd}`** in `{root}` — exit **{code}** ({'ok' if ok else 'failed'}).\n\n"
    )
    if stdout:
        answer += f"```\n{stdout[-2500:]}\n```\n"
    if stderr:
        answer += f"stderr:\n```\n{stderr[-1500:]}\n```\n"
    if not ok and not pkg.is_file():
        answer += "\nNo `package.json` in this folder."
    for i in range(0, len(answer), 48):
        yield _sse({"type": "token", "text": answer[i : i + 48]})
    yield _sse({"type": "done", "text": answer})
    yield _sse(
        _metrics(n_llm_calls=0, n_tools=1, t_ms=int((time.perf_counter() - t0) * 1000), cache=cache_stats())
    )


def _code_verify_passed(observations: list[tuple[str, str]]) -> bool:
    for name, text in observations:
        if name != "run_cmd":
            continue
        if '"exit": 0' not in text and '"exit":0' not in text:
            continue
        data = _run_cmd_payload(text)
        cmd = str(data.get("cmd") or text)
        if _VERIFY_CMD.search(cmd):
            return True
    return False


def _last_lint_exit(observations: list[tuple[str, str]]) -> int | None:
    """Exit code of the most recent lint/eslint run_cmd, if any."""
    last: int | None = None
    for name, text in observations:
        if name != "run_cmd":
            continue
        data = _run_cmd_payload(text)
        cmd = str(data.get("cmd") or "")
        if not _LINT_CMD.search(cmd):
            continue
        exit_code = data.get("exit")
        if exit_code is None:
            # Summaries like "Lint `yarn lint` exit=1" from auto-lint.
            m = re.search(r"exit\s*=\s*(-?\d+)", text or "", re.I)
            if m:
                last = int(m.group(1))
            continue
        try:
            last = int(exit_code)
        except (TypeError, ValueError):
            continue
    return last


def _lint_failed(observations: list[tuple[str, str]]) -> bool:
    exit_code = _last_lint_exit(observations)
    return exit_code is not None and exit_code != 0


def _wants_lint_fix(message: str) -> bool:
    return bool(_WANTS_LINT.search(message or ""))


def _detect_lint_cmd(workspace_info_json: str) -> str | None:
    """Pick yarn lint / npm run lint / pnpm lint from workspace hints."""
    try:
        info = json.loads(workspace_info_json)
    except json.JSONDecodeError:
        info = {}
    hints = info.get("language_hints") if isinstance(info, dict) else None
    if not isinstance(hints, list) or "package.json" not in hints:
        return None
    scripts = info.get("scripts") if isinstance(info, dict) else None
    has_lint = True
    if isinstance(scripts, dict):
        has_lint = "lint" in scripts
    if not has_lint:
        return None
    lock = str(info.get("package_manager") or "")
    if lock == "yarn" or "yarn.lock" in hints:
        return "yarn lint"
    if lock == "pnpm" or "pnpm-lock.yaml" in hints:
        return "pnpm lint"
    return "npm run lint"


def _summarize_lint_obs(text: str) -> str:
    data = _run_cmd_payload(text)
    if not data:
        return (text or "")[:1200]
    exit_code = data.get("exit")
    cmd = data.get("cmd") or "lint"
    out = (data.get("stdout") or "") + "\n" + (data.get("stderr") or "")
    lines = [ln for ln in out.splitlines() if ln.strip()]
    # Prefer file:line style and summary lines; drop empty noise.
    interesting = [
        ln
        for ln in lines
        if re.search(r"error|warning|✖|✓|problem|eslint|TS\d+", ln, re.I)
        or re.search(r"\.\w+:\d+", ln)
    ]
    pick = interesting[-40:] if interesting else lines[-30:]
    body = "\n".join(pick)[:2200]
    return f"Lint `{cmd}` exit={exit_code}\n{body}"

SYSTEM = """You are a general research agent. Follow this thought order and do not skip it:
1. Understand — bind pronouns/place/units to the thread (resolve_thread on follow-ups).
2. Plan once — smallest tool set. Prefer official docs (github, Codelabs, Kaggle, grokipedia, Microsoft Learn).
3. Gather — structured APIs, then web_search, then read_url. Cite URLs. For media: read_image / youtube_summarize / local_video_summarize.
4. Fill gaps — if coverage is thin, gap_search or followup_search. Then stop searching.
5. Debate — specialists talk via agent_talk (gap↔librarian, skeptic↔facts, numbers↔units). Compare/contrast with shared criteria; stay impartial.
6. Compose — call final_answer so the user sees prose/code, not JSON or SERP dumps. Match writing form when asked (essay, editorial, podcast, documentary, journal).
7. Verify — verify_claims against observations; qualify unsupported lines. Never hallucinate citations or media content.
8. Stop — memory_write useful facts. Do not invent tool results. No login walls.
For stock tickers, equity quotes, after-hours tapes, and pre-market prices: call financial_quote or financial_compare (connects to Google Finance, Nasdaq, Yahoo Finance, and MarketWatch).
Use consult_knowledge for playbooks (including media-literacy, summarize-method, writing-forms, argument-logic, epistemic-virtues, skill-learning, financial-markets).
When the user asks you to learn a method from the internet: list_learned → research → write_skill and/or write_knowledge → memory_write receipt. That is how you self-improve; you do not train model weights.
Use extract_claims / compare_sources / cite_pack before publishing.
Memory is append-only JSONL — never claim to train a foundation model.
"""


def _sse(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False) + "\n"


def _history(raw: list[dict[str, Any]] | None) -> list[Turn]:
    out: list[Turn] = []
    for item in raw or []:
        role = str(item.get("role") or "")
        text = str(item.get("text") or "")
        if role in {"user", "assistant"} and text:
            out.append(Turn(role=role, text=text[:2000]))
    return compress_history(out[-16:], keep=6)


def _metrics(**kw: Any) -> dict[str, Any]:
    return {"type": "plan", "text": "latency " + json.dumps(kw, default=str)}


async def run_web_only_agent(
    message: str,
    max_steps: int = 8,
    history: list[Turn] | None = None,
    thought: dict[str, Any] | None = None,
) -> AsyncIterator[str]:
    t0 = time.perf_counter()
    turns = history or []
    plan: Plan = plan_from(message, turns)
    thought = thought or route(message, turns)
    cap = min(max_steps, int(thought.get("max_steps") or max_steps))
    yield _sse({"type": "plan", "text": plan_text(thought, plan.goal, plan.notes, plan.search_queries)})
    yield _sse({"type": "plan", "text": f"max_steps={cap} mode={thought.get('mode')}"})

    cheap = thought.get("cheap_text")
    if cheap is not None:
        yield _sse(
            {
                "type": "tool",
                "name": f"brain:{thought.get('handler')}",
                "args": {"mode": thought.get("mode"), "cheap": True},
            }
        )
        yield _sse(
            {
                "type": "observation",
                "name": f"brain:{thought.get('handler')}",
                "text": f"One brain, handler={thought.get('handler')}. Skipped web and crew.",
            }
        )
        for i in range(0, len(cheap), 48):
            yield _sse({"type": "token", "text": cheap[i : i + 48]})
        yield _sse({"type": "done", "text": cheap})
        yield _sse(_metrics(n_llm_calls=0, n_tools=0, t_ms=int((time.perf_counter() - t0) * 1000), cache=cache_stats()))
        return

    observations: list[tuple[str, str]] = []
    if thought.get("follow_up") == "yes":
        yield _sse({"type": "tool", "name": "memory_search", "args": {"query": message}})
        mem = await run_tool("memory_search", {"query": message})
        yield _sse({"type": "observation", "name": "memory_search", "text": mem[:2000]})
        observations.append(("memory_search", mem[:2000]))

    if thought.get("mode") in {"research", "howto", "media"}:
        yield _sse({"type": "tool", "name": "consult_knowledge", "args": {"query": message}})
        from server.mcp.knowledge import consult

        packs = consult(message, limit=3)
        kobs = json.dumps({"packs": packs}, ensure_ascii=False)
        yield _sse({"type": "observation", "name": "consult_knowledge", "text": kobs[:2000]})
        observations.append(("consult_knowledge", kobs[:2000]))

    async for item in gather(plan, max_steps=cap, history=turns):
        if isinstance(item, str):
            yield item
        else:
            observations.append(item)

    answer = ""
    allow = set(thought.get("crew_allow") or []) if thought.get("needs_crew") else set()
    if thought.get("needs_crew"):
        async for item in run_crew(message, plan, turns, observations, allow=allow or None):
            if isinstance(item, str) and item.startswith("{"):
                yield item
            else:
                answer = str(item)
    else:
        # compose from last observations without full crew
        answer = next((t for n, t in reversed(observations) if n == "final_answer"), "")
        if not answer:
            bits = [digest_obs(n, t) for n, t in observations[-4:]]
            answer = "\n\n".join(bits) or "No evidence gathered."

    if answer and not answer.lstrip().lower().startswith(("{", "error:", "timeout")):
        yield _sse({"type": "tool", "name": "memory_write", "args": {"fact": answer[:500]}})
        mem = await run_tool("memory_write", {"fact": answer[:500]})
        yield _sse({"type": "observation", "name": "memory_write", "text": mem[:2000]})
    for i in range(0, len(answer), 48):
        yield _sse({"type": "token", "text": answer[i : i + 48]})
    yield _sse({"type": "done", "text": answer})
    yield _sse(_metrics(n_llm_calls=0, n_tools=len(observations), t_ms=int((time.perf_counter() - t0) * 1000), cache=cache_stats()))


async def run_agent(
    message: str,
    max_steps: int = 8,
    history: list[dict[str, Any]] | None = None,
    mode_override: str | None = None,
    thinking_level: str | None = "medium",
    intelligence: dict[str, Any] | None = None,
) -> AsyncIterator[str]:
    t0 = time.perf_counter()
    t_first_plan = 0
    t_first_token = 0
    n_llm = 0
    n_tools = 0
    t_tools = 0.0

    # Re-bind workspace inside the agent task (message path wins over sticky/UI).
    path = _path_from_message(message)
    if path:
        try:
            set_workspace(path)
        except ValueError:
            pass

    turns = _history(history)
    thought = route(message, turns)
    if mode_override:
        thought["mode"] = mode_override
        if mode_override == "code":
            thought["needs_crew"] = False
            thought["skip_grok"] = False
            thought["cheap_text"] = None
            thought["max_steps"] = max(int(thought.get("max_steps") or 0), 16)
    # Bare "run yarn/npm install" — execute locally; skip Grok howto / poison cache.
    if _simple_pkg_cmd(message):
        thought["mode"] = "code"
        thought["needs_crew"] = False
        async for line in _run_simple_pkg_install(message, t0):
            yield line
        return
    cap = min(max(int(max_steps), 0), 32)
    t_level = (thinking_level or "medium").lower()
    hp = resolve_intelligence(t_level, intelligence)
    if not hp.use_crew:
        thought["needs_crew"] = False
    if t_level == "low":
        cap = min(cap, 5)
    elif t_level == "high":
        cap = max(cap, 16)

    if thought.get("mode") == "code":
        # Lint→search→fix loops need more tool turns than a single patch.
        floor = 18 if _wants_lint_fix(message) else 12
        cap = min(max(cap, floor), 24 if _wants_lint_fix(message) else 20)
    else:
        cap = min(cap, int(thought.get("max_steps") if thought.get("max_steps") is not None else cap))

    replay_key = "answer"
    replay_parts = (message, *(t.text[:200] for t in turns[-2:]))
    # Never replay cache over a cheap local answer (math / folder peek / howto templates).
    hit = None
    if thought.get("mode") != "code" and not thought.get("skip_grok") and thought.get("cheap_text") is None:
        hit = cache_get(replay_key, *replay_parts)
    if isinstance(hit, str) and hit.strip():
        hit = unwrap_answer_payload(hit)
        if hit.strip() and not _BAD_CACHE.search(hit):
            yield _sse({"type": "plan", "text": "cache hit — replay prior answer"})
            for i in range(0, len(hit), 48):
                yield _sse({"type": "token", "text": hit[i : i + 48]})
            yield _sse({"type": "done", "text": hit})
            return

    client = openai_client()
    if thought.get("mode") == "code" and not client:
        yield _sse(
            {
                "type": "error",
                "text": "code mode needs Grok: set XAI_API_KEY or log in with official grok CLI (~/.grok/auth.json).",
            }
        )
        return
    if not client or thought.get("skip_grok"):
        async for line in run_web_only_agent(message, max_steps=max(cap, 1) if not thought.get("skip_grok") else 1, history=turns, thought=thought):
            yield line
        return

    hctx = run_hooks(HookCtx(event="on_user_message", message=message, history=turns))
    thread = hctx.extras.get("thread") or {}
    intent = hctx.extras.get("intent") or {}
    mode = str(thought.get("mode") or "research")
    active_tools = tools_for_mode(mode)
    extras = (
        f"This turn: kind={intent.get('kind')}, mode={mode}, max_steps={cap}, "
        f"follow_up={thread.get('follow_up')}, place={thread.get('location') or 'none'}, "
        f"units={thread.get('units')}. "
        + intelligence_prompt_extras(hp)
    )
    sys = build_system(mode, message, extras, memory_limit=hp.memory_snippets)
    messages: list[dict[str, Any]] = [{"role": "system", "content": sys}]
    for t in turns:
        messages.append({"role": t.role, "content": t.text})
    messages.append({"role": "user", "content": message})
    writer = chat_model()
    planner = plan_model()
    final_text = ""
    observations: list[tuple[str, str]] = []
    planned = False

    if mode == "code":
        yield _sse({"type": "tool", "name": "workspace_info", "args": {}})
        info = await run_tool("workspace_info", {})
        yield _sse({"type": "observation", "name": "workspace_info", "text": info[:2000]})
        observations.append(("workspace_info", info[:2000]))
        messages.append({"role": "assistant", "content": f"workspace_info: {info[:1500]}"})
        yield _sse({"type": "tool", "name": "memory_search", "args": {"query": message}})
        mem = await run_tool("memory_search", {"query": f"{message} workspace"})
        yield _sse({"type": "observation", "name": "memory_search", "text": mem[:2000]})
        observations.append(("memory_search", mem[:2000]))
        try:
            agents_md = await run_tool("read_file", {"path": "AGENTS.md", "start": 1, "end": 80})
            if not str(agents_md).startswith("error") and "not found" not in str(agents_md).lower():
                yield _sse({"type": "tool", "name": "read_file", "args": {"path": "AGENTS.md"}})
                yield _sse({"type": "observation", "name": "read_file", "text": agents_md[:2000]})
                observations.append(("read_file", agents_md[:2000]))
        except Exception:
            pass
        # Auto-run project lint so problems show in chat before the model plans fixes.
        lint_cmd = _detect_lint_cmd(info) if _wants_lint_fix(message) else None
        if lint_cmd:
            yield _sse(
                {
                    "type": "plan",
                    "text": f"Auto-lint: running `{lint_cmd}` across the workspace, then report → search → plan → fix.",
                }
            )
            yield _sse({"type": "tool", "name": "run_cmd", "args": {"cmd": lint_cmd, "timeout_sec": 120}})
            lint_obs = await run_tool("run_cmd", {"cmd": lint_cmd, "timeout_sec": 120})
            n_tools += 1
            summary = _summarize_lint_obs(lint_obs)
            # Keep JSON in observations for verify helpers; show a readable report in chat.
            stored = lint_obs[:3500]
            yield _sse({"type": "observation", "name": "run_cmd", "text": summary[:3500]})
            observations.append(("run_cmd", stored))
            messages.append({"role": "assistant", "content": f"Auto lint result:\n{summary[:2500]}"})
            yield _sse({"type": "plan", "text": summary[:1800]})
            if _lint_failed(observations):
                yield _sse(
                    {
                        "type": "plan",
                        "text": "Lint failed. Next: list each error, web_search the exact rule/message, plan smallest patches, apply_patch, re-run lint until exit 0.",
                    }
                )
            else:
                yield _sse({"type": "plan", "text": "Lint passed (exit 0). Summarize clean status in final_answer unless the user asked for more."})

    try:
        for step in range(max(cap, 1)):
            if not planned:
                think = client.chat.completions.create(
                    model=planner,
                    messages=messages
                    + [
                        {
                            "role": "system",
                            "content": (
                                "Write a JSON plan only: "
                                '{"goal":"...","tools":[{"name":"...","q":"...","url":"..."}],'
                                f'"need_second_think":false}}. Max {hp.max_plan_tools} tools. No prose.'
                            ),
                        }
                    ],
                    temperature=hp.planner_temperature,
                    max_tokens=256,
                )
                n_llm += 1
                plan = (think.choices[0].message.content or "").strip()
                planned = True
                t_first_plan = int((time.perf_counter() - t0) * 1000)
                yield _sse({"type": "plan", "text": plan})
                yield _sse({"type": "plan", "text": f"max_steps={cap} mode={mode}"})
                messages.append({"role": "assistant", "content": f"Plan: {plan}"})

            nudge = ""
            from server.neurons import rank as neuron_rank

            tool_names = [t.get("function", {}).get("name", "") for t in active_tools if isinstance(t, dict)]
            top_tools = [n for n, s in neuron_rank("tools", message, [x for x in tool_names if x])[:5] if n]
            if top_tools:
                nudge = (nudge + " Prefer tools: " + ", ".join(top_tools) + ".").strip()
            if mode == "code":
                names = [n for n, _ in observations]
                if "final_answer" not in names and _code_verify_passed(observations) and not _lint_failed(observations):
                    nudge = "Verify check passed. Call final_answer summarizing files changed and lint/build status."
                elif "final_answer" not in names and _lint_failed(observations):
                    researched = "web_search" in names or "read_url" in names
                    patched = "apply_patch" in names or "write_file" in names
                    if not researched:
                        nudge = (
                            "Lint failed. Report the errors in chat, then web_search the exact "
                            "ESLint/TS rule or error string (+ library version). read_url official docs. "
                            "Then plan and apply_patch the smallest fixes. Re-run yarn/npm lint until exit 0."
                        )
                    elif not patched:
                        nudge = (
                            "You have lint errors and search hits. Plan concrete file:line fixes, "
                            "read_file those spots, apply_patch, then re-run the same lint command."
                        )
                    else:
                        nudge = (
                            "After patches, re-run yarn lint / npm run lint. Do not final_answer "
                            "until lint (or another VERIFY command) exits 0."
                        )
                elif "final_answer" not in names:
                    want_research = bool(
                        re.search(
                            r"\b(web_search|search the web|look up|research|best practices|docs)\b",
                            message,
                            re.I,
                        )
                    ) or _wants_lint_fix(message)
                    researched = "web_search" in names or "read_url" in names
                    if want_research and not researched and _wants_lint_fix(message) and not any(
                        n == "run_cmd" for n, _ in observations
                    ):
                        nudge = (
                            "Lint/fix request: run yarn lint (or npm run lint) first if not already "
                            "run, report problems, then web_search exact errors before writing fixes."
                        )
                    elif want_research and not researched:
                        nudge = (
                            "User asked for research first. Call web_search and/or read_url "
                            "before scaffolding or writing app files."
                        )
                    else:
                        nudge = (
                            "Code loop: research if asked → read/grep → apply_patch/write_file → "
                            "run_cmd. Do not final_answer until a VERIFY command exits 0 "
                            "(yarn lint / npm run lint / npm run build / tsc / pytest / vitest) — "
                            "create-vite and npm install alone do not count."
                        )
            elif observations:
                cov = coverage(message, observations)
                names = [n for n, _ in observations]
                if cov < hp.coverage_threshold and "gap_search" not in names and step < cap - 1:
                    nudge = "Coverage is thin. Call gap_search once, then final_answer."
                elif hp.consensus_search and "compare_sources" not in names and "gap_search" not in names and step < cap - 2:
                    nudge = "Consensus mode: call compare_sources or gap_search to cross-check, then final_answer."
                elif "final_answer" not in names:
                    nudge = "You have evidence. Call final_answer, then stop. Do not dump JSON."
                else:
                    nudge = "final_answer already ran. Stop tools and do not rewrite the plan."

            try:
                act = client.chat.completions.create(
                    model=planner if step == 0 else writer,
                    messages=messages + ([{"role": "system", "content": nudge}] if nudge else []),
                    tools=active_tools,
                    tool_choice="auto",
                    temperature=hp.writer_temperature if step else hp.planner_temperature,
                    max_tokens=min(hp.max_new_tokens, 1024 if step == 0 else hp.max_new_tokens),
                )
            except Exception as e:
                err_str = str(e)
                if mode != "code" and step == 0 and any(
                    tok in err_str.lower()
                    for tok in ("401", "403", "unauthenticated", "bad-credentials", "invalid_api_key", "unauthorized")
                ):
                    yield _sse({"type": "plan", "text": "LLM credentials unavailable — falling back to autonomous local/web orchestrator."})
                    async for line in run_web_only_agent(message, max_steps=max(cap, 1), history=turns, thought=thought):
                        yield line
                    return
                raise
            n_llm += 1
            msg = act.choices[0].message
            tool_calls = msg.tool_calls or []

            if not tool_calls:
                text = unwrap_answer_payload(msg.content or "")
                if not t_first_token:
                    t_first_token = int((time.perf_counter() - t0) * 1000)
                for i in range(0, len(text), 48):
                    yield _sse({"type": "token", "text": text[i : i + 48]})
                yield _sse({"type": "done", "text": text})
                if text and not _BAD_CACHE.search(text):
                    cache_put("answer", text, *replay_parts)
                yield _sse(_metrics(t_first_plan_ms=t_first_plan, n_llm_calls=n_llm, n_tools=n_tools, t_tools_ms=int(t_tools * 1000), t_first_token_ms=t_first_token, cache=cache_stats()))
                return

            assistant_msg: dict[str, Any] = {
                "role": "assistant",
                "content": msg.content or None,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in tool_calls
                ],
            }
            messages.append(assistant_msg)

            parsed: list[tuple[Any, str, dict[str, Any]]] = []
            for tc in tool_calls:
                name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                if name == "resolve_thread" and "history" not in args:
                    args["history"] = [{"role": t.role, "text": t.text} for t in turns]
                if name == "final_answer":
                    args.setdefault("message", message)
                    args.setdefault("observations", [{"name": n, "text": t} for n, t in observations])
                    args.setdefault("history", [{"role": t.role, "text": t.text} for t in turns])
                if name == "gap_search":
                    args.setdefault("message", message)
                    args.setdefault("observations", [{"name": n, "text": t} for n, t in observations])
                if name in {"agent_talk", "extract_claims", "compare_sources", "cite_pack", "consult_knowledge"}:
                    args.setdefault("message", message)
                    args.setdefault("observations", [{"name": n, "text": t} for n, t in observations])
                    args.setdefault("history", [{"role": t.role, "text": t.text} for t in turns])
                parsed.append((tc, name, args))
                yield _sse({"type": "tool", "name": name, "args": args})

            async def _run(n: str, a: dict[str, Any]) -> str:
                if n not in RUNNERS:
                    return f"unknown tool: {n}"
                return await run_tool(n, a)

            t_tool0 = time.perf_counter()
            jobs = [(name, args, _run) for _, name, args in parsed]
            overrides: dict[str, float] = {}
            for _, name, args in parsed:
                if name == "run_cmd":
                    sec = float(args.get("timeout_sec") or 60)
                    overrides["run_cmd"] = max(overrides.get("run_cmd", 0.0), sec + 15.0)
            results = await run_many(jobs, timeout_override=overrides or None)
            t_tools += time.perf_counter() - t_tool0
            n_tools += len(results)

            # Preserve tool_call_id order: match by name+args index
            by_name: dict[tuple[str, int], str] = {}
            counts: dict[str, int] = {}
            for name, args, obs in results:
                counts[name] = counts.get(name, 0)
                by_name[(name, counts[name])] = obs
                counts[name] += 1
            seen: dict[str, int] = {}
            for tc, name, args in parsed:
                k = seen.get(name, 0)
                obs = by_name.get((name, k), "")
                seen[name] = k + 1
                truncated = digest_obs(name, obs)
                observations.append((name, truncated))
                yield _sse({"type": "observation", "name": name, "text": truncated})
                messages.append({"role": "tool", "tool_call_id": tc.id, "content": truncated})

            if any(n == "final_answer" for n, _ in observations):
                text = unwrap_answer_payload(
                    next(t for n, t in reversed(observations) if n == "final_answer")
                )
                if mode == "code":
                    from server.memory import write_fact
                    from server.workspace import workspace_root as _ws

                    passed = _code_verify_passed(observations)
                    write_fact(
                        f"coding workspace={_ws()} last_feature={message[:180]} "
                        f"check_passed={passed} files_patched=apply_patch/write_file"
                    )
                if not t_first_token:
                    t_first_token = int((time.perf_counter() - t0) * 1000)
                for i in range(0, len(text), 48):
                    yield _sse({"type": "token", "text": text[i : i + 48]})
                yield _sse({"type": "done", "text": text})
                if mode != "code" and text and not _BAD_CACHE.search(text):
                    cache_put("answer", text, *replay_parts)
                yield _sse(_metrics(t_first_plan_ms=t_first_plan, n_llm_calls=n_llm, n_tools=n_tools, t_tools_ms=int(t_tools * 1000), t_first_token_ms=t_first_token, cache=cache_stats()))
                return

        wrap = client.chat.completions.create(
            model=writer,
            messages=messages
            + [
                {
                    "role": "user",
                    "content": (
                        "Max steps reached. Give the best answer you can"
                        + (", with citations." if hp.require_citations else ".")
                        + (
                            " Then self-critique: list one possible error and correct it in the final prose."
                            if hp.self_critique
                            else ""
                        )
                    ),
                }
            ],
            temperature=hp.writer_temperature,
        )
        n_llm += 1
        final_text = unwrap_answer_payload(wrap.choices[0].message.content or "")
        if not t_first_token:
            t_first_token = int((time.perf_counter() - t0) * 1000)
        for i in range(0, len(final_text), 48):
            yield _sse({"type": "token", "text": final_text[i : i + 48]})
        yield _sse({"type": "done", "text": final_text})
        if final_text and not _BAD_CACHE.search(final_text):
            cache_put("answer", final_text, *replay_parts)
        yield _sse(_metrics(t_first_plan_ms=t_first_plan, n_llm_calls=n_llm, n_tools=n_tools, t_tools_ms=int(t_tools * 1000), t_first_token_ms=t_first_token, cache=cache_stats()))
    except Exception as e:
        yield _sse({"type": "error", "text": str(e)})


