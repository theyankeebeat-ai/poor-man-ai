from __future__ import annotations

import base64
import json
import os
import re
import subprocess
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional
from urllib.parse import quote, unquote, urlparse

import httpx
from bs4 import BeautifulSoup

from server.cache import get as cache_get
from server.cache import put as cache_put
from server.clients import http_client
from server.memory import search as memory_search_facts
from server.memory import write_fact
from server.schemas import ImageGenJson

DATA_DIR = Path(__file__).resolve().parent / "data"
IMAGES_DIR = DATA_DIR / "images"
VIDEOS_DIR = DATA_DIR / "videos"
DEFAULT_SAFE_ROOTS = [VIDEOS_DIR, IMAGES_DIR]

JINA_SEARCH = "https://s.jina.ai/"
JINA_READ = "https://r.jina.ai/"
# Jina public search (s.jina.ai) is rate-limited (~20 rpm anonymous). Prefer Tavily/Brave/Serper.

ALLOW_HOSTS = (
    "github.com",
    "codelabs.developers.google.com",
    "kaggle.com",
    "grokipedia.com",
    "learn.microsoft.com",
    "youtube.com",
    "www.youtube.com",
    "youtu.be",
    "docs.x.ai",
    "raw.githubusercontent.com",
    "api.open-meteo.com",
    "geocoding-api.open-meteo.com",
    "wttr.in",
    "api.met.no",
    "timeanddate.com",
    "www.timeanddate.com",
    # Common coding docs — direct fetch when Jina is slow/401.
    "vite.dev",
    "www.vite.dev",
    "tailwindcss.com",
    "www.tailwindcss.com",
    "react.dev",
    "www.react.dev",
    "developer.mozilla.org",
    "npmjs.com",
    "www.npmjs.com",
    "nodejs.org",
    "www.nodejs.org",
)

ToolFn = Callable[[dict[str, Any]], Awaitable[str]]


def _media_roots() -> list[Path]:
    roots = [p.resolve() for p in DEFAULT_SAFE_ROOTS]
    extra = os.getenv("LOCAL_MEDIA_ROOT")
    if extra:
        roots.append(Path(extra).expanduser().resolve())
    return roots


def _safe_local_path(path: str) -> Path:
    raw = Path(path).expanduser()
    resolved = raw.resolve()
    for root in _media_roots():
        root.mkdir(parents=True, exist_ok=True)
        try:
            resolved.relative_to(root)
            return resolved
        except ValueError:
            continue
    raise ValueError(
        f"path not under safe root ({VIDEOS_DIR} or LOCAL_MEDIA_ROOT): {path}"
    )


