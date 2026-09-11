from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from server.mcp.hooks import coverage, missing_terms
from server.mcp.knowledge import consult

if TYPE_CHECKING:
    from server.crew.board import Blackboard


@dataclass
class Talk:
    src: str
    dst: str
    question: str
    reply: str = ""
    data: dict[str, Any] = field(default_factory=dict)


# After understand: knowledge is live; planner has not run yet.
EARLY_HANDOFFS: list[tuple[str, str, str]] = [
    ("knowledge", "planner", "Which playbook applies to this intent?"),
    ("skill_router", "planner", "Which specialists should fire for these skills?"),
]

# After evidence + control: live posts exist for gap, skeptic, numbers, citations.
HANDOFFS: list[tuple[str, str, str]] = [
    ("gap", "librarian", "What evidence is still missing for this question?"),
    ("skeptic", "facts", "Which claims look like title traps rather than evidence?"),
    ("numbers", "units", "How should quantities be reported to the user?"),
    ("logic", "gap", "Is coverage high enough to stop gathering?"),
    ("citations", "judge", "Which URLs actually support a user-facing answer?"),
    ("skill_router", "judge", "Which playbooks and skills should shape the compose?"),
]


def _post_of(board: Blackboard, name: str):
    return next((p for p in reversed(board.posts) if p.agent == name), None)


def _reply(dst: str, question: str, board: Blackboard) -> str:
    blob = board.obs_blob()
    goal = board.goal
    post = _post_of(board, dst)
    prior = post.text if post else "no prior post"
    packs = consult(f"{goal} {question} {dst}", limit=1)
    note = packs[0]["excerpt"].splitlines()[0] if packs else ""

    if dst == "librarian":
        n_s = sum(1 for n, _ in board.observations if n in {"web_search", "followup_search", "gap_search"})
        n_p = sum(1 for n, _ in board.observations if n == "read_url")
        miss = missing_terms(goal, board.observations)
        return (
            f"Librarian → gap: {n_s} search batches, {n_p} pages. "
            f"Still missing: {', '.join(miss) or 'nothing obvious'}. {note}"
        )
    if dst == "facts":
        return f"Facts → skeptic: {prior[:280]}"
    if dst == "units":
        u = board.plan.units
        return f"Units → numbers: report {u} only. Inherit place/units on follow-ups unless topic shifted. {note}"
    if dst == "gap":
        cov = coverage(goal, board.observations)
        miss = missing_terms(goal, board.observations)
        stop = cov >= 0.55 and board.observations and len(miss) <= 2
        return (
            f"Gap → logic: coverage={cov:.2f}, missing={', '.join(miss) or 'none'}. "
            + ("Stop gathering." if stop else "Need one more search facet.")
        )
    if dst == "judge":
        urls = next((p.data.get("urls") for p in board.posts if p.agent == "citations"), None) or []
        return f"Judge note: use {len(urls)} citation URL(s); skip jina wrappers. {prior[:160]}"
    if dst == "planner":
        skills = next((p.data.get("skills") for p in board.posts if p.agent == "skill_router"), None) or []
        return (
            f"Planner → knowledge: smallest tool set for '{goal[:80]}'. "
            f"Skills: {', '.join(skills) or 'none'}. {note}"
        )
    return f"{dst}: {prior[:240]}"


def run_exchange(board: Blackboard, pairs: list[tuple[str, str, str]] | None = None) -> list[Talk]:
    thread: list[Talk] = []
    for src, dst, q in pairs or HANDOFFS:
        talk = Talk(src=src, dst=dst, question=q, reply=_reply(dst, q, board))
        thread.append(talk)
        board.ask(src, dst, q, reply=talk.reply)
    lines = [f"{t.src}→{t.dst}: {t.question} || {t.reply}" for t in thread]
    board.post(
        "exchange",
        "agent debate",
        "Exchange:\n" + "\n".join(lines),
        turns=[{"src": t.src, "dst": t.dst, "q": t.question, "a": t.reply} for t in thread],
    )
    return thread


def run_early_exchange(board: Blackboard) -> list[Talk]:
    return run_exchange(board, EARLY_HANDOFFS)


def agent_talk_payload(src: str, dst: str, question: str, board: Blackboard | None = None) -> dict[str, Any]:
    packs = consult(f"{src} {dst} {question}", limit=2)
    reply = (
        _reply(dst, question, board)
        if board is not None
        else (packs[0]["excerpt"][:400] if packs else f"{dst} has no board yet.")
    )
    return {
        "from": src,
        "to": dst,
        "question": question,
        "reply": reply,
        "knowledge": [{"name": p["name"], "excerpt": p["excerpt"][:400]} for p in packs],
    }
