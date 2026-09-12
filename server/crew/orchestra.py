from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from server.crew.board import Blackboard
from server.crew.specialists import ROSTER
from server.reason import Plan, Turn

# Thought order: understand → plan → gather/reason → control → compose → verify
WAVES: list[tuple[str, set[str]]] = [
    ("1 understand", {"context", "thread", "skill_router", "knowledge"}),
    ("2 plan", {"planner", "scout", "time", "howto"}),
    ("3 evidence", {"librarian", "api", "facts", "numbers", "citations", "skeptic", "risk", "memory"}),
    ("4 control", {"logic", "gap"}),
    ("5 debate", {"exchange", "companion"}),
    ("6 compare", {"units", "compare"}),
]


def _sse(payload: dict) -> str:
    import json

    return json.dumps(payload, ensure_ascii=False) + "\n"


def _wanted_from_board(board: Blackboard) -> set[str]:
    from server.neurons import agents_for_skills

    post = next((p for p in reversed(board.posts) if p.agent == "skill_router"), None)
    skills = list((post.data.get("skills") if post else None) or [])
    return agents_for_skills(skills)


def _latest(board: Blackboard, name: str):
    return next((p for p in reversed(board.posts) if p.agent == name), None)


async def _fill_gaps(board: Blackboard) -> list[str]:
    """Run skill_router gap queries against the web before compose."""
    gap = _latest(board, "gap")
    logic = _latest(board, "logic")
    qs = list((gap.data.get("queries") if gap else None) or [])
    cov = float((logic.data.get("coverage") if logic else 0) or 0)
    if not qs or cov >= 0.55:
        return []
    from server.tools import run_tool

    added: list[str] = []
    for q in qs[:2]:
        raw = await run_tool("web_search", {"query": q})
        board.observations.append(("web_search", raw[:8000]))
        added.append(q)
    return added