def _grok_cli_token() -> str | None:
    """Use official Grok Build login (~/.grok/auth.json) with auto-refresh when .env has no XAI_API_KEY."""
    auth = Path.home() / ".grok" / "auth.json"
    if not auth.is_file():
        return None
    try:
        data = json.loads(auth.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None

    from datetime import datetime, timezone, timedelta

    for rec_key, rec in list(data.items()):
        if not isinstance(rec, dict):
            continue
        expires_at_str = rec.get("expires_at")
        needs_refresh = False
        if expires_at_str:
            try:
                clean_ts = re.sub(r"(\.\d{6})\d+Z", r"\1+00:00", str(expires_at_str)).replace("Z", "+00:00")
                exp_dt = datetime.fromisoformat(clean_ts)
                if datetime.now(timezone.utc).timestamp() >= exp_dt.timestamp() - 300:
                    needs_refresh = True
            except Exception:
                pass

        if not needs_refresh:
            key = rec.get("key") or rec.get("access_token") or rec.get("api_key")
            if isinstance(key, str) and key.strip():
                return key.strip()

        # Token is expired or needs refresh — attempt OIDC refresh
        refresh_token = rec.get("refresh_token")
        client_id = rec.get("oidc_client_id") or "b1a00492-073a-47ea-816f-4c329264a828"
        issuer = str(rec.get("oidc_issuer") or "https://auth.x.ai").rstrip("/")
        token_url = f"{issuer}/oauth2/token"
        if refresh_token:
            try:
                resp = httpx.post(
                    token_url,
                    data={
                        "grant_type": "refresh_token",
                        "client_id": client_id,
                        "refresh_token": refresh_token,
                    },
                    timeout=10.0,
                )
                if resp.status_code == 200:
                    res_json = resp.json()
                    new_key = res_json.get("access_token")
                    new_refresh = res_json.get("refresh_token") or refresh_token
                    expires_in = int(res_json.get("expires_in") or 21600)
                    new_exp = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat()
                    rec["key"] = new_key
                    rec["access_token"] = new_key
                    rec["refresh_token"] = new_refresh
                    rec["expires_at"] = new_exp
                    data[rec_key] = rec
                    try:
                        auth.write_text(json.dumps(data, indent=2), encoding="utf-8")
                    except OSError:
                        pass
                    if isinstance(new_key, str) and new_key.strip():
                        return new_key.strip()
            except Exception:
                pass

        if needs_refresh:
            continue

        key = rec.get("key") or rec.get("access_token") or rec.get("api_key")
        if isinstance(key, str) and key.strip():
            return key.strip()

    return None


def openai_client():
    from openai import OpenAI

    xai = os.getenv("XAI_API_KEY") or _grok_cli_token()
    if xai:
        return OpenAI(
            api_key=xai,
            base_url=os.getenv("XAI_BASE_URL", "https://api.x.ai/v1"),
        )
    oai = os.getenv("OPENAI_API_KEY")
    if oai:
        return OpenAI(
            api_key=oai,
            base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
        )
    return None


def chat_model() -> str:
    if os.getenv("XAI_API_KEY") or _grok_cli_token():
        return os.getenv("XAI_MODEL", "grok-4.6")
    return os.getenv("OPENAI_MODEL", "gpt-4o-mini")


def plan_model() -> str:
    """Fast SKU for plan/tool-choice; compose uses chat_model()."""
    return os.getenv("XAI_PLAN_MODEL") or os.getenv("OPENAI_PLAN_MODEL") or chat_model()


async def web_search(args: dict[str, Any]) -> str:
    query = str(args.get("query") or "").strip()
    site = args.get("site")
    if site:
        host = str(site).replace("https://", "").replace("http://", "").split("/")[0]
        query = f"site:{host} {query}"
    if not query:
        return "error: empty query"

    cached = cache_get("search", query)
    if cached is not None:
        return cached if isinstance(cached, str) else json.dumps(cached, ensure_ascii=False)

    results: list[dict[str, str]] = []
    tavily = os.getenv("TAVILY_API_KEY")
    brave = os.getenv("BRAVE_API_KEY")
    serper = os.getenv("SERPER_API_KEY")

    client = http_client()
    if True:
        if tavily:
            r = await client.post(
                "https://api.tavily.com/search",
                json={"api_key": tavily, "query": query, "max_results": 8},
            )
            r.raise_for_status()
            for item in r.json().get("results", [])[:8]:
                results.append(
                    {
                        "title": item.get("title") or "",
                        "url": item.get("url") or "",
                        "snippet": (item.get("content") or "")[:400],
                    }
                )
        elif brave:
            r = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                params={"q": query, "count": 8},
                headers={"Accept": "application/json", "X-Subscription-Token": brave},
            )
            r.raise_for_status()
            for item in r.json().get("web", {}).get("results", [])[:8]:
                results.append(
                    {
                        "title": item.get("title") or "",
                        "url": item.get("url") or "",
                        "snippet": (item.get("description") or "")[:400],
                    }
                )
        elif serper:
            r = await client.post(
                "https://google.serper.dev/search",
                headers={"X-API-KEY": serper, "Content-Type": "application/json"},
                json={"q": query, "num": 8},
            )
            r.raise_for_status()
            for item in r.json().get("organic", [])[:8]:
                results.append(
                    {
                        "title": item.get("title") or "",
                        "url": item.get("link") or "",
                        "snippet": (item.get("snippet") or "")[:400],
                    }
                )
        else:
            # Anonymous s.jina.ai often 401 / rate-limits. Only try with a key;
            # otherwise go straight to DuckDuckGo HTML (no key).
            jina_err = None
            jina_key = (os.getenv("JINA_API_KEY") or "").strip()
            if jina_key:
                try:
                    r = await client.get(
                        JINA_SEARCH + quote(query, safe=""),
                        headers={
                            "Accept": "application/json",
                            "Authorization": f"Bearer {jina_key}",
                        },
                    )
                    r.raise_for_status()
                    text = r.text
                    try:
                        data = r.json()
                        items = data.get("data") or data.get("results") or []
                        if isinstance(items, list):
                            for item in items[:8]:
                                if isinstance(item, dict):
                                    results.append(
                                        {
                                            "title": str(item.get("title") or ""),
                                            "url": str(item.get("url") or ""),
                                            "snippet": str(
                                                item.get("content")
                                                or item.get("description")
                                                or ""
                                            )[:400],
                                        }
                                    )
                    except Exception:
                        for block in re.split(r"\n{2,}", text)[:8]:
                            url_m = re.search(r"https?://\S+", block)
                            results.append(
                                {
                                    "title": block.split("\n")[0][:120],
                                    "url": url_m.group(0) if url_m else "",
                                    "snippet": block[:400],
                                }
                            )
                except Exception as e:
                    jina_err = str(e)
            else:
                jina_err = "skipped anonymous s.jina.ai (often 401 without JINA_API_KEY)"

            if not results:
                # 1. If query is news/current events or general search fallback: Google News RSS
                try:
                    news_hits = await _google_news_search(client, query)
                    if news_hits:
                        results.extend(news_hits)
                except Exception as e:
                    logger.debug("Google news search error: %s", e)

            if len(results) < 4:
                # 2. Bing organic search fallback (no API key required)
                try:
                    bing_hits = await _bing_search(client, query)
                    for b in bing_hits:
                        if not any(r["url"] == b["url"] for r in results):
                            results.append(b)
                except Exception as e:
                    logger.debug("Bing search error: %s", e)

            if len(results) < 4:
                # 3. DuckDuckGo HTML / Lite fallback
                try:
                    ddg_hits = await _duckduckgo_html(client, query)
                    for d in ddg_hits:
                        if not any(r["url"] == d["url"] for r in results):
                            results.append(d)
                except Exception as e:
                    logger.debug("DDG search error: %s", e)

            if not results:
                # 4. Wikipedia OpenSearch as final informative fallback
                try:
                    wiki_hits = await _wikipedia_opensearch(client, query)
                    results.extend(wiki_hits)
                except Exception as e:
                    logger.debug("Wikipedia opensearch error: %s", e)

    out = json.dumps(results[:8], ensure_ascii=False)
    cache_put("search", out, query)
    return out


