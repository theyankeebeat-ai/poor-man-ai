"""One local brain: think() decides, then a handler.

Cheap: chat / calc / memory (skip web).
Web + one crew board: weather / howto / media / research.
Not a second process and not superhuman.
"""

from __future__ import annotations

import ast
import operator
import re
from typing import Any

from server.mcp.hooks import classify_intent, thread_entities
from server.mcp.knowledge import consult
from server.reason import Turn, location_from, units_from

# Modes think() may return. Each has one handler — not a parallel brain.
MODES = ("chat", "calc", "memory", "weather", "howto", "media", "research", "code", "domain")
CHEAP = frozenset({"chat", "calc", "memory", "domain"})

CHAT_RE = re.compile(
    r"^\s*(hi|hello|hey|yo|thanks|thank you|thx|ok|okay|cool|bye|goodbye|"
    r"how are you|what(?:'s| is) your name|who are you|what can you do|"
    r"help|good morning|good night|"
    r"bonjour|salut|coucou|merci|merci beaucoup|au revoir|bonne nuit|"
    r"comment (?:vas-tu|allez-vous|ca va|ça va)|qui es-tu|qui êtes-vous|que peux-tu faire|"
    r"hola|buenos d[ií]as|buenas tardes|buenas noches|gracias|muchas gracias|adi[oó]s|chao|"
    r"c[oó]mo est[aá]s|qui[eé]n eres|qu[eé] puedes hacer|ayuda|"
    r"привет|здравствуй|здравствуйте|доброе утро|добрый день|добрый вечер|спокойной ночи|"
    r"спасибо|большое спасибо|пока|до свидания|как дела|кто ты|что ты умеешь|помощь)\s*[.!?]*\s*$",
    re.I,
)

# Short social turns ("hi again", "hey there", "thanks so much") stay on the
# chat handler. Anything with a real question still falls through to research.
SOCIAL_RE = re.compile(
    r"^\s*(?:hi|hello|hey|yo|thanks|thank you|thx|ok|okay|cool|bye|goodbye|"
    r"yes|yeah|yep|no|nope|sure|great|nice|lol|haha|sup|"
    r"hola|salut|bonjour|merci)"
    r"(?:[\s,]+(?:again|there|you|ya|all|friend|buddy|pal|mate|please|"
    r"so much|very much|a lot)){0,3}"
    r"\s*[.!?]*\s*$",
    re.I,
)

META_RE = re.compile(
    r"\b(what (?:were|are) we (?:talking|discussing)|remind me|"
    r"what did i (?:ask|say)|do you remember|without (?:an? )?api|"
    r"are you (?:a )?human|smarter than)\b",
    re.I,
)
REMEMBER_WRITE_RE = re.compile(
    r"^\s*(?:please\s+)?(?:remember(?:\s+that)?|save(?:\s+to\s+memory)?|note(?:\s+that)?)\s*[:\-]?\s+(.+)$",
    re.I,
)
MEMORY_READ_RE = re.compile(
    r"\b(what do you remember|memory|last time|did i (?:tell|save)|recall|"
    r"what have we (?:saved|stored))\b",
    re.I,
)
CODE_RE = re.compile(
    r"\b(apply_patch|pytest|refactor|fix (?:the )?(?:test|bug|build|lint)|"
    r"yarn\s+(?:lint|install|add|ci|run\b)|npm\s+(?:run\s+\w+|install|ci|i\b|add)|"
    r"pnpm\s+(?:lint|install|i\b|add|run\b)|eslint|"
    r"(?:can you |please )?(?:run|execute)\s+(?:yarn|npm|pnpm|pytest|npx)\b|"
    r"add a (?:route|endpoint|test)|write_file|git diff|"
    r"typescript|fastapi route|tsc --noEmit|failing tests|"
    r"patch (?:the )?(?:file|code)|implement (?:a |the )?|"
    r"create (?:a |the )?(?:vite|react|app|website|project|file)|"
    r"build (?:a |the )?(?:vite|react|app|website|project)|"
    r"generate (?:the )?(?:vite|react|files|app))\b",
    re.I,
)
# "run yarn install in PATH" — execute locally; do not ask Grok for shell tips.
SIMPLE_PKG_RE = re.compile(
    r"(?is)(?:can you |please )?(?:run |execute )?"
    r"(?P<pm>yarn|npm|pnpm)\s+(?P<sub>install|ci|i)\b"
)
HOWTO_RE = re.compile(
    r"\b(how(?:\s+to)?|steps?|install|setup|configure|example|write|program|"
    r"code|hello\s*world)\b",
    re.I,
)
WEATHER_RE = re.compile(
    r"\b(weather|forecast|temperature|temp|rain|umbrella|jacket|°[cf]|humid|wind)\b",
    re.I,
)
MEDIA_RE = re.compile(
    r"\b(youtube|video|image|picture|photo|summarize)\b|https?://(?:www\.)?(?:youtube\.com|youtu\.be)/",
    re.I,
)
SPORTS_RE = re.compile(
    r"\b(nfl|nba|wnba|mlb|nhl|mls|soccer|football|basketball|kickoff|"
    r"monday night|sunday night|this weekend|who(?:'s| is) playing|"
    r"what teams|what time (?:are|is) (?:they|it) playing)\b",
    re.I,
)
_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def _eval_ast(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _eval_ast(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval_ast(node.operand))
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval_ast(node.left), _eval_ast(node.right))
    raise ValueError("unsupported")


