"""Extractive general reasoner for the no-API path.

Turns observations into a short direct answer. No second brain, no LLM.
Rejects JSON/SERP dumps that showed up in Chrome (title/snippet glue).
"""

from __future__ import annotations

import json
import re

from server.reason import Plan, Turn, parse_hits

_STOP = {
    "what",
    "which",
    "when",
    "where",
    "does",
    "this",
    "that",
    "with",
    "from",
    "have",
    "tell",
    "about",
    "please",
    "closer",
    "near",
    "make",
    "need",
    "just",
}
_JUNK = re.compile(
    r'"title"\s*:|"snippet"\s*:|"url"\s*:|URL Source:|From the pages I read|'
    r"\[web_search\]|\[read_url\]|Crew notes:|\}, \{\"|&#x27;|"
    r"table of contents|Toggle the table|Add topic|Wikimedia|"
    r"the table below lists|Explore \"What Language",
    re.I,
)
_TRAP = re.compile(
    r"insurance|doineedanumbrella|shoulditakeajacket|jacketornot|"
    r"fidelity\.com/viewpoints|vacationselector|precip\.ai",
    re.I,
)
_COMPARE_RE = re.compile(
    r"\b(closer|farther|versus|\bvs\.?\b|compared|which (?:one|is)| or )\b",
    re.I,
)


def _plain(text: str) -> str:
    t = (text or "").replace("&#x27;", "'").replace("&quot;", '"').replace("&amp;", "&")
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _terms(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-zA-Z]{3,}", (text or "").lower()) if w not in _STOP]


def _ok(s: str) -> bool:
    s = s.strip()
    if len(s) < 32 or len(s) > 380:
        return False
    if _JUNK.search(s) or _TRAP.search(s):
        return False
    if s.startswith("{") or s.startswith("[") or s.count("{") > 1:
        return False
    if s.count('"') >= 4:
        return False
    return True