def _decode_bing_url(raw_url: str) -> str:
    """Decode base64 tracking redirect URLs from Bing organic search results."""
    m = re.search(r"[?&]u=a1([a-zA-Z0-9_-]+)", raw_url)
    if m:
        b64 = m.group(1)
        b64 += "=" * ((4 - len(b64) % 4) % 4)
        try:
            decoded = base64.urlsafe_b64decode(b64).decode("utf-8", errors="ignore")
            if decoded.startswith("http"):
                return decoded
        except Exception:
            pass
    return raw_url


async def _google_news_search(client: httpx.AsyncClient, query: str) -> list[dict[str, str]]:
    """Live Google News RSS search providing real-time articles, dates, and sources without API keys."""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    g_url = f"https://news.google.com/rss/search?q={quote(query)}&hl=en-US&gl=US&ceid=US:en"
    try:
        r = await client.get(g_url, headers=headers, timeout=8.0)
        if r.status_code != 200:
            return []
        clean_xml = re.sub(r"<\?xml[^>]+\?>", "", r.text).strip()
        root = ET.fromstring(clean_xml)
        items = root.findall(".//item")
        results: list[dict[str, str]] = []
        for item in items[:8]:
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            desc = (item.findtext("description") or "").strip()
            desc = re.sub(r"<[^>]+>", "", desc).strip()
            pub = (item.findtext("pubDate") or "").strip()
            snip = f"{pub} - {desc}" if pub else desc
            if title and link:
                results.append({"title": title, "url": link, "snippet": snip[:350]})
        return results
    except Exception:
        return []


async def _bing_search(client: httpx.AsyncClient, query: str) -> list[dict[str, str]]:
    """Free Bing HTML organic search."""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    url = f"https://www.bing.com/search?q={quote(query)}"
    try:
        r = await client.get(url, headers=headers, timeout=8.0)
        if r.status_code != 200:
            return []
        soup = BeautifulSoup(r.text, "html.parser")
        results: list[dict[str, str]] = []
        for li in soup.find_all("li", class_="b_algo"):
            h2 = li.find("h2")
            if not h2:
                continue
            a = h2.find("a")
            if not a or not a.get("href"):
                continue
            title = a.get_text(strip=True)
            real_url = _decode_bing_url(a["href"])
            caption = li.find("div", class_="b_caption")
            p = caption.find("p") if caption else None
            snip = p.get_text(strip=True) if p else ""
            if title and real_url.startswith("http"):
                results.append({"title": title, "url": real_url, "snippet": snip[:350]})
            if len(results) >= 8:
                break
        return results
    except Exception:
        return []


async def _wikipedia_opensearch(client: httpx.AsyncClient, query: str) -> list[dict[str, str]]:
    """Wikipedia OpenSearch API fallback."""
    url = (
        f"https://en.wikipedia.org/w/api.php?action=opensearch&search={quote(query)}"
        f"&limit=6&namespace=0&format=json"
    )
    try:
        r = await client.get(url, timeout=6.0)
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list) and len(data) >= 4:
                titles = data[1]
                descriptions = data[2]
                urls = data[3]
                res: list[dict[str, str]] = []
                for i in range(len(titles)):
                    res.append({
                        "title": str(titles[i]),
                        "url": str(urls[i]),
                        "snippet": str(descriptions[i] if i < len(descriptions) else "")[:300]
                    })
                return res
    except Exception:
        pass
    return []