async def run_crew(
    goal: str,
    plan: Plan,
    history: list[Turn],
    observations: list[tuple[str, str]],
    allow: set[str] | None = None,
) -> AsyncIterator[str]:
    board = Blackboard(goal=goal, plan=plan, history=history, observations=observations)
    yield _sse(
        {
            "type": "plan",
            "text": (
                "Thought order: understand → plan → gather → fill gaps → compose → verify → stop. "
                f"Crew allow={sorted(allow) if allow is not None else 'all'}. Goal: {goal}"
            ),
        }
    )

    roster = dict(ROSTER)
    from server.mcp.talk import run_early_exchange
    from server.neurons import crew_fire

    async def run_one(fn):
        await asyncio.to_thread(fn, board)

    wanted: set[str] = set()
    for label, names in WAVES:
        yield _sse({"type": "plan", "text": f"Phase {label}"})
        picked: list[str] = []
        scores: dict[str, float] = {}
        for n in names:
            if n not in roster:
                continue
            if allow is not None and n not in allow:
                continue
            ok, sc = crew_fire(n, goal, wanted=wanted)
            scores[n] = sc
            if ok:
                picked.append(n)
        if picked:
            await asyncio.gather(*(run_one(roster[n]) for n in picked))
        for n in picked:
            for p in reversed(board.posts):
                if p.agent == n:
                    yield _sse(
                        {
                            "type": "tool",
                            "name": f"crew:{p.agent}",
                            "args": {
                                "phase": label,
                                "expertise": p.expertise,
                                "neuron": round(scores.get(n, 0), 3),
                            },
                        }
                    )
                    yield _sse({"type": "observation", "name": f"crew:{p.agent}", "text": p.text[:2000]})
                    break
        if label.startswith("1 "):
            wanted = _wanted_from_board(board)
            # Hub broadcast of initial task specification
            board.broadcast(
                sender="coordinator",
                topic="task_init",
                payload=f"Hub assigned goal: '{goal}'. Wanted skills: {sorted(wanted)}",
                priority="normal"
            )
            run_early_exchange(board)
            early = _latest(board, "exchange")
            if early:
                yield _sse({"type": "tool", "name": "crew:exchange", "args": {"phase": "1 understand"}})
                yield _sse({"type": "observation", "name": "crew:exchange", "text": early.text[:2000]})

        # Phase 5: Hub-and-Spoke Course-of-Action Debate & Resolution
        if label.startswith("5 "):
            # If debate topics exist or high-stake trade-offs appear, arbitrate on the hub
            skeptic = _latest(board, "skeptic")
            logic = _latest(board, "logic")
            risk = _latest(board, "risk")
            companion = _latest(board, "companion")
            need_debate = bool(skeptic or risk)
            if need_debate and not board.active_debates:
                d = board.open_debate("action_plan", f"Validate trade-offs and risks for '{goal[:60]}'", initiator="skeptic" if skeptic else "logic")
                # Collect proposals from spokes
                if skeptic:
                    board.submit_proposal("action_plan", "skeptic", "Rigorous Verification", 0.85, skeptic.text[:180])
                if logic:
                    board.submit_proposal("action_plan", "logic", "Direct Synthesis", 0.90, logic.text[:180])
                if companion:
                    board.submit_proposal("action_plan", "companion", "Conversational Clarity", 0.75, "Ensure actionable, natural response.")
                verdict = board.arbitrate_debate("action_plan", coordinator="coordinator")
                if verdict:
                    yield _sse({
                        "type": "tool",
                        "name": "hub:broadcast_bus",
                        "args": {"topic": "verdict:action_plan", "priority": "urgent", "router": "hub-and-spoke"}
                    })
                    yield _sse({"type": "observation", "name": "hub:broadcast_bus", "text": verdict[:2000]})

        if label.startswith("4 "):
            extra = await _fill_gaps(board)
            if extra:
                board.broadcast(
                    sender="gap",
                    topic="fill_gaps",
                    payload=f"Identified missing facets: {', '.join(extra)}",
                    priority="urgent"
                )
                yield _sse(
                    {
                        "type": "plan",
                        "text": "Fill gaps before compose: " + "; ".join(extra),
                    }
                )
                for n in ("librarian", "facts", "logic", "gap"):
                    if n in roster and (allow is None or n in allow):
                        await run_one(roster[n])
                        post = _latest(board, n)
                        if post:
                            yield _sse({"type": "tool", "name": f"crew:{n}", "args": {"phase": "4b refill"}})
                            yield _sse({"type": "observation", "name": f"crew:{n}", "text": post.text[:2000]})

    from server.mcp.agents import skill_router_agent

    skill_router_agent(board, events=(("compose", "on_before_judge"),))
    wanted = _wanted_from_board(board)

    judge = roster["judge"]
    verifier = roster["verifier"]
    skip_verify = allow is not None and "verifier" not in allow
    yield _sse({"type": "plan", "text": "Phase 7 compose"})
    judge(board)
    final = _latest(board, "judge")
    assert final is not None
    yield _sse({"type": "tool", "name": "crew:judge", "args": {"expertise": final.expertise}})
    yield _sse({"type": "observation", "name": "crew:judge", "text": final.text[:4000]})

    vpost = None
    if not skip_verify:
        yield _sse({"type": "plan", "text": "Phase 8 verify"})
        skill_router_agent(board, events=(("verify", "on_verify"),))
        verifier(board)
        vpost = _latest(board, "verifier")
        if vpost:
            yield _sse({"type": "tool", "name": "crew:verifier", "args": {"expertise": vpost.expertise}})
            yield _sse({"type": "observation", "name": "crew:verifier", "text": vpost.text[:2000]})

    weak = bool(vpost and not vpost.data.get("ok"))
    if weak:
        yield _sse({"type": "plan", "text": "Verify weak — one re-compose after gap refill"})
        extra = await _fill_gaps(board)
        if extra:
            yield _sse({"type": "plan", "text": "Re-search: " + "; ".join(extra)})
            for n in ("librarian", "facts", "logic", "gap", "exchange"):
                if n in roster:
                    await run_one(roster[n])
        judge(board)
        final = _latest(board, "judge")
        assert final is not None
        yield _sse({"type": "tool", "name": "crew:judge", "args": {"expertise": final.expertise, "recompose": True}})
        yield _sse({"type": "observation", "name": "crew:judge", "text": final.text[:4000]})
        verifier(board)
        vpost = _latest(board, "verifier")
        if vpost:
            yield _sse({"type": "tool", "name": "crew:verifier", "args": {"expertise": vpost.expertise, "recompose": True}})
            yield _sse({"type": "observation", "name": "crew:verifier", "text": vpost.text[:2000]})

    answer = str(final.data.get("answer") or final.text)
    yield _sse({"type": "tool", "name": "final_answer", "args": {"question": goal}})
    yield _sse({"type": "observation", "name": "final_answer", "text": answer[:4000]})
    yield answer