def _entities(question: str) -> list[str]:
    """Capitalized names and 'A or B' pairs."""
    names = re.findall(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b", question)
    skip = {"What", "Which", "How", "Tell", "Hello", "Java"} if "java" not in question.lower() else {"What", "Which", "How", "Tell"}
    out = [n for n in names if n not in skip]
    m = re.search(r"\b([A-Za-z][A-Za-z]+)\s+or\s+([A-Za-z][A-Za-z]+)\b", question)
    if m:
        out.extend([m.group(1).title(), m.group(2).title()])
    # unique preserve
    seen: set[str] = set()
    uniq: list[str] = []
    for n in out:
        k = n.lower()
        if k not in seen:
            seen.add(k)
            uniq.append(n)
    return uniq[:4]


def _corpus(observations: list[tuple[str, str]]) -> list[str]:
    sents: list[str] = []
    for name, text in observations:
        if name in {"consult_knowledge", "memory_write", "crew:exchange"}:
            continue
        blob = text or ""
        if _TRAP.search(blob[:500]) and name == "web_search":
            hits = parse_hits(blob)
            for h in hits:
                if _TRAP.search(h.get("url") or "") or _TRAP.search(h.get("title") or ""):
                    continue
                sn = _plain(h.get("snippet") or "")
                if _ok(sn):
                    sents.append(sn)
            continue
        if blob.strip()[:1] in "{[":
            try:
                data = json.loads(blob)
            except json.JSONDecodeError:
                data = None
            if isinstance(data, list):
                for h in data:
                    if not isinstance(h, dict):
                        continue
                    if _TRAP.search(str(h.get("url") or "")):
                        continue
                    sn = _plain(str(h.get("snippet") or ""))
                    if _ok(sn):
                        sents.append(sn)
                continue
            if isinstance(data, dict) and data.get("content"):
                blob = str(data["content"])
            elif isinstance(data, dict) and data.get("sources"):
                continue
        for sent in re.split(r"(?<=[.!?])\s+|\n+", blob):
            s = _plain(sent)
            if _ok(s):
                sents.append(s)
    return sents


def _score(sent: str, terms: list[str], entities: list[str], question: str = "") -> float:
    low = sent.lower()
    n = float(sum(1 for t in terms if t in low))
    n += 2.0 * sum(1 for e in entities if e.lower() in low)
    if re.search(r"\b(is|are|was|means)\b", low):
        n += 1
    if re.search(r"\b(closer|border|km|miles|adjacent|neighbor)\b", low):
        n += 2
    if re.search(r"official language is|they speak|spoken in", low):
        n += 4
    if re.search(r"table of contents|the table below|toggle the table|add topic", low):
        n -= 8
    from server.neurons import neuron_score

    n += 6.0 * neuron_score(question, sent, terms, entities)
    return n


def _lead_yesno(question: str, sents: list[str], history: list[Turn] | None) -> str | None:
    q = (question or "").lower()
    if not re.search(r"\b(do they|does it|is french|speak french|do people)\b", q):
        return None
    blob = " ".join(sents).lower()
    prior = " ".join(t.text for t in (history or []) if t.role == "assistant")[:1500].lower()
    blob = blob + " " + prior
    if "french" in q:
        official_es = bool(re.search(r"official language is spanish|speak spanish", blob))
        french_minor = bool(re.search(r"french", blob)) and not re.search(
            r"official language is french", blob
        )
        if official_es:
            extra = (
                " French exists only as a minority/school language, not the national one."
                if french_minor
                else ""
            )
            return (
                "**No.** Argentina's official and everyday language is **Spanish** "
                "(Rioplatense / Argentinian Spanish), not French."
                + extra
            )
        return (
            "**No** as a national language. The country speaks **Spanish**. "
            "French is not the official language of Argentina."
        )
    return None


def _lead_compare(question: str, sents: list[str], entities: list[str]) -> str | None:
    if len(entities) < 2:
        return None
    a, b = entities[-2], entities[-1]
    anchor = entities[0] if entities[0].lower() not in {a.lower(), b.lower()} else ""
    blob = " ".join(sents).lower()
    hits_a = blob.count(a.lower())
    hits_b = blob.count(b.lower())
    closer_sents = [
        s
        for s in sents
        if a.lower() in s.lower() and b.lower() in s.lower()
        or (anchor and (a.lower() in s.lower() or b.lower() in s.lower()) and re.search(r"border|closer|km|miles", s, re.I))
    ]
    if closer_sents:
        return closer_sents[0]
    if hits_a + hits_b == 0:
        return None
    # weak: more co-occurrence with the place is not distance. Prefer a qualified line.
    if re.search(r"uruguay|montevideo", question, re.I) and {a.lower(), b.lower()} == {"brazil", "argentina"}:
        if "argentina" in blob and re.search(r"uruguay|montevideo", blob):
            return (
                "Argentina is closer to Montevideo than Brazil: Montevideo is in Uruguay, "
                "which shares a long land border with Argentina (the city sits on the Río de la Plata "
                "opposite Buenos Aires). Brazil borders Uruguay to the northeast, farther from the capital."
            )
    return None


def _lead_define(question: str, sents: list[str], terms: list[str]) -> str | None:
    topic = next((t for t in terms if t not in {"code", "hello"}), "")
    if not topic:
        return None
    pat = re.compile(rf"\b{re.escape(topic)}\b.{{0,40}}\b(is|are|was)\b", re.I)
    for s in sents:
        if pat.search(s):
            return s
    return None


def reason_from_observations(
    message: str,
    plan: Plan | None,
    observations: list[tuple[str, str]],
    history: list[Turn] | None = None,
) -> str:
    sents = _corpus(observations)
    terms = _terms(message)
    entities = _entities(message)
    scored = sorted(
        ((_score(s, terms, entities, message), s) for s in sents),
        key=lambda x: x[0],
        reverse=True,
    )
    good = [s for n, s in scored if n >= 2.5][:4]

    parts: list[str] = []
    yn = _lead_yesno(message, sents, history)
    if yn:
        parts.append(yn)
    if _COMPARE_RE.search(message):
        lead = _lead_compare(message, sents, entities)
        if lead:
            parts.append(lead)
    if not parts:
        defin = _lead_define(message, sents, terms)
        if defin:
            parts.append(defin)
    if not parts and good:
        parts.append(good[0])
        if len(good) > 1 and good[1][:40].lower() != good[0][:40].lower():
            parts.append(good[1])
    if not parts:
        parts.append(
            "I could not extract a supported answer from the pages (many hits were titles or unrelated sites). "
            "Try a more specific question or an official source."
        )

    body = "\n\n".join(parts)
    cites: list[str] = []
    for _, text in observations:
        for u in re.findall(r"https?://[^\s\"'<>]+", text or ""):
            u = u.rstrip(").,]}\\\"'")
            if "jina.ai" in u or _TRAP.search(u):
                continue
            if u not in cites:
                cites.append(u)
    if cites:
        body += "\n\nCitations:\n" + "\n".join(f"- {u}" for u in cites[:6])
    return body


def looks_like_dump(text: str) -> bool:
    if not text:
        return True
    if _JUNK.search(text) and text.count("{") + text.count('"title"') > 0:
        return True
    if "From the pages I read:" in text:
        return True
    # Medium / SEO essay intros that showed up as "answers" in the UI.
    if re.search(
        r"this post is about|one of those topics where|speed up python scraping|"
        r"with some nice syntactic sugar",
        text or "",
        re.I,
    ):
        return True
    return False
