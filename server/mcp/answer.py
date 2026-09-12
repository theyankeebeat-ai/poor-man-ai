from __future__ import annotations

import json
import re
from typing import Any

from server.reason import Plan, Turn, parse_hits

_JUNK = re.compile(
    r'"title"\s*:|"snippet"\s*:|"url"\s*:|URL Source:|From the pages I read|'
    r"\[web_search\]|\[read_url\]|Crew notes:",
    re.I,
)
_CODE_FENCE = re.compile(r"```(?:java|Java)?\s*\n(.*?)```", re.S)
_PRINTLN = re.compile(
    r"((?:public\s+)?class\s+\w+\s*\{.*?System\.out\.println\s*\([^)]*\)\s*;.*?\n\s*\})",
    re.S,
)


def _plain(text: str) -> str:
    t = re.sub(r"\s+", " ", text or "").strip()
    t = t.replace("&#x27;", "'").replace("&quot;", '"').replace("&amp;", "&")
    return t


def _ok_sent(s: str) -> bool:
    s = s.strip()
    if len(s) < 28 or len(s) > 420:
        return False
    if _JUNK.search(s) or s.startswith("{") or s.startswith("["):
        return False
    if s.count("{") > 0 and s.count("title") > 0:
        return False
    return True


def _citations(observations: list[tuple[str, str]]) -> list[str]:
    urls: list[str] = []
    for _, text in observations:
        for u in re.findall(r"https?://[^\s\"'<>]+", text):
            u = u.rstrip(").,]}\\\"'")
            if u not in urls and "jina.ai" not in u:
                urls.append(u)
    return urls[:8]


def _hits(observations: list[tuple[str, str]]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for name, text in observations:
        if name != "web_search":
            continue
        for h in parse_hits(text):
            sn = _plain(h.get("snippet") or "")
            if _ok_sent(sn) or (sn and not _JUNK.search(sn)):
                out.append(
                    {
                        "title": _plain(h.get("title") or ""),
                        "url": h.get("url") or "",
                        "snippet": sn[:400],
                    }
                )
    return out


def _pages(observations: list[tuple[str, str]]) -> list[str]:
    pages: list[str] = []
    for name, text in observations:
        if name == "read_url" and text and not text.startswith("{"):
            pages.append(text[:12000])
        elif name == "read_url":
            try:
                data = json.loads(text)
                if isinstance(data, dict) and data.get("content"):
                    pages.append(str(data["content"])[:12000])
            except json.JSONDecodeError:
                pages.append(text[:12000])
    return pages


def _code_blocks(pages: list[str]) -> list[str]:
    found: list[str] = []
    for p in pages:
        for m in _CODE_FENCE.findall(p):
            body = m.strip()
            if "println" in body or "class " in body:
                found.append(body[:1200])
        for m in _PRINTLN.findall(p):
            body = m.strip()
            if body not in found:
                found.append(body[:1200])
    return found[:2]


def _def_sentences(question: str, hits: list[dict[str, str]], pages: list[str]) -> list[str]:
    terms = [w for w in re.findall(r"[a-zA-Z]{3,}", question) if w.lower() not in {"what", "how", "the", "make", "code"}]
    topic = terms[0] if terms else ""
    cands: list[str] = []
    for h in hits:
        sn = h.get("snippet") or ""
        if topic and re.search(rf"\b{re.escape(topic)}\b", sn, re.I) and _ok_sent(sn):
            cands.append(sn)
    blob = "\n".join(pages)
    for sent in re.split(r"(?<=[.!?])\s+", blob):
        s = _plain(sent)
        if topic and re.search(rf"^{re.escape(topic)}\b is\b", s, re.I) and _ok_sent(s):
            cands.insert(0, s[:360])
        elif _ok_sent(s) and topic and topic.lower() in s.lower() and " is " in s.lower():
            cands.append(s[:360])
    seen: set[str] = set()
    out: list[str] = []
    for c in cands:
        k = c.lower()[:80]
        if k not in seen:
            seen.add(k)
            out.append(c)
        if len(out) >= 4:
            break
    return out


def _howto(question: str, pages: list[str], hits: list[dict[str, str]]) -> str | None:
    q = question.lower()
    if not re.search(r"\b(how|code|example|hello|program|write|make)\b", q):
        return None
    codes = _code_blocks(pages)
    hello = bool(re.search(r"hello\s*wor", q))
    if hello and not codes:
        codes = [
            "public class HelloWorld {\n"
            "    public static void main(String[] args) {\n"
            '        System.out.println("Hello, World!");\n'
            "    }\n"
            "}"
        ]
    if not codes and not hello:
        return None
    steps = [
        "1. Install a JDK (Oracle or OpenJDK) and confirm `javac -version` works.",
        "2. Save the program as `HelloWorld.java` (file name must match the public class).",
        "3. Compile: `javac HelloWorld.java`",
        "4. Run: `java HelloWorld`",
    ]
    code = codes[0] if codes else ""
    intro = "A minimal Java program prints a line from `main`:"
    if hello:
        intro = "Hello World in Java is a public class with a `main` method that prints a line:"
    parts = [intro, "", "```java", code.strip(), "```", "", *steps]
    return "\n".join(parts)


def _llm_answer(message: str, history: list[Turn], evidence: str) -> str | None:
    try:
        from server.tools import chat_model, openai_client
    except Exception:
        return None
    client = openai_client()
    if not client:
        return None
    prior = "\n".join(f"{t.role}: {t.text[:400]}" for t in (history or [])[-6:])
    try:
        resp = client.chat.completions.create(
            model=chat_model(),
            temperature=0.2,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Write the user-facing final answer. Be engaging, direct, and conversational. "
                        "Automatically detect the user's language from their input (text or speech) and answer in the exact same language with flawless grammar and natural native phrasing. "
                        "When having a normal conversation, be natural, warm, empathetic, and thoughtful without stiff or robotic declarations. "
                        "Use the evidence when answering factual queries. For how-to, include working code in a fenced block. "
                        "Do not dump JSON, SERP titles, or tool logs. "
                        "Only include citations if web evidence was used. "
                        "Follow-ups stay on the same topic as the thread."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Thread:\n{prior}\n\nQuestion:\n{message}\n\nEvidence:\n{evidence[:14000]}",
                },
            ],
        )
        text = (resp.choices[0].message.content or "").strip()
        if len(text) < 40 or _JUNK.search(text):
            return None
        return text
    except Exception:
        return None