def try_math(message: str) -> str | None:
    """Arithmetic only — skips web. Handles '2 plus 2' and trailing instructions."""
    raw = (message or "").strip()
    # Drop trailing English instructions ("Reply with just the number.")
    head = re.split(
        r"[.!?]\s+(?:reply|answer|just|only|please|give|show|return)\b",
        raw,
        maxsplit=1,
        flags=re.I,
    )[0]
    expr = re.sub(
        r"^\s*(?:what(?:'s| is)|calculate|compute|how much is)\s*",
        "",
        head.strip(),
        flags=re.I,
    )
    expr = expr.rstrip(".!?").replace("×", "*").replace("÷", "/")
    # Word operators → symbols (before stripping spaces).
    expr = re.sub(r"\s+plus\s+", "+", expr, flags=re.I)
    expr = re.sub(r"\s+minus\s+", "-", expr, flags=re.I)
    expr = re.sub(r"\s+(?:times|multiplied\s+by)\s+", "*", expr, flags=re.I)
    expr = re.sub(r"\s+(?:divided\s+by|over)\s+", "/", expr, flags=re.I)
    expr = re.sub(r"\s+", "", expr).replace("^", "**")
    if not re.fullmatch(r"[0-9+\-*/().%*]+", expr or ""):
        return None
    try:
        val = _eval_ast(ast.parse(expr, mode="eval"))
    except Exception:
        return None
    # Prefer bare number when the user asked for "just the number".
    if re.search(r"\bjust\s+the\s+number\b", raw, re.I):
        return str(int(val)) if val == int(val) else f"{val:g}"
    if val == int(val):
        return f"{expr} = **{int(val)}**."
    return f"{expr} = **{val:g}**."


def try_math_followup(message: str, history: list[Turn]) -> str | None:
    """Resolve arithmetic references only against the immediately preceding answer."""
    if not history or history[-1].role != "assistant":
        return None
    previous = re.fullmatch(r"(.+?) = \*\*([+-]?[0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?)\*\*\.", history[-1].text.strip())
    if not previous or try_math(previous[1]) != history[-1].text.strip():
        return None
    reference = r"(?:that(?:\s+(?:result|answer|number))?|the\s+(?:result|answer|number)|it)"
    command = re.fullmatch(
        rf"(?:now\s+)?(divide|multiply)\s+{reference}\s+by\s+([+-]?[0-9]+(?:\.[0-9]+)?)[.!?]?",
        message.strip(), re.I,
    )
    if command:
        symbol = "/" if command[1].lower() == "divide" else "*"
        return try_math(f"{previous[2]}{symbol}{command[2]}")
    if re.fullmatch(r"(?:explain\s+)?why\s+(?:is\s+)?(?:the\s+)?(?:answer|result|that)\s+(?:is\s+)?correct[.!?]?", message.strip(), re.I):
        division = re.fullmatch(r"([+-]?[0-9.]+)/([+-]?[0-9.]+)", previous[1])
        if division:
            return f"{previous[1]} = **{previous[2]}** because {previous[2]} multiplied by {division[2]} equals {division[1]}."
        return f"Evaluating the previous expression, {previous[1]}, gives **{previous[2]}**."
    return None