async def _duckduckgo_html(client: httpx.AsyncClient, query: str) -> list[dict[str, str]]:
    """Parse DuckDuckGo HTML/lite results. No API key."""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
        )
    }
    html = ""
    try:
        r = await client.get(
            "https://lite.duckduckgo.com/lite/",
            params={"q": query},
            headers=headers,
            timeout=7.0,
        )
        if r.status_code == 200:
            html = r.text
    except Exception:
        pass

    if not html:
        try:
            r = await client.post(
                "https://html.duckduckgo.com/html/",
                data={"q": query},
                headers=headers,
                timeout=7.0,
            )
            if r.status_code == 200:
                html = r.text
        except Exception:
            pass

    results: list[dict[str, str]] = []
    if html:
        lite_rows = re.findall(
            r'<a[^>]+href="([^"]+)"[^>]*class=[\'"]result-link[\'"][^>]*>(.*?)</a>'
            r'|<a[^>]+class=[\'"]result-link[\'"][^>]+href="([^"]+)"[^>]*>(.*?)</a>',
            html,
            flags=re.I | re.S,
        )
        if lite_rows:
            for g1, t1, g2, t2 in lite_rows:
                href = g1 or g2
                title_html = t1 or t2
                title = re.sub(r"<[^>]+>", "", title_html).strip()
                uddg = re.search(r"[?&]uddg=([^&\"']+)", href)
                if uddg:
                    href = unquote(uddg.group(1))
                elif href.startswith("//"):
                    href = "https:" + href
                if not title or not href.startswith("http") or "duckduckgo.com" in href:
                    continue
                results.append({"title": title[:120], "url": href, "snippet": ""})
                if len(results) >= 8:
                    break
            if results:
                return results

        titles = re.findall(r'class="result__a"[^>]*>(.*?)</a>', html, flags=re.I | re.S)
        urls = re.findall(r'class="result__url"[^>]*href="([^"]+)"', html, flags=re.I)
        if not urls:
            urls = re.findall(r'uddg=([^"&]+)', html)
        snippets = re.findall(
            r'class="result__snippet"[^>]*>(.*?)</(?:a|td|div)>',
            html,
            flags=re.I | re.S,
        )
        n = max(len(titles), len(urls), 0)
        for i in range(min(8, n)):
            raw_url = unquote(urls[i] if i < len(urls) else "")
            title = re.sub(r"<[^>]+>", "", titles[i] if i < len(titles) else "").strip()
            snip = re.sub(r"<[^>]+>", "", snippets[i] if i < len(snippets) else "").strip()[:400]
            if title or raw_url:
                results.append({"title": title, "url": raw_url, "snippet": snip})
    return results


async def read_url(args: dict[str, Any]) -> str:
    url = str(args.get("url") or "").strip()
    if not url.startswith("http"):
        return "error: url must start with http(s)"
    render_js = bool(args.get("render_js") or args.get("use_browser"))
    from server.web_reader import read_website

    res = await read_website(url, render_js=render_js, max_chars=12_000)
    if res.get("method") == "error":
        return f"error reading url: {res.get('error', 'unknown error')}"
    title = res.get("title") or ""
    md = res.get("markdown") or ""
    prefix = f"# {title}\nSource: {url}\n\n" if title and not md.startswith("#") else ""
    return (prefix + md)[:12_000]


async def memory_write(args: dict[str, Any]) -> str:
    fact = str(args.get("fact") or "").strip()
    if not fact:
        return "error: empty fact"
    row = write_fact(fact, args.get("source_url"))
    # write_fact refuses junk (Jina 401 dumps, extract failures, etc.).
    if row.get("skipped"):
        return json.dumps(row)
    return json.dumps(row)


async def memory_search(args: dict[str, Any]) -> str:
    q = str(args.get("query") or "")
    return json.dumps(memory_search_facts(q, 10), ensure_ascii=False)


def _extractive_summary(text: str, instruction: str, max_sents: int = 8) -> str:
    """Offline fallback when no LLM key is available."""
    raw = re.sub(r"\s+", " ", (text or "").strip())
    if not raw:
        return "error: empty transcript"
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", raw) if 28 < len(s.strip()) < 320]
    if not sents:
        sents = [raw[i : i + 200].strip() for i in range(0, min(len(raw), 1600), 200) if raw[i : i + 200].strip()]
    terms = {w for w in re.findall(r"[a-z]{4,}", (instruction or "").lower())}
    scored: list[tuple[int, int, str]] = []
    for i, s in enumerate(sents[:80]):
        score = sum(1 for t in terms if t in s.lower()) + (2 if i < 3 else 0)
        scored.append((score, -i, s))
    scored.sort(reverse=True)
    picks = [s for _, _, s in scored[:max_sents]]
    # Keep original order for readability.
    ordered = [s for s in sents if s in picks][:max_sents]
    bullets = "\n".join(f"- {s}" for s in ordered)
    return f"{instruction.strip()}\n\nExtractive summary (no LLM key):\n{bullets}"


def _summarize_text(text: str, instruction: str) -> str:
    client = openai_client()
    if not client:
        return _extractive_summary(text, instruction)
    try:
        resp = client.chat.completions.create(
            model=chat_model(),
            messages=[
                {
                    "role": "system",
                    "content": "Summarize in 8 bullets plus key quotes. Be faithful.",
                },
                {"role": "user", "content": f"{instruction}\n\n{text[:20_000]}"},
            ],
            temperature=0.2,
        )
        return resp.choices[0].message.content or _extractive_summary(text, instruction)
    except Exception as e:
        return _extractive_summary(text, instruction) + f"\n\n(LLM summarize failed: {e})"


def _youtube_fetch_transcript(vid: str) -> str:
    """Fetch caption text. Supports youtube-transcript-api 1.x (fetch) and 0.6.x (get_transcript)."""
    from youtube_transcript_api import YouTubeTranscriptApi

    # 1.x: instance methods fetch/list. 0.6.x: classmethod get_transcript.
    if hasattr(YouTubeTranscriptApi, "get_transcript"):
        segs = YouTubeTranscriptApi.get_transcript(vid)
        return " ".join((s.get("text") or "") for s in segs)

    api = YouTubeTranscriptApi()
    try:
        fetched = api.fetch(vid, languages=("en", "en-US", "en-GB"))
    except Exception:
        # Prefer English; otherwise take the first listed track.
        listed = list(api.list(vid))
        if not listed:
            raise
        track = next((t for t in listed if (t.language_code or "").startswith("en")), listed[0])
        fetched = track.fetch()
    return " ".join(s.text for s in fetched)


