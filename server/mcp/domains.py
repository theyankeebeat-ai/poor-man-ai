"""Subject cards in knowledge/domains/*.json.

A card is a method, not a memory fact. It is used only when a trigger
matches as a whole word. Vague words are not triggers, so "surface" does
not pull astronomy and "code" does not pull the coding card.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

DOMAIN_DIR = Path(__file__).resolve().parent / "knowledge" / "domains"

_REQUIRED = ("name", "title", "topics", "triggers", "scope", "method", "formulas", "checks", "limits")
_LIVE = re.compile(
    r"\b(?:search(?:\s+the\s+web|\s+online)?\s+for|look\s+up|right\s+now|latest\s+news)\b",
    re.I,
)

_cards: tuple[float, list[dict]] | None = None


def _stamp() -> float:
    if not DOMAIN_DIR.exists():
        return 0.0
    times = [p.stat().st_mtime for p in DOMAIN_DIR.glob("*.json")]
    return max(times) if times else 0.0


def load_cards() -> list[dict]:
    global _cards
    stamp = _stamp()
    if _cards and _cards[0] == stamp:
        return _cards[1]
    out: list[dict] = []
    if DOMAIN_DIR.exists():
        for path in sorted(DOMAIN_DIR.glob("*.json")):
            card = json.loads(path.read_text(encoding="utf-8"))
            card["_path"] = str(path)
            out.append(card)
    _cards = (stamp, out)
    return out


def _hit(text: str, trigger: str) -> bool:
    return re.search(rf"(?<![a-z0-9]){re.escape(trigger.lower())}(?![a-z0-9])", text.lower()) is not None


def match_card(message: str) -> dict | None:
    """Highest trigger count. A live 'search for …' request matches nothing."""
    if _LIVE.search(message or ""):
        return None
    text = message or ""
    best: tuple[int, dict] | None = None
    for card in load_cards():
        hits = sum(1 for trigger in card.get("triggers") or [] if _hit(text, str(trigger)))
        if hits and (best is None or hits > best[0]):
            best = (hits, card)
    return best[1] if best else None


def render_body(card: dict) -> str:
    lines = [f"# {card.get('title') or card.get('name')}", "", str(card.get("scope") or ""), "", "## Method"]
    for i, step in enumerate(card.get("method") or [], 1):
        lines.append(f"{i}. {step}")
    lines.append("")
    lines.append("## Formulas")
    for formula in card.get("formulas") or []:
        lines.append(f"- **{formula.get('name')}**: `{formula.get('expr')}` — {formula.get('use')}")
    lines.append("")
    lines.append("## Checks")
    for item in card.get("checks") or []:
        lines.append(f"- {item}")
    lines.append("")
    lines.append("## Limits")
    for item in card.get("limits") or []:
        lines.append(f"- {item}")
    return "\n".join(lines)


def packs() -> list[dict]:
    """Packs for consult(). Domain cards score on triggers only."""
    out = []
    for card in load_cards():
        out.append(
            {
                "name": str(card.get("name") or ""),
                "topics": [str(t) for t in card.get("topics") or []],
                "triggers": [str(t) for t in card.get("triggers") or []],
                "body": render_body(card),
                "path": str(card.get("_path") or ""),
                "domain": True,
            }
        )
    return out


def _relevant_formulas(card: dict, message: str) -> list[dict]:
    words = [w for w in re.findall(r"[a-z0-9]{4,}", (message or "").lower())]
    picked = []
    for formula in card.get("formulas") or []:
        hay = f"{formula.get('name')} {formula.get('use')} {formula.get('expr')}".lower()
        if any(word in hay for word in words):
            picked.append(formula)
    return picked or list(card.get("formulas") or [])[:4]


def _fmt(value: float) -> str:
    if abs(value - round(value)) < 1e-9:
        return str(int(round(value)))
    return f"{value:.2f}"


def _triangle_answer(message: str) -> str | None:
    if not _hit(message, "triangle"):
        return None
    tagged = re.findall(r"(\d+(?:\.\d+)?)\s*(cm|mm|m)\b", message, re.I)
    if len(tagged) != 3:
        return None
    unit = tagged[0][1].lower()
    if any(item[1].lower() != unit for item in tagged):
        return None
    sides = [float(item[0]) for item in tagged]
    a, b, c = sides
    if min(sides) <= 0:
        return None
    if a + b <= c or a + c <= b or b + c <= a:
        return (
            "Those three lengths do not form a triangle. "
            "Each side has to be shorter than the other two added together."
        )
    perimeter = a + b + c
    semi = perimeter / 2
    area = math.sqrt(semi * (semi - a) * (semi - b) * (semi - c))
    return (
        f"**Trigonometry — triangle**\n\n"
        f"Sides { _fmt(a) } {unit}, { _fmt(b) } {unit}, { _fmt(c) } {unit}.\n\n"
        f"Perimeter P = a + b + c = **{_fmt(perimeter)} {unit}**.\n\n"
        f"Surface here means the area. Heron's formula uses the semi-perimeter "
        f"s = P / 2 = {_fmt(semi)} {unit}:\n\n"
        f"Area = √[s(s−a)(s−b)(s−c)] = **{_fmt(area)} {unit}²**.\n\n"
        "The word surface in this question is the triangle's area."
    )


def domain_reply(message: str) -> str | None:
    """Method card for a subject question. None when the turn should stay on search or code."""
    solved = _triangle_answer(message)
    if solved:
        return solved
    card = match_card(message)
    if not card:
        return None
    formulas = _relevant_formulas(card, message)
    lines = [
        f"**{card.get('title')}** — local method card",
        "",
        str(card.get("scope") or ""),
        "",
        "Method:",
    ]
    lines.extend(f"{i}. {step}" for i, step in enumerate(card.get("method") or [], 1))
    if formulas:
        lines.append("")
        lines.append("Formulas for this question:")
        for formula in formulas[:6]:
            lines.append(f"- **{formula.get('name')}**: `{formula.get('expr')}` — {formula.get('use')}")
    if card.get("checks"):
        lines.append("")
        lines.append("Checks: " + " ".join(str(item) for item in card.get("checks") or []))
    if card.get("limits"):
        lines.append("")
        lines.append("Limits: " + " ".join(str(item) for item in card.get("limits") or []))
    return "\n".join(lines)


def valid_card(card: dict) -> list[str]:
    errors = []
    for key in _REQUIRED:
        if key not in card:
            errors.append(f"missing {key}")
    if not card.get("triggers"):
        errors.append("no triggers")
    if len(card.get("method") or []) < 4:
        errors.append("method too short")
    if len(card.get("formulas") or []) < 4:
        errors.append("need at least 4 formulas")
    return errors