# classify_intent kinds that lock a domain handler (not "factual" / "followup").
_KIND_MODE = {
    "weather": "weather",
    "howto": "howto",
    "media": "media",
    "memory": "memory",
}


def mode_of(
    message: str,
    history: list[Turn],
    kind: str | None = None,
    goal: str | None = None,
) -> str:
    """Pick one handler. Domain keywords and intent kind beat chat/meta.

    `goal` is the follow-up-expanded question so place/units continuations
    recompute weather/howto instead of freezing the first-match of the short turn.
    """
    raw = (message or "").strip()
    q = (goal or raw).strip()
    # Weather words beat arithmetic. Wind km/h in a forecast is not a calc.
    if WEATHER_RE.search(q) or WEATHER_RE.search(raw):
        return "weather"
    if try_math(raw):
        return "calc"
    if REMEMBER_WRITE_RE.match(raw):
        return "memory"
    intent_kind = kind or classify_intent(raw, history).get("kind")
    domain_on_goal = bool(
        WEATHER_RE.search(q) or HOWTO_RE.search(q) or MEDIA_RE.search(q)
    )
    if (
        MEMORY_READ_RE.search(raw)
        and not WEATHER_RE.search(q)
        and not HOWTO_RE.search(q)
        and not MEDIA_RE.search(q)
    ):
        return "memory"
    if CODE_RE.search(q) or SIMPLE_PKG_RE.search(q) or intent_kind == "code":
        return "code"
    from server.mcp.domains import match_card

    if match_card(q) or match_card(raw):
        return "domain"
    if WEATHER_RE.search(q) or intent_kind == "weather":
        return "weather"
    if MEDIA_RE.search(q) or intent_kind == "media":
        return "media"
    if HOWTO_RE.search(q) or intent_kind == "howto":
        return "howto"
    mapped = _KIND_MODE.get(str(intent_kind or ""))
    if mapped:
        return mapped
    if CHAT_RE.match(raw) or SOCIAL_RE.match(raw):
        return "chat"
    # Meta recap only when the turn is actually about the conversation, not a domain ask.
    if META_RE.search(raw) and not domain_on_goal and len(raw.split()) <= 16:
        return "chat"
    if len(raw) < 3:
        return "chat"
    return "research"


_CODEISH = re.compile(
    r"\b(react|python|fastapi|asyncio|typescript|javascript|node|vite|"
    r"usecallback|usememo|streamingresponse|ndjson|semaphore|api|"
    r"endpoint|hook|component|function|class|import|async)\b",
    re.I,
)
_LEAD_FILLER = re.compile(r"^(?:and|then|also|plus)(?:\s+|,+\s*|$)", re.I)


def ask_parts(message: str) -> list[str]:
    """Split a turn into questions. A pure greeting stays; a greeting glued on does not."""
    text = re.sub(r"\s+", " ", (message or "").strip())
    if not text:
        return []
    pieces: list[str] = []
    for raw in re.split(r"(?<=[.!?])\s+", text):
        part = raw.strip()
        for _ in range(3):
            nxt = _LEAD_FILLER.sub("", part, count=1).strip()
            if nxt == part:
                break
            part = nxt
        if part:
            pieces.append(part)
    if not pieces:
        return []
    if any(not (CHAT_RE.match(p) or SOCIAL_RE.match(p)) for p in pieces):
        pieces = [p for p in pieces if not (CHAT_RE.match(p) or SOCIAL_RE.match(p))]
    return pieces