async def youtube_summarize(args: dict[str, Any]) -> str:
    url = str(args.get("url") or "").strip()
    vid = None
    m = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})", url)
    if m:
        vid = m.group(1)
    if not vid:
        return "error: could not parse YouTube video id"
    cached = cache_get("youtube", vid)
    if isinstance(cached, str) and cached:
        return cached
    try:
        transcript = _youtube_fetch_transcript(vid)
    except Exception as e:
        return f"no captions; user must paste transcript ({e})"
    if not transcript.strip():
        return "no captions; user must paste transcript (empty transcript)"
    out = _summarize_text(transcript, f"Summarize YouTube {url}")
    cache_put("youtube", out, vid)
    return out


async def local_video_summarize(args: dict[str, Any]) -> str:
    path = str(args.get("path") or "")
    try:
        p = _safe_local_path(path)
    except ValueError as e:
        return f"error: {e}"
    if not p.exists() or not p.is_file():
        return f"error: file not found: {p}"

    audio = p
    if p.suffix.lower() not in {".wav", ".mp3", ".m4a", ".ogg", ".flac"}:
        audio = p.with_suffix(".extracted.wav")
        try:
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(p),
                    "-vn",
                    "-ac",
                    "1",
                    "-ar",
                    "16000",
                    str(audio),
                ],
                check=True,
                capture_output=True,
            )
        except Exception as e:
            return f"error: ffmpeg failed ({e}). Install ffmpeg or provide a transcript."

    transcript = None
    try:
        from faster_whisper import WhisperModel  # type: ignore

        model = WhisperModel("base", device="cpu")
        segments, _ = model.transcribe(str(audio))
        transcript = " ".join(s.text for s in segments)
    except Exception:
        try:
            import whisper  # type: ignore

            model = whisper.load_model("base")
            transcript = model.transcribe(str(audio)).get("text")
        except Exception:
            return "install faster-whisper or provide transcript"

    return _summarize_text(transcript or "", f"Summarize local media {p.name}")


def _image_meta(path: Path) -> dict[str, Any]:
    meta: dict[str, Any] = {
        "path": str(path),
        "name": path.name,
        "bytes": path.stat().st_size if path.exists() else 0,
        "suffix": path.suffix.lower(),
    }
    try:
        from PIL import Image  # type: ignore

        with Image.open(path) as im:
            meta["size"] = list(im.size)
            meta["mode"] = im.mode
            meta["format"] = im.format
    except Exception as e:
        meta["pillow_error"] = str(e)
    # Optional OCR when vision API is unavailable.
    try:
        import pytesseract  # type: ignore
        from PIL import Image  # type: ignore

        with Image.open(path) as im:
            text = (pytesseract.image_to_string(im) or "").strip()
        if text:
            meta["ocr_text"] = text[:2000]
    except Exception:
        pass
    return meta


async def read_image(args: dict[str, Any]) -> str:
    src = str(args.get("path_or_url") or "").strip()
    if not src:
        return "error: empty path_or_url"

    client = openai_client()
    has_vision = bool(
        client
        and (
            os.getenv("VISION_API_KEY")
            or os.getenv("XAI_API_KEY")
            or os.getenv("OPENAI_API_KEY")
            or _grok_cli_token()
        )
    )
    if has_vision and client:
        content: Any
        if src.startswith("http"):
            content = [
                {"type": "text", "text": "Describe this image precisely."},
                {"type": "image_url", "image_url": {"url": src}},
            ]
        else:
            try:
                p = _safe_local_path(src)
            except ValueError as e:
                return f"error: {e}"
            if not p.exists():
                return f"error: image not found: {src}"
            import base64

            b64 = base64.b64encode(p.read_bytes()).decode("ascii")
            mime = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
            content = [
                {"type": "text", "text": "Describe this image precisely."},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime};base64,{b64}"},
                },
            ]
        model = os.getenv("XAI_VISION_MODEL") or chat_model()
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": content}],
            )
            out = resp.choices[0].message.content or ""
            if out.strip():
                return out
        except Exception as e:
            # Fall through to local metadata / OCR.
            vision_err = str(e)
        else:
            vision_err = "empty vision response"
    else:
        vision_err = "no vision API key (XAI_API_KEY / OPENAI_API_KEY / VISION_API_KEY / ~/.grok/auth.json)"

    if src.startswith("http"):
        # Download remote image into safe images dir for metadata/OCR.
        try:
            IMAGES_DIR.mkdir(parents=True, exist_ok=True)
            client_http = http_client()
            r = await client_http.get(src, follow_redirects=True)
            r.raise_for_status()
            ext = ".png"
            ctype = (r.headers.get("content-type") or "").lower()
            if "jpeg" in ctype or "jpg" in ctype:
                ext = ".jpg"
            elif "webp" in ctype:
                ext = ".webp"
            elif "gif" in ctype:
                ext = ".gif"
            tmp = IMAGES_DIR / f"read_{uuid.uuid4().hex[:10]}{ext}"
            tmp.write_bytes(r.content)
            meta = _image_meta(tmp)
            meta["source_url"] = src
            meta["vision_error"] = vision_err
            meta["description"] = (
                f"Image {meta.get('size') or '?'} {meta.get('mode') or ''} "
                f"({meta.get('bytes', 0)} bytes). "
                + (f"OCR: {meta['ocr_text'][:400]}" if meta.get("ocr_text") else "No OCR text.")
            )
            return json.dumps(meta, ensure_ascii=False)
        except Exception as e:
            return json.dumps(
                {"error": f"could not fetch image: {e}", "vision_error": vision_err, "url": src},
                ensure_ascii=False,
            )

    try:
        p = _safe_local_path(src)
    except ValueError as e:
        return f"error: {e}"
    if not p.exists():
        return f"error: image not found: {src}"
    meta = _image_meta(p)
    meta["vision_error"] = vision_err
    meta["description"] = (
        f"Local image {p.name}: size={meta.get('size')}, mode={meta.get('mode')}, "
        f"{meta.get('bytes', 0)} bytes. "
        + (f"OCR: {meta['ocr_text'][:400]}" if meta.get("ocr_text") else "No OCR text available.")
    )
    return json.dumps(meta, ensure_ascii=False)


