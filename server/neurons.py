"""Named tiny nets: one bank of neurons per MCP layer.

Same architecture (10×12×1), separate weights. Not a language model.
Banks: reason, skills, hooks, tools, agents.
"""

from __future__ import annotations

import math
import random
import re
from typing import Sequence

INPUT = 10
HIDDEN = 12

ALWAYS_SKILLS = frozenset({"think-first", "thread-context", "control-logic", "conversational-chat"})
ALWAYS_AGENTS = frozenset(
    {"context", "thread", "skill_router", "knowledge", "judge", "verifier", "exchange", "companion"}
)

# Blackboard skill names → crew members that should fire when the router posts them.
SKILL_TO_AGENTS: dict[str, frozenset[str]] = {
    "think-first": frozenset({"context"}),
    "thread-context": frozenset({"thread", "context"}),
    "control-logic": frozenset({"logic"}),
    "conversational-chat": frozenset({"companion", "judge"}),
    "gap-search": frozenset({"gap", "scout", "librarian"}),
    "knowledge-first": frozenset({"knowledge", "planner"}),
    "agent-exchange": frozenset({"exchange"}),
    "cite-sources": frozenset({"citations"}),
    "compare-evidence": frozenset({"compare", "skeptic"}),
    "verify-answer": frozenset({"verifier"}),
    "final-answer": frozenset({"judge"}),
    "read-media": frozenset({"librarian", "api", "facts"}),
    "summarize": frozenset({"librarian", "facts", "judge"}),
    "write-forms": frozenset({"planner", "judge"}),
    "argue-and-synthesize": frozenset({"exchange", "compare", "skeptic", "judge"}),
    "stay-grounded": frozenset({"verifier", "skeptic", "citations"}),
    "learn-skill": frozenset({"knowledge", "scout", "librarian", "planner"}),
    "lint-fix": frozenset({"planner", "logic"}),
    "code-agent": frozenset({"planner", "logic"}),
}

CREW_ROLES: dict[str, str] = {
    "context": "thread place units follow-up conversation",
    "thread": "coreference history it there today",
    "skill_router": "dispatch skills phases",
    "knowledge": "playbooks research method",
    "planner": "split tasks plan queries",
    "scout": "search strategy queries",
    "librarian": "pages sources inventory",
    "api": "structured weather api payload",
    "facts": "extract claims definitions java what is",
    "numbers": "temperature quantities numbers rain degrees",
    "units": "metric imperial celsius fahrenheit convert",
    "time": "today tonight now temporal",
    "compare": "disagreement closer versus spread",
    "howto": "how to install setup code example steps",
    "risk": "caveats do not invent",
    "skeptic": "title trap insurance seo rain keyword",
    "logic": "coverage stop rules missing",
    "gap": "missing evidence extra search",
    "exchange": "agents talk handoff debate",
    "companion": "normal conversation chit chat friendly engaging dialogue open discussion with anyone",
    "citations": "urls provenance cite",
    "memory": "remember persist jsonl",
    "judge": "final merge compose answer",
    "verifier": "verify claims supported contradicted",
}

CREW_FIT: dict[str, list[str]] = {
    "companion": [
        "let's have a normal conversation",
        "how was your day",
        "tell me your thoughts on life and happiness",
        "can we just chat about anything",
        "what do you think about friendship and love",
    ],
    "facts": ["what is java", "what is python", "define photosynthesis"],
    "numbers": ["rain in austin temperature", "how far is the moon km"],
    "units": ["weather montevideo imperial fahrenheit"],
    "howto": ["how to write hello world in java", "how do I install python"],
    "compare": ["which is closer brazil or argentina", "compare sources"],
    "skeptic": ["do I need an umbrella", "will it rain today"],
    "api": ["weather in tokyo", "forecast austin"],
    "time": ["will it rain today", "weather tonight"],
    "gap": ["thin coverage missing terms"],
    "citations": ["cite sources for java"],
    "memory": ["remember austin uses metric"],
    "scout": ["research generative ai agents"],
    "librarian": ["read official documentation"],
}