def _queries(message: str, history: list[Turn], mode: str, loc: str, goal: str) -> list[str]:
    if mode in CHEAP:
        return []
    # If the user prompt specifically asked to read/summarize an explicit URL, skip search queries
    if re.search(r"https?://", goal, re.I) and re.search(
        r"\b(read|open|visit|check|browse|summarize|what is on|inspect)\b", message, re.I
    ):
        return []
    sport_blob = f"{message} {goal}"
    sports = bool(SPORTS_RE.search(sport_blob))
    howto_site = mode == "howto" and bool(
        re.search(r"\bfastapi\b", message, re.I)
        or re.search(r"\breact\b|usecallback|usememo", message, re.I)
        or re.search(r"\basyncio\b|semaphore", message, re.I)
    )
    weather_swap = mode == "weather" and bool(loc)
    media_yt = mode == "media" and "youtube" in message.lower()
    # Site filters, weather, YouTube, and sports replace the list below.
    parts = ask_parts(message)
    multi = len(parts) >= 2 and not (sports or howto_site or weather_swap or media_yt)
    if multi:
        qs: list[str] = list(parts)
    else:
        qs = [goal]
        if loc and loc.lower() not in goal.lower():
            qs.append(f"{goal} {loc}")
        # Geography compare only for place questions — not "A versus B" in code how-tos.
        geo_cmp = re.search(r"\b(closer|farther|which one| or )\b", message, re.I) or (
            re.search(r"\b(versus|\bvs\.?\b)\b", message, re.I) and not _CODEISH.search(message)
        )
        if geo_cmp and not _CODEISH.search(message):
            qs.append(f"{message} geography distance")
            qs.append(f"{goal} wikipedia")
    if mode == "howto":
        # Prefer official docs hosts over Medium essay scrapes.
        if re.search(r"\bfastapi\b", message, re.I):
            qs = [f"{goal} site:fastapi.tiangolo.com", goal]
        elif re.search(r"\breact\b|usecallback|usememo", message, re.I):
            qs = [f"{goal} site:react.dev", goal]
        elif re.search(r"\basyncio\b|semaphore", message, re.I):
            qs = [f"{goal} site:docs.python.org", goal]
        else:
            qs.append(f"{goal} official documentation")
    if mode == "weather" and loc:
        qs = [f"{loc} weather forecast", f"{loc} current conditions"]
    if mode == "media" and "youtube" in message.lower():
        qs = [message]
    if sports:
        year = ""
        try:
            from datetime import date

            year = str(date.today().year)
        except Exception:
            year = ""
        qs = [
            f"NFL schedule this weekend {year} site:nfl.com".strip(),
            f"NFL schedule this week {year} site:espn.com".strip(),
            f"NBA schedule this week {year} site:nba.com".strip(),
            f"{goal} matchups kickoff times",
        ]
    seen: set[str] = set()
    out: list[str] = []
    for q in qs:
        k = q.lower().strip()
        if k and k not in seen:
            seen.add(k)
            out.append(q.strip())
    cap = 4 if sports else (3 if multi else 2)
    return out[:cap]


def think(message: str, history: list[Turn]) -> dict[str, Any]:
    """Single decision for the turn. Specialists run later on one board."""
    intent = classify_intent(message, history)
    thread = thread_entities(history, message)
    loc = thread.get("location") or location_from(message) or ""
    units = thread.get("units") or units_from(message) or "metric"
    goal = followup_goal(message, history) if thread.get("follow_up") == "yes" else message
    mode = mode_of(message, history, kind=intent.get("kind"), goal=goal)
    packs = consult(f"{mode} {message}", limit=2)
    # Templates apply even when mode_of() picked research/factual (e.g. "useMemo in React").
    from server.local_howto import local_howto_answer

    local_howto = local_howto_answer(message)
    cheap = mode in CHEAP or bool(local_howto) or try_math(message) is not None or try_math_followup(message, history) is not None
    if local_howto:
        mode = "howto"
    # Cheap / canned how-tos never search (avoids Medium dumps + fake "location" noise).
    queries = [] if cheap else _queries(message, history, mode, loc, goal)
    # Do not open result pages on the free worker. A full-page read blocks
    # the only process long enough that the answer never streams.
    fetch = 0
    if cheap:
        order = ["understand", "plan", "skip-gather", mode, "compose", "stop"]
    else:
        order = ["understand", "plan", "gather", "debate", "compose", "verify", "stop"]
    lesson_rules: list[str] = []
    if not cheap:
        from server.mcp.learn import recall_lessons

        lesson_rows = recall_lessons(f"{goal} {message}", limit=3)
        lesson_rules = [str(r.get("rule") or "")[:220] for r in lesson_rows if r.get("rule")]
    kind = intent.get("kind") or mode
    if mode in {"weather", "howto", "media", "memory", "calc", "chat"} and kind in {
        "factual",
        "followup",
        None,
        "",
    }:
        kind = mode
    return {
        "mode": mode,
        "handler": mode,
        "kind": kind,
        "follow_up": thread.get("follow_up"),
        "location": loc,
        "units": units,
        "topic_shift": thread.get("topic_shift"),
        "packs": [p["name"] for p in packs],
        "order": order,
        "cheap": cheap,
        "needs_web": not cheap,
        "needs_crew": not cheap,
        "goal": goal,
        "queries": queries,
        "fetch_urls": fetch,
        "lessons": lesson_rules,
    }


