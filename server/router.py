"""Cheap router: skip Grok when local_brain can finish the turn."""

from __future__ import annotations

from typing import Any

from server.local_brain import cheap_answer, think
from server.reason import Turn

# Intent → max Grok/tool steps. Ceiling, not a target.
MAX_STEPS = {
    "chat": 0,
    "calc": 0,
    "memory": 1,
    "weather": 2,
    "howto": 2,
    "media": 3,
    "research": 6,
    "factual": 2,
    "debate": 6,
    "code": 16,
}

CREW_SIMPLE = frozenset({"planner", "judge"})
CREW_RESEARCH = frozenset({"planner", "librarian", "judge", "citations", "logic", "gap"})
CREW_HIGH = frozenset(
    {"planner", "librarian", "skeptic", "gap", "judge", "verifier", "citations", "logic"}
)
CREW_ALWAYS = frozenset({"context", "thread", "skill_router", "knowledge"})


def route(message: str, history: list[Turn]) -> dict[str, Any]:
    thought = think(message, history)
    mode = str(thought.get("mode") or "research")
    kind = str(thought.get("kind") or mode)
    cheap = cheap_answer(message, history, thought)
    steps = MAX_STEPS.get(mode, MAX_STEPS.get(kind, 4))
    if cheap is not None:
        steps = 0
    if mode in {"chat", "calc", "memory", "code", "domain"}:
        crew = set()
        needs_crew = False
    elif mode == "weather":
        crew = set(CREW_SIMPLE) | CREW_ALWAYS | {"api", "numbers", "units", "time"}
        needs_crew = True
    elif mode == "howto":
        crew = set(CREW_RESEARCH) | CREW_ALWAYS | {"howto"}
        needs_crew = True
    elif mode == "media":
        crew = set(CREW_SIMPLE) | CREW_ALWAYS | {"librarian", "facts", "api", "citations"}
        needs_crew = True
    elif mode == "research" or kind in {"debate", "research"}:
        crew = set(CREW_HIGH) | CREW_ALWAYS
        needs_crew = True
    else:
        crew = set(CREW_SIMPLE) | CREW_ALWAYS
        needs_crew = True
    thought = {
        **thought,
        "max_steps": steps,
        "crew_allow": sorted(crew),
        "needs_crew": needs_crew and cheap is None,
        "skip_grok": cheap is not None,
        "cheap_text": cheap,
    }
    return thought
