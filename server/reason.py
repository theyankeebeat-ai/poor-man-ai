from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

FOLLOW_RE = re.compile(
    r"\b(it|they|them|their|there|today|tonight|tomorrow|this|that|"
    r"the same|also|and|do they|does it)\b",
    re.I,
)


@dataclass
class Turn:
    role: str
    text: str


@dataclass
class Plan:
    goal: str
    search_queries: list[str]
    location: str | None = None
    units: str = "metric"  # metric | imperial
    fetch_urls: int = 2
    notes: list[str] = field(default_factory=list)
    mode: str = "research"  # chat | calc | howto | research


def _plain(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


_LOC_STOP = {
    "imperial",
    "metric",
    "celsius",
    "fahrenheit",
    "units",
    "unit",
    "today",
    "tonight",
    "tomorrow",
    "please",
    "the",
    "a",
    "an",
    "in",
    "for",
    "at",
    "near",
    "when",
    "should",
    "use",
    "using",
    "with",
    "from",
    "react",
    "fastapi",
    "asyncio",
    "node",
    "vite",
    "java",
    "python",
    "javascript",
    "typescript",
    "rust",
    "kotlin",
    "golang",
    "ruby",
    "php",
    "html",
    "css",
    "code",
    "hello",
    "world",
    "program",
}


def location_from(text: str) -> str | None:
    m = re.search(r"\b(?:in|for|at|near)\s+(.+)", text, re.I)
    if not m:
        return None
    words: list[str] = []
    for w in re.findall(r"[A-Za-z][\w'-]*", m.group(1)):
        if w.lower() in _LOC_STOP:
            break
        words.append(w)
        if len(words) >= 3:
            break
    if not words:
        return None
    return " ".join(words).title()


def units_from(text: str) -> str | None:
    t = text.lower()
    if re.search(r"\b(imperial|fahrenheit|\bf\b|°f|mph)\b", t):
        return "imperial"
    if re.search(r"\b(metric|celsius|\bc\b|°c|km/h)\b", t):
        return "metric"
    return None


def plan_from(message: str, history: list[Turn]) -> Plan:
    from server.local_brain import think

    thought = think(message, history)
    loc = thought.get("location") or location_from(message)
    units = str(thought.get("units") or units_from(message) or "metric")
    mode = str(thought.get("mode") or "research")
    goal = str(thought.get("goal") or message)
    follow = thought.get("follow_up") == "yes"
    qout = list(thought.get("queries") or [])
    notes = [f"Mode: {mode} (one think, handlers not parallel brains)."]
    if follow:
        notes.append("Follow-up: reuse location/units from earlier turns.")
    if loc:
        notes.append(f"Place: {loc}")
    notes.append(f"Units: {units}")
    if thought.get("cheap"):
        notes.append("Cheap handler — skip web.")
    fetch = int(thought.get("fetch_urls") or 0)
    return Plan(
        goal=goal,
        search_queries=qout,
        location=loc or None,
        units=units,
        notes=notes,
        fetch_urls=fetch,
        mode=mode,
    )


def parse_hits(raw: str) -> list[dict[str, str]]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if isinstance(data, dict) and data.get("error"):
        return []
    if not isinstance(data, list):
        return []
    out = []
    for item in data:
        if not isinstance(item, dict):
            continue
        out.append(
            {
                "title": str(item.get("title") or ""),
                "url": str(item.get("url") or ""),
                "snippet": str(item.get("snippet") or "")[:400],
            }
        )
    return out


def _nums(text: str) -> list[float]:
    found = re.findall(r"-?\d+(?:\.\d+)?", text)
    vals = []
    for x in found:
        try:
            vals.append(float(x))
        except ValueError:
            continue
    return vals


def synthesize(
    message: str,
    plan: Plan,
    observations: list[tuple[str, str]],
    history: list[Turn] | None = None,
) -> str:
    """Answer from tool observations. General, not weather-only."""
    q = message.lower()
    chunks: list[str] = []
    cites: list[str] = []
    for name, text in observations:
        chunks.append(f"[{name}] {text[:4000]}")
        for m in re.findall(r"https?://[^\s\"']+", text):
            if m not in cites:
                cites.append(m)
    corpus = "\n".join(chunks).lower()
    raw_corpus = "\n".join(chunks)

    lines: list[str] = []

    # Structured JSON blobs (any tool)
    for name, text in observations:
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and data.get("sources"):
            lines.append(_from_structured(data, plan, q))

    rainish = bool(re.search(r"\b(rain|precip|shower|storm|drizzle|umbrella|wet)\b", q))
    wear = bool(re.search(r"\b(jacket|coat|layers?|cold|warm|what (?:do|should) i wear)\b", q))
    umbrella = bool(re.search(r"\bumbrell?a\b", q))

    precip = 0.0
    for name, text in observations:
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        for s in data.get("sources") or []:
            if not isinstance(s, dict):
                continue
            desc = str(s.get("desc") or "").lower()
            if "rain" in desc or "shower" in desc:
                precip = max(precip, 1.0)
            p = s.get("precip")
            try:
                if p is not None:
                    precip = max(precip, float(p))
            except (TypeError, ValueError):
                pass
    structured_dry = False
    for name, text in observations:
        if name != "weather_compare":
            continue
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            continue
        descs = " ".join(
            str(s.get("desc") or "")
            for s in (data.get("sources") or [])
            if isinstance(s, dict)
        ).lower()
        if re.search(r"sun|clear|fair", descs) and not re.search(
            r"rain|shower|storm", descs
        ):
            structured_dry = True

    if not structured_dry and re.search(r"\brain\b|\bshower\b|\bstorm\b", corpus):
        precip = max(precip, 0.5)

    temps_c: list[float] = []
    for t in history or []:
        for f in re.findall(r"(\d+(?:\.\d+)?)\s*°F", t.text):
            temps_c.append((float(f) - 32) * 5 / 9)
        for c in re.findall(r"(\d+(?:\.\d+)?)\s*°C", t.text):
            temps_c.append(float(c))
    for name, text in observations:
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        for s in data.get("sources") or []:
            if not isinstance(s, dict):
                continue
            for k in ("current_c", "temp_c", "air_temp_c", "today_min_c", "today_max_c"):
                try:
                    if s.get(k) is not None:
                        temps_c.append(float(s[k]))
                except (TypeError, ValueError):
                    pass

    if rainish or umbrella:
        if precip >= 0.5 and not structured_dry:
            lines.append(
                "Yes — sources mention rain or showers, so an umbrella is warranted."
                if umbrella
                else "Yes — precipitation shows up in the sources for this period."
            )
        elif structured_dry or (re.search(r"\bsunny\b|\bclear\b|\bfair\b", corpus) and precip == 0):
            lines.append(
                "No — sources look dry/sunny; an umbrella is optional."
                if umbrella
                else "Unlikely — sources look dry for this period."
            )
        else:
            lines.append(
                "Unclear from the snippets. Check the cited forecasts before you go out."
            )

    if wear and temps_c:
        t = sum(temps_c) / len(temps_c)
        tf = t * 9 / 5 + 32
        if t <= 8:
            rec = "a coat (cold)"
        elif t <= 16:
            rec = "a light jacket or sweater"
        else:
            rec = "no heavy coat; a light layer at most"
        if plan.units == "imperial":
            lines.append(f"Around {tf:.0f}°F — {rec}.")
        else:
            lines.append(f"Around {t:.0f}°C — {rec}.")
    elif wear:
        lines.append("Not enough temperature readings in the results to pick jacket vs coat.")

    if not lines:
        # Generic: pull the most query-overlapping sentences
        terms = [w for w in re.findall(r"[a-z]{3,}", q) if w not in {"the", "and", "for", "how", "need"}]
        scored: list[tuple[int, str]] = []
        for sent in re.split(r"(?<=[.!?])\s+|\n+", raw_corpus):
            s = _plain(sent)
            if len(s) < 40 or s.startswith("{") or s.startswith("["):
                continue
            score = sum(1 for t in terms if t in s.lower())
            if score:
                scored.append((score, s[:280]))
        scored.sort(key=lambda x: x[0], reverse=True)
        if scored:
            from server.local_reason import looks_like_dump, reason_from_observations

            reasoned = reason_from_observations(message, plan, observations, history)
            if reasoned and not looks_like_dump(reasoned):
                return reasoned
            lines.append(scored[0][1])
            if len(scored) > 1:
                lines.append(scored[1][1])
        else:
            lines.append(
                "I searched and opened sources, but could not extract a confident answer. "
                "See citations."
            )

    loc = plan.location or ""
    header = f"**{plan.goal}**"
    if loc:
        header += f" · {loc}"
    if plan.units == "imperial":
        header += " · imperial"
    out = [header, ""] + lines
    if cites:
        out += ["", "Citations:"]
        for u in cites[:8]:
            out.append(f"- {u}")
    out.append(
        "\nAnswered from live web/API observations, not a trained model. Follow-ups reuse this thread."
    )
    return "\n".join(out)


def _from_structured(data: dict[str, Any], plan: Plan, q: str) -> str:
    geo = data.get("geo") or {}
    loc = ", ".join(
        str(x) for x in (geo.get("name"), geo.get("country")) if x
    ) or plan.location or ""
    bits = []
    imperial = plan.units == "imperial"

    def temp(c: Any) -> str:
        try:
            v = float(c)
        except (TypeError, ValueError):
            return str(c)
        if imperial:
            return f"{v * 9 / 5 + 32:.0f}°F"
        return f"{v:.1f}°C"

    def wind(kmh: Any) -> str:
        try:
            v = float(kmh)
        except (TypeError, ValueError):
            return str(kmh)
        if imperial:
            return f"{v * 0.621371:.0f} mph"
        return f"{v:.0f} km/h"

    for s in data.get("sources") or []:
        if not isinstance(s, dict) or s.get("error"):
            continue
        name = s.get("name")
        t = s.get("current_c") or s.get("temp_c") or s.get("air_temp_c")
        parts = [str(name)]
        if t is not None:
            parts.append(temp(t))
        if s.get("desc"):
            parts.append(str(s["desc"]))
        w = s.get("wind_kmh") or s.get("wind_kmph")
        if w is not None:
            parts.append(wind(w))
        if s.get("humidity") is not None:
            parts.append(f"{s['humidity']}% RH")
        bits.append(" · ".join(parts))
    cc = data.get("cross_check") or {}
    extra = ""
    if cc.get("min_c") is not None:
        extra = f" Spread {temp(cc['min_c'])}–{temp(cc['max_c'])}."
    return (f"{loc}: " if loc else "") + "; ".join(bits) + extra