def plan_text(thought: dict[str, Any], goal: str, notes: list[str], queries: list[str]) -> str:
    bits = [
        f"Think (one brain): {thought.get('mode')}",
        f"Handler: {thought.get('handler')}",
        f"Order: {' → '.join(thought.get('order') or [])}",
        f"Kind: {thought.get('kind')}",
        f"Goal: {goal}",
        *notes,
    ]
    if thought.get("needs_web"):
        bits.append("Search: " + ", ".join(queries or thought.get("queries") or []))
        bits.append("Then crew on one board.")
    else:
        bits.append("Cheap path — skip web and crew.")
    bits.append(
        f"Thread: {thought.get('follow_up')} {thought.get('location') or ''}".strip()
    )
    if thought.get("packs"):
        bits.append("Playbooks: " + ", ".join(thought["packs"]))
    return " · ".join(bits)


def recap(history: list[Turn]) -> str:
    users = [t.text for t in history if t.role == "user"]
    asst = [t.text for t in history if t.role == "assistant"]
    if not users:
        return "We have not started a topic yet. Ask a question or say hi."
    last_u = users[-1][:240]
    last_a = (asst[-1][:280] if asst else "I have not answered yet.")
    return (
        f"We were on: **{last_u}**\n\n"
        f"Last answer (short): {last_a}\n\n"
        "Follow-ups reuse place and units from that thread."
    )