_WEATHER_Q = re.compile(
    r"\b(weather|forecast|temperature|temp|rain|umbrella|humid|wind|°[cf]|celsius|fahrenheit)\b",
    re.I,
)
_TRAVEL_Q = re.compile(
    r"\b(arrive|left at|eta|how long|travel time|drive|train|flight|commute)\b",
    re.I,
)


def _motion(question: str) -> str | None:
    q = question.lower()
    # Wind speed in weather reports is km/h — never treat those as a road problem.
    if _WEATHER_Q.search(q) and not _TRAVEL_Q.search(q):
        return None
    if not _TRAVEL_Q.search(q):
        return None
    if not re.search(r"\b(mph|miles|km/h|kph|km|mi)\b", q):
        return None
    dist = re.search(r"(\d+(?:\.\d+)?)\s*(miles|mi|km)\b", q)
    spd = re.search(r"(\d+(?:\.\d+)?)\s*(mph|km/h|kph)\b", q)
    clock = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b", q)
    if not dist or not spd:
        return None
    d = float(dist.group(1))
    s = float(spd.group(1))
    if s <= 0:
        return None
    hours = d / s
    d_u = "miles" if dist.group(2).startswith("mi") else "km"
    s_u = spd.group(2)
    lines = [
        f"**{hours:g} hours** of travel ({d:g} {d_u} ÷ {s:g} {s_u}).",
    ]
    if clock:
        h = int(clock.group(1)) % 12
        m = int(clock.group(2) or 0)
        if clock.group(3).lower().startswith("p"):
            h += 12
        total = int(h * 60 + m + round(hours * 60)) % (24 * 60)
        hh, mm = divmod(total, 60)
        ap = "AM" if hh < 12 else "PM"
        h12 = hh % 12 or 12
        lines.insert(0, f"It arrives at **{h12}:{mm:02d} {ap}**.")
    return "\n\n".join(lines)


_MEDIA_TOOLS = (
    "youtube_summarize",
    "read_image",
    "local_video_summarize",
    "generate_image",
)