def _sigmoid(x: float) -> float:
    if x < -40:
        return 0.0
    if x > 40:
        return 1.0
    return 1.0 / (1.0 + math.exp(-x))


def _dsig(y: float) -> float:
    return y * (1.0 - y)


def features(question: str, sent: str, terms: Sequence[str] | None = None, entities: Sequence[str] | None = None) -> list[float]:
    q = (question or "").lower()
    s = (sent or "").lower()
    terms = list(terms) if terms else [w for w in re.findall(r"[a-z]{3,}", q)]
    nterms = max(len(terms), 1)
    overlap = sum(1 for t in terms if t in s) / nterms
    ents = list(entities) if entities is not None else re.findall(r"\b[A-Z][a-z]+\b", question or "")
    ehit = (sum(1 for e in ents if e.lower() in s) / max(len(ents), 1)) if ents else 0.0
    junk = 1.0 if re.search(r'"title"|snippet|\{', sent or "") else 0.0
    trap = 1.0 if re.search(r"insurance|umbrella.com|jacket", s) else 0.0
    defin = 1.0 if re.search(r"\b(is|are|was|means)\b", s) else 0.0
    geo = 1.0 if re.search(r"\b(closer|border|km|miles|capital|neighbor)\b", s) else 0.0
    num = 1.0 if re.search(r"\d", s) else 0.0
    q_in_s = 1.0 if any(w in s for w in q.split() if len(w) > 4) else 0.0
    lab_toks = re.findall(r"[a-z]{3,}", s)
    rev = sum(1 for t in lab_toks if t in q) / max(len(lab_toks), 1)
    length = min(len(s), 400) / 400.0
    jsony = 1.0 if (s.strip()[:1] in "{[") else 0.0
    # Mix reverse overlap into q_in_s so tool/skill names match the query.
    return [overlap, ehit, junk, trap, defin, geo, num, max(q_in_s, rev), length, jsony]


class TinyNet:
    def __init__(self, seed: int = 7) -> None:
        rng = random.Random(seed)
        self.w1 = [[rng.uniform(-0.4, 0.4) for _ in range(INPUT)] for _ in range(HIDDEN)]
        self.b1 = [0.0] * HIDDEN
        self.w2 = [rng.uniform(-0.4, 0.4) for _ in range(HIDDEN)]
        self.b2 = 0.0

    def forward(self, x: list[float]) -> tuple[list[float], float]:
        h = []
        for i in range(HIDDEN):
            z = self.b1[i] + sum(self.w1[i][j] * x[j] for j in range(INPUT))
            h.append(_sigmoid(z))
        y = _sigmoid(self.b2 + sum(self.w2[i] * h[i] for i in range(HIDDEN)))
        return h, y

    def train(self, rows: list[tuple[list[float], float]], epochs: int = 70, lr: float = 0.35) -> None:
        for _ in range(epochs):
            for x, t in rows:
                h, y = self.forward(x)
                err = y - t
                dy = err * _dsig(y)
                dh = [dy * self.w2[i] * _dsig(h[i]) for i in range(HIDDEN)]
                for i in range(HIDDEN):
                    self.w2[i] -= lr * dy * h[i]
                    self.b1[i] -= lr * dh[i]
                    for j in range(INPUT):
                        self.w1[i][j] -= lr * dh[i] * x[j]
                self.b2 -= lr * dy

    def score(self, x: list[float]) -> float:
        return self.forward(x)[1]


def _fit(seed: int, pairs: list[tuple[str, str, float]]) -> TinyNet:
    net = TinyNet(seed=seed)
    rows = [(features(q, s), y) for q, s, y in pairs]
    net.train(rows, epochs=120, lr=0.4)
    return net