async def generate_image(args: dict[str, Any]) -> str:
    spec = ImageGenJson.model_validate(args.get("spec") if "spec" in args else args)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    img_id = uuid.uuid4().hex[:12]
    image_gen_url = os.getenv("IMAGE_GEN_URL")
    xai = os.getenv("XAI_API_KEY") or _grok_cli_token()
    oai = os.getenv("OPENAI_API_KEY")

    async def save_bytes(data: bytes) -> str:
        out = IMAGES_DIR / f"{img_id}.png"
        out.write_bytes(data)
        return f"/static/images/{img_id}.png"

    if image_gen_url:
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(image_gen_url, json=spec.model_dump())
            r.raise_for_status()
            ctype = r.headers.get("content-type", "")
            if "image" in ctype:
                path = await save_bytes(r.content)
                return json.dumps({"status": "ok", "path": path})
            data = r.json()
            url = data.get("url") or (data.get("data") or [{}])[0].get("url")
            if url:
                img = await client.get(url)
                path = await save_bytes(img.content)
                return json.dumps({"status": "ok", "path": path, "url": url})
            return json.dumps(data)

    client = openai_client()
    if client and (xai or oai):
        # Prefer Imagine when xAI/Grok auth is present (env or ~/.grok/auth.json).
        use_xai = bool(os.getenv("XAI_API_KEY") or _grok_cli_token())
        model = os.getenv("XAI_IMAGE_MODEL", "grok-imagine-image-2.0") if use_xai else "dall-e-3"
        try:
            resp = client.images.generate(
                model=model,
                prompt=spec.prompt,
                n=max(1, min(spec.n, 4)),
                size=f"{spec.width}x{spec.height}" if spec.width and spec.height else "1024x1024",
            )
            item = resp.data[0]
            b64 = getattr(item, "b64_json", None)
            if b64:
                import base64

                path = await save_bytes(base64.b64decode(b64))
                return json.dumps({"status": "ok", "path": path, "model": model})
            url = getattr(item, "url", None)
            if url:
                async with httpx.AsyncClient(timeout=60.0) as hc:
                    img = await hc.get(url)
                    path = await save_bytes(img.content)
                return json.dumps({"status": "ok", "path": path, "url": url, "model": model})
            return json.dumps({"status": "error", "error": "image API returned no bytes or url", "model": model})
        except Exception as e:
            return json.dumps({"status": "error", "error": str(e), "model": model})

    # Last resort: render a real PNG placeholder so the UI gets an image path (not JSON-only).
    try:
        from PIL import Image, ImageDraw  # type: ignore

        w = max(256, min(int(spec.width or 1024), 2048))
        h = max(256, min(int(spec.height or 1024), 2048))
        im = Image.new("RGB", (w, h), (24, 28, 36))
        draw = ImageDraw.Draw(im)
        title = "Image queued (no IMAGE_GEN_URL / XAI key)"
        body = (spec.prompt or "")[:280]
        draw.rectangle([24, 24, w - 24, h - 24], outline=(90, 120, 200), width=3)
        draw.text((40, 48), title, fill=(220, 225, 235))
        y = 100
        line = ""
        for word in body.split():
            trial = (line + " " + word).strip()
            if len(trial) > max(28, w // 14):
                draw.text((40, y), line, fill=(180, 190, 210))
                y += 28
                line = word
                if y > h - 80:
                    break
            else:
                line = trial
        if line and y <= h - 80:
            draw.text((40, y), line, fill=(180, 190, 210))
        out = IMAGES_DIR / f"{img_id}.png"
        im.save(out, format="PNG")
        (IMAGES_DIR / f"{img_id}.json").write_text(spec.model_dump_json(indent=2), encoding="utf-8")
        return json.dumps(
            {
                "status": "placeholder_png",
                "path": f"/static/images/{img_id}.png",
                "note": "Set XAI_API_KEY, OPENAI_API_KEY, IMAGE_GEN_URL, or log in via ~/.grok/auth.json for real generation.",
                "prompt": spec.prompt[:200],
            }
        )
    except Exception as e:
        json_path = IMAGES_DIR / f"{img_id}.json"
        json_path.write_text(spec.model_dump_json(indent=2), encoding="utf-8")
        return json.dumps(
            {
                "status": "queued_json_only",
                "path": f"/static/images/{img_id}.json",
                "error": str(e),
                "note": "Install Pillow for a PNG placeholder, or set an image API key.",
            }
        )


async def weather_compare(args: dict[str, Any]) -> str:
    """Cross-check several public weather APIs. No LLM / xAI key required."""
    place = str(args.get("place") or args.get("query") or "").strip()
    if not place:
        return "error: empty place"
    cached = cache_get("weather", place)
    if cached is not None:
        return cached if isinstance(cached, str) else json.dumps(cached, ensure_ascii=False)
    headers = {"User-Agent": "research-agent/0.1 (local; weather-compare)"}
    sources: dict[str, Any] = {"place_query": place, "sources": []}

    client = http_client()
    if True:
        geo = None
        try:
            r = await client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": place, "count": 1, "language": "en"},
            )
            r.raise_for_status()
            results = (r.json() or {}).get("results") or []
            if results:
                geo = results[0]
                sources["geo"] = {
                    "name": geo.get("name"),
                    "country": geo.get("country"),
                    "admin1": geo.get("admin1"),
                    "lat": geo.get("latitude"),
                    "lon": geo.get("longitude"),
                    "url": "https://geocoding-api.open-meteo.com/v1/search",
                }
        except Exception as e:
            sources["sources"].append({"name": "open-meteo-geocoding", "error": str(e)})

        lat = geo.get("latitude") if geo else None
        lon = geo.get("longitude") if geo else None

        if lat is not None and lon is not None:
            try:
                r = await client.get(
                    "https://api.open-meteo.com/v1/forecast",
                    params={
                        "latitude": lat,
                        "longitude": lon,
                        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation",
                        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
                        "forecast_days": 3,
                        "timezone": "auto",
                    },
                )
                r.raise_for_status()
                om = r.json()
                cur = om.get("current") or {}
                daily = om.get("daily") or {}
                sources["sources"].append(
                    {
                        "name": "Open-Meteo",
                        "url": "https://open-meteo.com/",
                        "current_c": cur.get("temperature_2m"),
                        "feels_like_c": cur.get("apparent_temperature"),
                        "humidity": cur.get("relative_humidity_2m"),
                        "wind_kmh": cur.get("wind_speed_10m"),
                        "precip": cur.get("precipitation"),
                        "today_max_c": (daily.get("temperature_2m_max") or [None])[0],
                        "today_min_c": (daily.get("temperature_2m_min") or [None])[0],
                    }
                )
            except Exception as e:
                sources["sources"].append({"name": "Open-Meteo", "error": str(e)})

            try:
                r = await client.get(
                    "https://api.met.no/weatherapi/locationforecast/2.0/compact",
                    params={"lat": lat, "lon": lon},
                )
                r.raise_for_status()
                ts = ((r.json() or {}).get("properties") or {}).get("timeseries") or []
                now = (ts[0].get("data") or {}).get("instant", {}).get("details", {}) if ts else {}
                sources["sources"].append(
                    {
                        "name": "MET Norway",
                        "url": "https://api.met.no/",
                        "air_temp_c": now.get("air_temperature"),
                        "humidity": now.get("relative_humidity"),
                        "wind_ms": now.get("wind_speed"),
                    }
                )
            except Exception as e:
                sources["sources"].append({"name": "MET Norway", "error": str(e)})

        try:
            r = await client.get(f"https://wttr.in/{quote(place)}?format=j1")
            r.raise_for_status()
            w = r.json()
            cur = (w.get("current_condition") or [{}])[0]
            nearest = (w.get("nearest_area") or [{}])[0]
            sources["sources"].append(
                {
                    "name": "wttr.in",
                    "url": f"https://wttr.in/{quote(place)}",
                    "area": (nearest.get("areaName") or [{}])[0].get("value"),
                    "country": (nearest.get("country") or [{}])[0].get("value"),
                    "temp_c": cur.get("temp_C"),
                    "feels_like_c": cur.get("FeelsLikeC"),
                    "humidity": cur.get("humidity"),
                    "wind_kmph": cur.get("windspeedKmph"),
                    "desc": (cur.get("weatherDesc") or [{}])[0].get("value"),
                }
            )
        except Exception as e:
            sources["sources"].append({"name": "wttr.in", "error": str(e)})

    temps = []
    for s in sources["sources"]:
        for k in ("current_c", "temp_c", "air_temp_c"):
            v = s.get(k)
            if v is None:
                continue
            try:
                temps.append(float(v))
            except (TypeError, ValueError):
                pass
    if temps:
        sources["cross_check"] = {
            "n_sources": len(temps),
            "min_c": min(temps),
            "max_c": max(temps),
            "spread_c": round(max(temps) - min(temps), 1),
            "note": "Spread is across public APIs at query time; not a forecast ensemble.",
        }
    out = json.dumps(sources, ensure_ascii=False)
    cache_put("weather", out, place)
    return out


TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web. Prefer official docs (github, Google Codelabs, Kaggle, grokipedia, Microsoft Learn). Jina s.jina.ai fallback is rate-limited (~20 rpm).",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "site": {
                        "type": "string",
                        "description": "Optional host to restrict with site: prefix, e.g. github.com",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_url",
            "description": "Fetch and parse any website, article, or documentation into clean Markdown. Supports direct scraping, JavaScript SPA rendering via headless browser, and Jina fallback.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The HTTP/HTTPS web address to read."},
                    "render_js": {"type": "boolean", "description": "Optional: set true to execute dynamic JavaScript / SPAs via headless browser."},
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "memory_write",
            "description": "Append-only memory. Store a useful fact after research. Does not train a model.",
            "parameters": {
                "type": "object",
                "properties": {
                    "fact": {"type": "string"},
                    "source_url": {"type": "string"},
                },
                "required": ["fact"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "memory_search",
            "description": "Search append-only memory (FTS, top 8 snippets). Not the full file.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "youtube_summarize",
            "description": "Summarize a YouTube video from captions only. Never downloads the video file.",
            "parameters": {
                "type": "object",
                "properties": {"url": {"type": "string"}},
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "local_video_summarize",
            "description": "Transcribe/summarize a local media file under server/data/videos or LOCAL_MEDIA_ROOT. No path traversal.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_image",
            "description": "Describe an image from URL or local path using vision API.",
            "parameters": {
                "type": "object",
                "properties": {"path_or_url": {"type": "string"}},
                "required": ["path_or_url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "weather_compare",
            "description": "Cross-reference public weather APIs for a place (Open-Meteo, MET Norway, wttr.in). No API key. Use for weather questions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "place": {"type": "string"},
                    "query": {"type": "string"},
                },
                "required": ["place"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_image",
            "description": "Generate an image from ImageGenJson spec. Saves to /static/images/ or queues JSON if no image API.",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string"},
                    "negative_prompt": {"type": "string"},
                    "width": {"type": "integer", "default": 1024},
                    "height": {"type": "integer", "default": 1024},
                    "style": {"type": "string"},
                    "n": {"type": "integer", "default": 1},
                    "spec": {"type": "object"},
                },
                "required": [],
            },
        },
    },
]