def chat_reply(message: str, history: list[Turn]) -> str:
    q = message.strip()
    # French
    if re.search(r"\b(merci|merci beaucoup)\b", q, re.I):
        return "De rien ! Je reste à votre entière disposition."
    if re.search(r"\b(au revoir|bonne nuit|salut\s+!*$)\b", q, re.I) and not re.search(r"comment", q, re.I):
        return "Au revoir ! Cet échange reste accessible dans l'historique."
    if re.search(r"\b(comment (?:vas-tu|allez-vous|ca va|ça va))\b", q, re.I):
        return "Je fonctionne parfaitement. N'hésitez pas à me poser une question ou à me donner des instructions."
    if re.search(r"\b(qui (?:es-tu|êtes-vous)|quel est ton nom)\b", q, re.I):
        return "Je suis votre assistant agentique Grok. Je peux effectuer des recherches approfondies, du code et exécuter des tâches en plusieurs langues."
    if re.search(r"\b(que peux-tu faire|aide|aide-moi)\b", q, re.I):
        return (
            "Voici mes capacités principales :\n"
            "- **Discussion** — conversations naturelles et réponses soignées en français, anglais, espagnol et russe\n"
            "- **Calcul** — opérations arithmétiques directes et précises\n"
            "- **Recherche et Synthèse** — analyse de sources web, vérification d'informations et rédaction de qualité\n"
            "- **Développement de Code** — assistance sur vos projets de programmation, tests et refactorisation"
        )
    if re.search(r"^\s*(bonjour|salut|coucou)\b", q, re.I):
        return "Bonjour ! Comment puis-je vous aider aujourd'hui ? Je peux répondre en français, anglais, russe ou espagnol."

    # Spanish
    if re.search(r"\b(gracias|muchas gracias)\b", q, re.I):
        return "¡De nada! Es un placer ayudarte. Pregúntame lo que necesites."
    if re.search(r"\b(adi[oó]s|hasta luego|buenas noches|chao)\b", q, re.I):
        return "¡Hasta pronto! Nuestra conversación permanecerá guardada en el historial."
    if re.search(r"\b(c[oó]mo est[aá]s|qu[eé] tal)\b", q, re.I):
        return "¡Todo excelente! Estoy listo para ayudarte con tus preguntas, tareas o proyectos."
    if re.search(r"\b(qui[eé]n eres|cu[aá]l es tu nombre)\b", q, re.I):
        return "Soy el asistente inteligente Grok. Te asisto con investigación, análisis riguroso y desarrollo de código con impecable ortografía y gramática."
    if re.search(r"\b(qu[eé] puedes hacer|ayuda)\b", q, re.I):
        return (
            "Puedo ayudarte en diversas áreas con excelente calidad lingüística:\n"
            "- **Conversación** — diálogo fluido y formal en español, inglés, francés y ruso\n"
            "- **Cálculos** — resolución matemática rápida y exacta\n"
            "- **Investigación** — búsqueda y verificación rigurosa de fuentes\n"
            "- **Programación** — desarrollo de software, análisis de código y correcciones"
        )
    if re.search(r"^\s*(hola|buenos d[ií]as|buenas tardes)\b", q, re.I):
        return "¡Hola! ¿En qué te puedo ayudar hoy? Escríbeme en español, inglés, francés o ruso."

    # Russian
    if re.search(r"\b(спасибо|большое спасибо|благодарю)\b", q, re.I):
        return "Пожалуйста! Всегда рад помочь. Обращайтесь по любому вопросу."
    if re.search(r"\b(пока|до свидания|спокойной ночи)\b", q, re.I):
        return "До свидания! История нашей беседы сохранена."
    if re.search(r"\b(как дела|как жизнь)\b", q, re.I):
        return "Всё отлично, система функционирует в штатном режиме. Чем я могу помочь вам сегодня?"
    if re.search(r"\b(кто ты|как тебя зовут)\b", q, re.I):
        return "Я локальный агент Grok. Помогаю находить информацию, писать и анализировать код, а также общаться на чистом и грамотном русском, английском, французском и испанском языках."
    if re.search(r"\b(что ты умеешь|помощь|помоги)\b", q, re.I):
        return (
            "Мои ключевые возможности:\n"
            "- **Диалог и языки** — грамотные ответы на русском, английском, французском и испанском языках\n"
            "- **Вычисления** — точные математические расчёты\n"
            "- **Исследования** — поиск надёжных фактов, анализ источников и проверка гипотез\n"
            "- **Программирование** — создание, отладка и проверка кода в рабочей области"
        )
    if re.search(r"^\s*(привет|здравствуй|здравствуйте|доброе утро|добрый день|добрый вечер)\b", q, re.I):
        return "Здравствуйте! Чем я могу помочь вам сегодня? Вы можете обращаться ко мне на русском, английском, французском или испанском языке."

    # English & meta
    if META_RE.search(q) and re.search(r"talking|discussing|remind|did i|remember", q, re.I):
        return recap(history)
    if re.search(r"smarter than|are you (?:a )?human|better than (?:a )?human", q, re.I):
        return (
            "No. One local brain routes the turn (chat, calc, memory, weather, howto, research). "
            "Specialists share one board after gather. I am not smarter than you."
        )
    if re.search(r"without (?:an? )?api|no (?:api )?key|offline|local", q, re.I):
        return (
            "Yes — think() runs without an API key. Chat, math, and memory skip the web. "
            "Research/how-to/weather still fetch pages, then the crew debates on one board."
        )
    if re.search(r"who are you|what(?:'s| is) your name", q, re.I):
        return (
            "I am the local Grok Agent: one think() router plus specialists. "
            "Memory is append-only JSONL, not training."
        )
    if re.search(r"what can you do|help", q, re.I):
        return (
            "One brain, several modes:\n"
            "- **chat** — greetings, recap, this help in English, French, Russian, and Spanish\n"
            "- **calc** — arithmetic, no web\n"
            "- **memory** — `remember …` / `what do you remember`\n"
            "- **weather / howto / media / research** — tools + crew\n\n"
            "Follow-ups keep place and units. Last 16 turns stay in the thread."
        )
    if re.search(r"how are you", q, re.I):
        return "I'm doing great, thank you for asking! How are you doing today? We can chat about your day, explore an interesting question, or dive into any topic you'd like."
    if re.search(r"thanks|thank you|thx", q, re.I):
        return "You're very welcome! Always glad to help or just chat. What else is on your mind?"
    if re.search(r"bye|goodbye|good night", q, re.I):
        return "Take care! Have a great time, and feel free to reach out whenever you want to talk or have questions."
    if CHAT_RE.match(q):
        loc = thread_entities(history, q).get("location") or ""
        extra = f" (Continuing from {loc}.)" if loc else ""
        return (
            f"Hello! It's great to connect with you.{extra} "
            "We can have a conversation about anything you'd like—from philosophy, everyday thoughts, and science, to coding, culture, or just catching up. What's on your mind today?"
        )
    return recap(history) if history else (
        "I'm here and happy to chat! Tell me what's on your mind, ask me anything, or let's explore an interesting topic together."
    )