_CORPORA: dict[str, list[tuple[str, str, float]]] = {
    "reason": [
        ("what is java", "Java is a high-level object-oriented programming language.", 1.0),
        ("what is java", '{"title": "Java", "snippet": "download now"}', 0.0),
        ("what is java", "Buy umbrella insurance today for your family.", 0.0),
        (
            "which is closer to Montevideo Brazil or Argentina",
            "Argentina shares a long border with Uruguay; Montevideo faces Buenos Aires.",
            1.0,
        ),
        ("which is closer to Montevideo Brazil or Argentina", "Grocery store hours in Montevideo, Minnesota.", 0.0),
        ("do I need an umbrella", "Open-Meteo reports 0 mm precipitation and sunny skies.", 1.0),
        ("do I need an umbrella", "Umbrella insurance protects against lawsuits.", 0.0),
        ("how far is the moon", "The Moon averages about 384,400 km from Earth.", 1.0),
        ("how to write hello world in java", "public class HelloWorld { public static void main", 0.9),
        ("how to write hello world in java", "Java coffee beans from Sumatra.", 0.0),
        ("weather in Austin", "Austin is 22 C and clear this afternoon.", 1.0),
        ("weather in Austin", "Austin city council voted on zoning.", 0.2),
        ("tell me about life", "Life is full of wonderful surprises, growth, connection, and learning experiences.", 1.0),
        ("can we have a normal conversation", "Absolutely! I would love to talk about anything that is on your mind.", 1.0),
    ],
    "skills": [
        ("hi what can you do", "think-first classify intent and thought order", 1.0),
        ("hi what can you do", "gap-search extra web searches when evidence is thin", 0.1),
        ("can we have a normal conversation", "conversational-chat open-ended engaging friendly dialogue", 1.0),
        ("tell me about yourself and your thoughts", "conversational-chat open-ended engaging friendly dialogue", 0.95),
        ("rain in Austin", "thread-context bind place and units", 1.0),
        ("rain in Austin", "howto-code install steps", 0.1),
        ("how do I install python", "gap-search extra searches", 0.7),
        ("how do I install python", "final-answer write user facing reply", 0.8),
        ("remember Austin uses metric", "knowledge-first playbooks", 0.4),
        ("what is java", "verify-answer check draft against observations", 0.6),
        ("what is java", "cite-sources citation pack", 0.7),
        ("compare brazil argentina", "compare-evidence score disagreement", 1.0),
        ("thanks", "agent-exchange specialists ask each other", 0.05),
        ("summarize this youtube", "summarize condense pages videos", 1.0),
        ("summarize this youtube", "read-media youtube image video", 0.95),
        ("generate an image of a rocket", "read-media youtube image video", 0.9),
        ("write an editorial about AI", "write-forms journal documentary essay", 1.0),
        ("debate nuclear vs renewables", "argue-and-synthesize compare contrast debate", 1.0),
        ("verify before publishing", "stay-grounded impartial refuse hallucination", 1.0),
        ("learn how to do code review", "learn-skill install playbook from web", 1.0),
        ("yarn lint fix the errors", "lint-fix run lint search patch", 1.0),
        ("build a vite react app", "code-agent closed coding loop", 1.0),
    ],
    "hooks": [
        ("on_user_message hi", "think-first", 1.0),
        ("on_user_message hi", "conversational-chat", 0.9),
        ("on_user_message how are you feeling today", "conversational-chat", 1.0),
        ("on_user_message hi", "verify-answer", 0.05),
        ("on_observations thin coverage", "gap-search", 1.0),
        ("on_observations thin coverage", "final-answer", 0.2),
        ("on_before_judge draft ready", "verify-answer", 1.0),
        ("on_before_judge draft ready", "conversational-chat", 0.8),
        ("on_before_judge draft ready", "gap-search", 0.15),
        ("on_plan weather austin", "thread-context", 0.9),
        ("on_verify claims", "verify-answer", 1.0),
    ],
    "tools": [
        ("what is java", "web_search", 1.0),
        ("what is java", "weather_compare", 0.05),
        ("weather in Tokyo", "weather_compare", 1.0),
        ("weather in Tokyo", "generate_image", 0.0),
        ("remember this fact", "memory_write", 1.0),
        ("what do you remember", "memory_search", 1.0),
        ("how to install python", "read_url", 0.8),
        ("how to install python", "youtube_summarize", 0.1),
        ("hi", "web_search", 0.02),
        ("hi", "generate_image", 0.0),
        ("hi", "weather_compare", 0.0),
        ("hi", "resolve_thread", 0.4),
        ("let us chat normally", "final_answer", 1.0),
        ("weather tokyo forecast rain", "generate_image", 0.0),
        ("weather tokyo forecast rain", "weather_compare", 1.0),
        ("follow up about rain", "followup_search", 0.9),
        ("thin evidence", "gap_search", 0.95),
        ("draft ready", "final_answer", 1.0),
        ("draft ready", "verify_claims", 0.9),
        ("summarize this youtube", "youtube_summarize", 1.0),
        ("describe this image https://example.com/a.png", "read_image", 1.0),
        ("generate an image of a cat", "generate_image", 1.0),
        ("transcribe the local video", "local_video_summarize", 0.95),
        ("learn a new skill from the web", "write_skill", 0.9),
        ("install a knowledge pack", "write_knowledge", 0.85),
    ],
    "agents": [
        ("rain in austin", "numbers", 0.9),
        ("rain in austin", "howto", 0.1),
        ("how to write java hello", "howto", 1.0),
        ("how to write java hello", "numbers", 0.2),
        ("what is java", "facts", 1.0),
        ("what is java", "units", 0.2),
        ("compare sources", "skeptic", 0.9),
        ("hi", "scout", 0.1),
        ("can we have a normal conversation", "companion", 1.0),
        ("how are you doing today my friend", "companion", 0.95),
        ("missing evidence", "gap", 1.0),
        ("missing evidence", "time", 0.2),
    ],
}