RUNNERS: dict[str, ToolFn] = {
    "web_search": web_search,
    "read_url": read_url,
    "memory_write": memory_write,
    "memory_search": memory_search,
    "youtube_summarize": youtube_summarize,
    "local_video_summarize": local_video_summarize,
    "read_image": read_image,
    "generate_image": generate_image,
    "weather_compare": weather_compare,
}


def _register_mcp() -> None:
    from server.mcp.tools import (
        MCP_TOOLS,
        agent_talk,
        cite_pack,
        compare_sources,
        consult_knowledge,
        extract_claims,
        final_answer,
        financial_compare,
        financial_news,
        financial_quote,
        followup_search,
        gap_search,
        list_learned,
        resolve_thread,
        verify_claims,
        write_knowledge,
        write_skill,
    )

    TOOLS.extend(MCP_TOOLS)
    RUNNERS.update(
        {
            "resolve_thread": resolve_thread,
            "followup_search": followup_search,
            "gap_search": gap_search,
            "verify_claims": verify_claims,
            "final_answer": final_answer,
            "consult_knowledge": consult_knowledge,
            "agent_talk": agent_talk,
            "extract_claims": extract_claims,
            "compare_sources": compare_sources,
            "cite_pack": cite_pack,
            "list_learned": list_learned,
            "write_skill": write_skill,
            "write_knowledge": write_knowledge,
            "financial_quote": financial_quote,
            "financial_compare": financial_compare,
            "financial_news": financial_news,
        }
    )


_register_mcp()


def _register_code() -> None:
    from server.code_tools import CODE_RUNNERS, CODE_TOOLS

    TOOLS.extend(CODE_TOOLS)
    RUNNERS.update(CODE_RUNNERS)


_register_code()

CODE_TOOL_NAMES = frozenset(
    {
        "workspace_info",
        "list_dir",
        "read_file",
        "grep",
        "apply_patch",
        "write_file",
        "run_cmd",
        "git_status",
        "git_diff",
        "web_search",
        "read_url",
        "memory_write",
        "memory_search",
        "final_answer",
        "financial_quote",
        "financial_compare",
        "financial_news",
    }
)


def tools_for_mode(mode: str) -> list[dict[str, Any]]:
    if mode != "code":
        skip = CODE_TOOL_NAMES - {
            "web_search",
            "read_url",
            "memory_write",
            "memory_search",
            "final_answer",
            "financial_quote",
            "financial_compare",
            "financial_news",
        }
        return [
            t
            for t in TOOLS
            if (t.get("function") or {}).get("name") not in skip
        ]
    return [
        t
        for t in TOOLS
        if (t.get("function") or {}).get("name") in CODE_TOOL_NAMES
    ]


async def run_tool(name: str, args: dict[str, Any]) -> str:
    fn = RUNNERS.get(name)
    if not fn:
        return f"unknown tool: {name}"
    try:
        return await fn(args)
    except Exception as e:
        return f"tool error ({name}): {e}"
