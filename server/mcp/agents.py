from __future__ import annotations

from server.crew.board import Blackboard
from server.mcp.hooks import (
    HookCtx,
    coverage,
    missing_terms,
    run_hooks,
    thread_entities,
    verify_draft,
)
from server.mcp.knowledge import consult
from server.mcp.talk import run_exchange


def thread_agent(board: Blackboard) -> None:
    ctx = run_hooks(
        HookCtx(
            event="on_user_message",
            message=board.goal,
            history=board.history,
            plan=board.plan,
        )
    )
    ent = ctx.extras.get("thread") or thread_entities(board.history, board.goal)
    intent = ctx.extras.get("intent") or {}
    board.post(
        "thread",
        "coreference / history",
        f"Kind={intent.get('kind') or ent.get('kind')}. Follow-up={ent.get('follow_up')}. "
        f"Topic-shift={ent.get('topic_shift')}. Place={ent.get('location') or 'none'}. "
        f"Units={ent.get('units')}. Order: {' → '.join(ctx.extras.get('thought_order') or [])}.",
        **{**ent, "kind": intent.get("kind") or ent.get("kind"), "thought_order": ctx.extras.get("thought_order")},
    )


def _router_skills(board: Blackboard) -> list[str]:
    post = next((p for p in reversed(board.posts) if p.agent == "skill_router"), None)
    if not post:
        return []
    return list(post.data.get("skills") or [])


def skill_router_agent(board: Blackboard, events: tuple[tuple[str, str], ...] | None = None) -> None:
    """Post skills for this phase. Later waves read the post; compose/verify after evidence."""
    phase_events = events or (
        ("understand", "on_user_message"),
        ("plan", "on_plan"),
        ("gather", "on_observations"),
    )
    prior = _router_skills(board)
    names: list[str] = list(prior)
    for _phase, event in phase_events:
        h = run_hooks(
            HookCtx(
                event=event,
                message=board.goal,
                history=board.history,
                plan=board.plan,
                observations=board.observations,
            ),
            prefer=prior or None,
        )
        names.extend(h.extras.get("skills") or [])
    uniq = list(dict.fromkeys(names))
    from server.neurons import rank

    ranked = rank("skills", board.goal, uniq or ["think-first"])
    label = " → ".join(p for p, _ in phase_events)
    board.post(
        "skill_router",
        "skill dispatch",
        f"Active skills ({label}): "
        + (", ".join(uniq) or "none")
        + ". Neurons: "
        + ", ".join(f"{n}={s:.2f}" for n, s in ranked[:8]),
        skills=uniq,
        neurons=dict(ranked),
        phase=label,
    )


def logic_agent(board: Blackboard) -> None:
    cov = coverage(board.goal, board.observations)
    n = len(board.observations)
    miss = missing_terms(board.goal, board.observations)
    stop = cov >= 0.55 and n > 0 and len(miss) <= 2
    board.post(
        "logic",
        "control / stop rules",
        f"Coverage={cov:.2f} over {n} observations. Missing={', '.join(miss) or 'none'}. "
        + ("Enough evidence to answer." if stop else "Need extra search or qualify the answer."),
        coverage=cov,
        stop=stop,
        missing=miss,
    )


def gap_agent(board: Blackboard) -> None:
    ctx = run_hooks(
        HookCtx(
            event="on_observations",
            message=board.goal,
            history=board.history,
            plan=board.plan,
            observations=board.observations,
        )
    )
    qs = ctx.extras.get("gap_queries") or []
    miss = ctx.extras.get("missing") or []
    board.post(
        "gap",
        "missing evidence",
        f"Coverage={float(ctx.extras.get('coverage') or 0):.2f}. "
        f"Missing terms: {', '.join(miss) or 'none'}. Extra queries: {'; '.join(qs) or 'none'}.",
        queries=qs,
        coverage=ctx.extras.get("coverage", 0),
        missing=miss,
    )


def knowledge_agent(board: Blackboard) -> None:
    hits = consult(board.goal, limit=3)
    names = [h["name"] for h in hits]
    excerpts = [f"{h['name']}: {h['excerpt'][:220]}" for h in hits]
    board.post(
        "knowledge",
        "playbooks",
        "Knowledge packs: " + (", ".join(names) or "none") + ". " + " | ".join(excerpts[:2]),
        packs=names,
        hits=hits,
    )


def exchange_agent(board: Blackboard) -> None:
    run_exchange(board)


def verifier_agent(board: Blackboard) -> None:
    judge = next((p for p in reversed(board.posts) if p.agent == "judge"), None)
    draft = (judge.data.get("answer") if judge else "") or board.obs_blob()[:1500]
    report = verify_draft(draft, board.observations)
    if report.get("contradicted"):
        note = "Contradicted numbers — qualify before publish. "
    elif report["ok"]:
        note = "Verified against observations. "
    else:
        note = "Weak support — qualify or search again. "
    if report["unsupported"]:
        note += "Unsupported: " + " | ".join(report["unsupported"][:2])
    board.post(
        "verifier",
        "answer check",
        note.strip(),
        **report,
    )


def companion_agent(board: Blackboard) -> None:
    q = board.goal
    board.post(
        "companion",
        "conversational engagement",
        f"Conversational intent detected. Maintain empathetic, warm, natural dialogue about '{q[:80]}' without robotic detachment.",
        goal=q,
        conversational=True,
    )