def _crew_pairs(name: str) -> list[tuple[str, str, float]]:
    role = CREW_ROLES.get(name, name)
    pos = CREW_FIT.get(name, [])
    rows: list[tuple[str, str, float]] = [(q, role, 1.0) for q in pos]
    rows.append((name + " " + role, role, 0.95))
    for other, qs in CREW_FIT.items():
        if other == name:
            continue
        for q in qs[:1]:
            rows.append((q, role, 0.12))
    rows.append(("hi thanks bye", role, 0.05))
    rows.append(("ok cool", role, 0.05))
    return rows


_BANKS: dict[str, TinyNet] = {
    name: _fit(11 + i * 17, pairs) for i, (name, pairs) in enumerate(_CORPORA.items())
}
for i, cname in enumerate(CREW_ROLES):
    _BANKS[f"crew:{cname}"] = _fit(401 + i * 13, _crew_pairs(cname))


def neuron_score(
    question: str,
    sent: str,
    terms: Sequence[str] | None = None,
    entities: Sequence[str] | None = None,
    bank: str = "reason",
) -> float:
    net = _BANKS.get(bank) or _BANKS["reason"]
    return net.score(features(question, sent, terms, entities))


def fire(bank: str, query: str, label: str, threshold: float = 0.4) -> bool:
    return neuron_score(query, label, bank=bank) >= threshold


def rank(bank: str, query: str, labels: Sequence[str]) -> list[tuple[str, float]]:
    scored = [(lab, neuron_score(query, lab, bank=bank)) for lab in labels]
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored


def banks() -> list[str]:
    return list(_BANKS.keys())


def agents_for_skills(skills: Sequence[str] | None) -> set[str]:
    wanted: set[str] = set()
    for name in skills or []:
        wanted |= set(SKILL_TO_AGENTS.get(name, ()))
    return wanted


def crew_fire(
    agent: str,
    goal: str,
    threshold: float = 0.33,
    wanted: set[str] | None = None,
) -> tuple[bool, float]:
    """Each crew member uses bank crew:<name>. Skill-router posts can force-fire."""
    if agent in ALWAYS_AGENTS:
        return True, 1.0
    role = CREW_ROLES.get(agent, agent)
    sc = neuron_score(goal, role, bank=f"crew:{agent}")
    if wanted and agent in wanted:
        return True, max(sc, 0.9)
    return sc >= threshold, sc


def crew_banks() -> list[str]:
    return [k for k in _BANKS if k.startswith("crew:")]