def _media_answer(observations: list[tuple[str, str]]) -> str | None:
    """Prefer concrete media-tool output over SERP dumps."""
    parts: list[str] = []
    for name, text in observations:
        if name not in _MEDIA_TOOLS or not (text or "").strip():
            continue
        if text.startswith("error:") or text.startswith("timeout"):
            parts.append(f"**{name}:** {text[:500]}")
            continue
        if name == "generate_image":
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                parts.append(text[:2000])
                continue
            status = data.get("status") or ""
            path = data.get("path") or ""
            if status in {"ok", "placeholder_png"} and path:
                parts.append(f"Generated image: {path}")
                if data.get("note"):
                    parts.append(str(data["note"]))
            elif status == "error":
                parts.append(f"Image generation failed: {data.get('error')}")
            else:
                parts.append(text[:1500])
            continue
        if name == "read_image":
            try:
                data = json.loads(text)
                desc = data.get("description") or data.get("ocr_text") or ""
                if desc:
                    parts.append(desc[:3000])
                    continue
            except json.JSONDecodeError:
                pass
            parts.append(text[:3000])
            continue
        # youtube / local video summaries are already prose
        parts.append(text[:4000])
    if not parts:
        return None
    return "\n\n".join(parts)


def compose_answer(
    message: str,
    plan: Plan,
    observations: list[tuple[str, str]],
    history: list[Turn] | None = None,
) -> str:
    hits = _hits(observations)
    pages = _pages(observations)
    cites = _citations(observations)
    ev_lines = []
    for h in hits[:8]:
        ev_lines.append(f"- {h.get('title')}: {h.get('snippet')} ({h.get('url')})")
    for p in pages[:3]:
        ev_lines.append(p[:2500])
    for name, text in observations:
        if name in _MEDIA_TOOLS:
            ev_lines.append(f"[{name}]\n{text[:2500]}")
    evidence = "\n".join(ev_lines)

    from server.local_brain import cheap_answer

    weatherish = bool(_WEATHER_Q.search(message or ""))
    has_wx = any(n == "weather_compare" for n, _ in observations)

    # Weather always uses live API observations. Never cheap-math or travel-time.
    if weatherish or has_wx:
        from server.reason import _from_structured, synthesize

        for name, text in observations:
            if name != "weather_compare":
                continue
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                continue
            if isinstance(data, dict) and data.get("sources"):
                tape = _from_structured(data, plan, (message or "").lower())
                if tape.strip() and "hours** of travel" not in tape:
                    cites_wx = [u for u in cites if "wttr.in" in u or "open-meteo" in u or "met.no" in u]
                    if cites_wx:
                        return tape + "\n\nCitations:\n" + "\n".join(f"- {u}" for u in cites_wx[:6])
                    return tape
        wx = synthesize(message, plan, observations, history)
        if wx and "hours** of travel" not in wx:
            return wx

    local = cheap_answer(message, history or [])
    if local and not weatherish:
        return local

    media = _media_answer(observations)
    if media:
        body = media
        if cites:
            body += "\n\nCitations:\n" + "\n".join(f"- {u}" for u in cites[:6])
        return body

    motion = _motion(message)
    if motion and not weatherish:
        body = motion
        if cites:
            body += "\n\nCitations:\n" + "\n".join(f"- {u}" for u in cites[:6])
        return body

    from server.local_reason import looks_like_dump, reason_from_observations

    llm = _llm_answer(message, history or [], evidence)
    if llm and not looks_like_dump(llm):
        return llm

    howto = _howto(message, pages, hits)
    if howto and re.search(r"\b(how|code|hello|program|write|make)\b", message, re.I):
        body = howto
        if cites:
            body += "\n\nCitations:\n" + "\n".join(f"- {u}" for u in cites[:6])
        return body

    return reason_from_observations(message, plan, observations, history or [])


async def final_answer(args: dict[str, Any]) -> str:
    from server.reason import plan_from

    message = str(args.get("message") or args.get("question") or "")
    draft = str(args.get("draft") or "")
    obs_in = args.get("observations") or []
    pairs: list[tuple[str, str]] = []
    for item in obs_in:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            pairs.append((str(item[0]), str(item[1])))
        elif isinstance(item, dict):
            pairs.append((str(item.get("name") or "obs"), str(item.get("text") or "")))
    hist_in = args.get("history") or []
    history: list[Turn] = []
    for item in hist_in:
        if isinstance(item, dict) and item.get("text"):
            history.append(Turn(role=str(item.get("role") or "user"), text=str(item["text"])[:2000]))
    plan = plan_from(message, history)
    text = compose_answer(message, plan, pairs, history)
    if draft and len(text) < 40:
        text = draft
    return text