def memory_reply(message: str, history: list[Turn]) -> str:
    from server.memory import search, write_fact

    m = REMEMBER_WRITE_RE.match(message.strip())
    if m:
        fact = m.group(1).strip()
        if len(fact) < 3:
            return "Tell me what to remember, e.g. `remember Austin uses metric`."
        row = write_fact(fact)
        return f"Saved to local memory (not training): **{row['fact']}**."
    q = message
    prior = " ".join(t.text for t in history[-6:] if t.role == "user")
    hits = search(q if not re.fullmatch(r"(?i)memory|last time", q.strip()) else prior or q, limit=8)
    if not hits:
        hits = search(prior, limit=8) if prior else []
    if not hits:
        return (
            "Nothing in local memory matches that. "
            "Save a note with `remember …` or ask a research question."
        )
    lines = ["From local memory (JSONL, not a trained model):"]
    for row in hits[:6]:
        fact = str(row.get("fact") or "")[:280]
        ts = str(row.get("ts") or "")[:19]
        lines.append(f"- {fact}" + (f" _{ts}_" if ts else ""))
    return "\n".join(lines)


def _folder_peek(message: str) -> str | None:
    """Answer 'can you see this folder PATH' without web search."""
    if not re.search(r"\b(see|list|look(?:\s+at)?|open|check)\b.{0,40}\b(folder|directory|dir|path)\b", message, re.I) and not re.search(
        r"\b(folder|directory)\b.{0,80}[A-Za-z]:[\\/]",
        message,
        re.I,
    ):
        return None
    paths = re.findall(
        r'(?:[A-Za-z]:[\\/][^\r\n"\'<>|?*]+|/(?:Users|home|var|tmp|opt)[^\r\n"\'<>|?*]*)',
        message,
    )
    if not paths:
        return None
    from pathlib import Path

    lines: list[str] = []
    for raw in paths[:2]:
        p = Path(raw.rstrip(".,;!?: \t\\/\"'")).expanduser()
        if not p.exists():
            lines.append(f"**No** — `{p}` does not exist on this machine.")
            continue
        if p.is_file():
            lines.append(f"**Yes** — `{p}` is a file ({p.stat().st_size} bytes).")
            continue
        if p.is_dir():
            try:
                kids = sorted(p.iterdir(), key=lambda x: x.name.lower())[:40]
            except OSError as e:
                lines.append(f"**Yes** — `{p}` exists but could not be listed: {e}")
                continue
            listing = "\n".join(
                f"- `{'[dir] ' if c.is_dir() else ''}{c.name}`" for c in kids
            ) or "_(empty)_"
            more = "" if len(kids) < 40 else "\n_(truncated)_"
            lines.append(
                f"**Yes** — I can see `{p}` locally.\n\n{listing}{more}\n\n"
                "Turn on **code** mode (and set the workspace root) to edit files there."
            )
    return "\n\n".join(lines) if lines else None


def cheap_answer(message: str, history: list[Turn], thought: dict[str, Any] | None = None) -> str | None:
    """Chat / calc / memory / known how-tos. None means gather + crew."""
    # Word-math even if mode mis-routed to research ("what is 2 plus 2?").
    math = try_math(message) or try_math_followup(message, history)
    if math is not None:
        return math
    peek = _folder_peek(message)
    if peek is not None:
        return peek
    if not (CODE_RE.search(message) or WEATHER_RE.search(message)):
        from server.mcp.domains import domain_reply

        subject = domain_reply(message)
        if subject is not None:
            return subject
    from server.local_howto import local_howto_answer

    canned = local_howto_answer(message)
    if canned is not None:
        return canned
    mode = (thought or think(message, history)).get("mode")
    if mode == "calc":
        return math or chat_reply(message, history)
    if mode == "chat":
        return chat_reply(message, history)
    if mode == "memory":
        return memory_reply(message, history)
    return None


def followup_goal(message: str, history: list[Turn]) -> str:
    prior = next((t.text for t in reversed(history) if t.role == "user"), "")
    ent = thread_entities(history, message)
    if ent.get("follow_up") == "yes" and prior and len(message.split()) <= 16:
        loc = ent.get("location") or ""
        extra = f" {loc}" if loc and loc.lower() not in message.lower() else ""
        sport = ""
        if SPORTS_RE.search(prior) or SPORTS_RE.search(message):
            sport = " NFL NBA schedule this weekend named matchups kickoff times"
        return f"{message}{sport} (continuing: {prior[:160]}){extra}".strip()
    return message
