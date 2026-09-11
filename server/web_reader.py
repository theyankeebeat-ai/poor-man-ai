"""Web Reader & Content Extractor for Poor Man AI.

Provides high-fidelity, resilient website reading:
1. Fast direct HTTP extraction with realistic browser headers & BeautifulSoup.
2. RSS / Atom feed direct XML parsing for news feeds without HTML warnings.
3. Headless Playwright browser with anti-bot stealth flags for dynamic SPAs.
4. Cloudflare / Datadome / edge firewall bot-challenge detection.
5. Fallback to Jina Reader when direct fetch encounters strict firewalls.
6. Real-time Syndication Fallback (Google News RSS / publisher feeds) for blocked news portals.
7. Intelligent HTML cleaning: preserves headers and multiple articles while stripping ads & popups.
8. Structured Markdown output with metadata (title, description, URL, clean text).
"""

from __future__ import annotations

import asyncio
import logging
import re
import xml.etree.ElementTree as ET
from typing import Any
from urllib.parse import quote, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup, Comment, NavigableString, Tag

from server.cache import get as cache_get
from server.cache import put as cache_put

logger = logging.getLogger(__name__)

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,image/apng,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "DNT": "1",
    "Sec-Ch-Ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}

DISCARD_TAGS = {
    "script",
    "style",
    "noscript",
    "svg",
    "canvas",
    "iframe",
    "footer",
    "aside",
    "form",
    "button",
    "dialog",
    "menu",
}

DISCARD_CLASSES_OR_IDS = re.compile(
    r"(cookie-banner|cookie-consent|cookie-notice|advertisement|ad-container|ad-box|promo-popup|newsletter-signup|social-share|sponsor-content)",
    re.I,
)

BOT_BLOCK_PATTERNS = re.compile(
    r"(datadome|cf-browser-verification|attention required!|just a moment\.\.\.|access denied|robot check|security check|cloudflare|perimeterx|verify you are human|pardon our interruption)",
    re.I,
)


def parse_rss_or_atom(xml_text: str, url: str) -> dict[str, Any] | None:
    """Parse RSS or Atom XML feeds into structured markdown."""
    try:
        clean_xml = re.sub(r"<\?xml[^>]+\?>", "", xml_text).strip()
        root = ET.fromstring(clean_xml)

        # RSS 2.0
        channel = root.find("channel")
        if channel is not None:
            title = channel.findtext("title") or "RSS Feed"
            description = channel.findtext("description") or ""
            items = channel.findall("item")
            md_lines: list[str] = [f"# {title}\n"]
            for item in items[:30]:
                ititle = (item.findtext("title") or "Article").strip()
                ilink = (item.findtext("link") or "").strip()
                idesc = (item.findtext("description") or "").strip()
                idesc = re.sub(r"<[^>]+>", "", idesc).strip()
                idate = (item.findtext("pubDate") or "").strip()

                if ilink:
                    md_lines.append(f"### [{ititle}]({ilink})")
                else:
                    md_lines.append(f"### {ititle}")
                if idate:
                    md_lines.append(f"*{idate}*")
                if idesc:
                    md_lines.append(idesc)
                md_lines.append("")

            md = "\n".join(md_lines).strip()
            plain = re.sub(r"[#*`\[\]\(\)]", "", md)
            return {
                "title": title,
                "description": description,
                "url": url,
                "markdown": md,
                "text": plain,
                "is_feed": True,
            }

        # Atom feed
        if "feed" in root.tag.lower():
            title = root.findtext("{http://www.w3.org/2005/Atom}title") or "Atom Feed"
            entries = root.findall("{http://www.w3.org/2005/Atom}entry")
            md_lines = [f"# {title}\n"]
            for entry in entries[:30]:
                etitle = (entry.findtext("{http://www.w3.org/2005/Atom}title") or "Entry").strip()
                link_el = entry.find("{http://www.w3.org/2005/Atom}link")
                elink = link_el.attrib.get("href", "") if link_el is not None else ""
                esummary = (
                    entry.findtext("{http://www.w3.org/2005/Atom}summary")
                    or entry.findtext("{http://www.w3.org/2005/Atom}content")
                    or ""
                ).strip()
                esummary = re.sub(r"<[^>]+>", "", esummary).strip()
                epub = (entry.findtext("{http://www.w3.org/2005/Atom}updated") or "").strip()

                if elink:
                    md_lines.append(f"### [{etitle}]({elink})")
                else:
                    md_lines.append(f"### {etitle}")
                if epub:
                    md_lines.append(f"*{epub}*")
                if esummary:
                    md_lines.append(esummary)
                md_lines.append("")

            md = "\n".join(md_lines).strip()
            plain = re.sub(r"[#*`\[\]\(\)]", "", md)
            return {
                "title": title,
                "description": "",
                "url": url,
                "markdown": md,
                "text": plain,
                "is_feed": True,
            }
    except Exception:
        pass
    return None


def clean_html_to_markdown(html: str, base_url: str) -> dict[str, Any]:
    """Parse HTML (or XML feed) and extract clean, readable markdown content."""
    # First test if payload is an RSS or Atom XML feed
    first_chunk = html[:300].strip()
    if "<?xml" in first_chunk or "<rss" in first_chunk or "<feed" in first_chunk:
        feed_res = parse_rss_or_atom(html, base_url)
        if feed_res:
            return feed_res

    soup = BeautifulSoup(html, "html.parser")

    # Remove HTML comments
    for comment in soup.find_all(string=lambda t: isinstance(t, Comment)):
        comment.extract()

    # Extract title
    title = ""
    og_title = soup.find("meta", property="og:title")
    if og_title and og_title.get("content"):
        title = str(og_title["content"]).strip()
    elif soup.title and soup.title.string:
        title = soup.title.string.strip()

    # Extract description
    description = ""
    meta_desc = soup.find("meta", attrs={"name": re.compile(r"description", re.I)}) or soup.find(
        "meta", property="og:description"
    )
    if meta_desc and meta_desc.get("content"):
        description = str(meta_desc["content"]).strip()

    # Discard unwanted tags
    for tag in soup.find_all(DISCARD_TAGS):
        tag.decompose()

    # Discard boilerplate containers by class/id (cookies, ads, popups)
    for el in list(soup.find_all(["div", "section", "aside"])):
        if not getattr(el, "attrs", None):
            continue
        raw_cls = el.attrs.get("class", [])
        cls = " ".join(raw_cls) if isinstance(raw_cls, list) else str(raw_cls or "")
        el_id = str(el.attrs.get("id") or "")
        if (
            DISCARD_CLASSES_OR_IDS.search(cls) or DISCARD_CLASSES_OR_IDS.search(el_id)
        ) and el.parent and el.name not in ("body", "html"):
            if not el.find(["article", "main"]):
                el.decompose()

    # Target main content container
    articles = soup.find_all("article")
    article_text_len = sum(len(a.get_text()) for a in articles)

    main_candidates = [
        soup.find("main"),
        soup.find(role="main"),
        soup.find(id=re.compile(r"^(main|content|article-body|story|post)$", re.I)),
        soup.find(class_=re.compile(r"^(main|content|article-body|story|post)$", re.I)),
    ]
    main_el = next((c for c in main_candidates if c and len(c.get_text().strip()) >= 200), None)

    if not main_el:
        # If multiple articles are found (e.g. news portal or blog homepage)
        if len(articles) > 1 and article_text_len > 300:
            main_el = soup.new_tag("div")
            for a in articles:
                main_el.append(a)
        else:
            main_el = soup.body or soup

    # Convert nodes to markdown lines
    md_lines: list[str] = []

    def walk_node(node: Any, depth: int = 0) -> None:
        if isinstance(node, NavigableString):
            text = str(node).strip()
            if text:
                md_lines.append(text)
            return

        if not isinstance(node, Tag):
            return

        name = node.name.lower()

        if name in ("h1", "h2", "h3", "h4", "h5", "h6"):
            level = int(name[1])
            htext = node.get_text(separator=" ", strip=True)
            if htext:
                md_lines.append(f"\n{'#' * level} {htext}\n")
            return

        if name == "p":
            ptext = node.get_text(separator=" ", strip=True)
            if ptext:
                md_lines.append(f"\n{ptext}\n")
            return

        if name in ("ul", "ol"):
            md_lines.append("\n")
            for li in node.find_all("li", recursive=False):
                litext = li.get_text(separator=" ", strip=True)
                if litext:
                    bullet = "-" if name == "ul" else "1."
                    md_lines.append(f"{bullet} {litext}")
            md_lines.append("\n")
            return

        if name == "blockquote":
            btext = node.get_text(separator=" ", strip=True)
            if btext:
                md_lines.append(f"\n> {btext}\n")
            return

        if name == "pre":
            code_text = node.get_text(strip=True)
            if code_text:
                md_lines.append(f"\n```\n{code_text}\n```\n")
            return

        if name == "table":
            rows = node.find_all("tr")
            if rows:
                md_lines.append("\n")
                for r_idx, r in enumerate(rows[:25]):
                    cols = [c.get_text(strip=True) for c in r.find_all(["th", "td"])]
                    if cols:
                        md_lines.append("| " + " | ".join(cols) + " |")
                        if r_idx == 0:
                            md_lines.append("| " + " | ".join(["---"] * len(cols)) + " |")
                md_lines.append("\n")
            return

        for child in node.children:
            walk_node(child, depth + 1)

    walk_node(main_el)

    raw_md = "\n".join(md_lines)
    cleaned_md = re.sub(r"\n{3,}", "\n\n", raw_md).strip()

    plain_text = re.sub(r"[#*`>|]", "", cleaned_md)
    plain_text = re.sub(r"\s+", " ", plain_text).strip()

    return {
        "title": title or urlparse(base_url).hostname or "Web Page",
        "description": description,
        "url": base_url,
        "markdown": cleaned_md,
        "text": plain_text,
    }


async def fetch_http(url: str, timeout: float = 12.0) -> tuple[str | None, str | None]:
    """Direct HTTP request using realistic browser headers."""
    try:
        async with httpx.AsyncClient(
            headers=BROWSER_HEADERS,
            timeout=timeout,
            follow_redirects=True,
            verify=True,
        ) as client:
            resp = await client.get(url)
            if resp.status_code >= 400:
                return None, f"HTTP {resp.status_code}: {resp.reason_phrase}"
            return resp.text, None
    except Exception as e:
        return None, str(e)


async def fetch_playwright(url: str, timeout: float = 20.0) -> tuple[str | None, str | None]:
    """Fetch using headless Chromium browser with stealth flags for dynamic pages."""
    try:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-infobars",
                    "--window-position=0,0",
                    "--ignore-certificate-errors",
                ],
            )
            context = await browser.new_context(
                user_agent=BROWSER_HEADERS["User-Agent"],
                viewport={"width": 1440, "height": 900},
                locale="en-US",
                timezone_id="America/New_York",
            )
            # Remove navigator.webdriver detection signature
            await context.add_init_script(
                """
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                window.navigator.chrome = { runtime: {} };
                Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
                Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
                """
            )
            page = await context.new_page()
            await page.goto(url, wait_until="domcontentloaded", timeout=int(timeout * 1000))
            await asyncio.sleep(1.5)
            content = await page.content()
            await browser.close()
            return content, None
    except Exception as e:
        return None, str(e)


async def fetch_jina_reader(url: str, timeout: float = 12.0) -> tuple[str | None, str | None]:
    """Fetch markdown via Jina Reader fallback."""
    jina_url = f"https://r.jina.ai/{url}"
    try:
        async with httpx.AsyncClient(
            headers={"Accept": "text/markdown"},
            timeout=timeout,
            follow_redirects=True,
        ) as client:
            resp = await client.get(jina_url)
            if resp.status_code == 200 and resp.text:
                return resp.text, None
            return None, f"Jina HTTP {resp.status_code}"
    except Exception as e:
        return None, str(e)


async def fetch_syndication_fallback(url: str, timeout: float = 10.0) -> tuple[dict[str, Any] | None, str | None]:
    """Fetch live syndication stories for news / media domains blocked by anti-bot firewalls."""
    parsed = urlparse(url)
    host = parsed.hostname or ""
    domain = host.replace("www.", "")
    if not domain:
        return None, "invalid domain"

    # Query Google News RSS for this domain
    g_url = f"https://news.google.com/rss/search?q=site:{domain}&hl=en-US&gl=US&ceid=US:en"
    try:
        async with httpx.AsyncClient(headers=BROWSER_HEADERS, timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(g_url)
            if resp.status_code == 200:
                parsed_feed = parse_rss_or_atom(resp.text, url)
                if parsed_feed and len(parsed_feed.get("text", "")) >= 150:
                    parsed_feed["title"] = f"{domain.capitalize()} News (Live Syndication)"
                    parsed_feed["description"] = f"Live syndicated wires from {domain}"
                    return parsed_feed, None
    except Exception as e:
        return None, str(e)
    return None, "no syndicated wires found"


def _is_usable_html(html: str | None) -> bool:
    """Check if returned HTML contains actual content rather than a bot-block challenge."""
    if not html or len(html.strip()) < 150:
        return False
    # Check if page is a known bot challenge
    sample = html[:3000].lower()
    if BOT_BLOCK_PATTERNS.search(sample) and len(sample) < 2500:
        return False
    return True


async def read_website(
    url: str,
    render_js: bool = False,
    max_chars: int = 15_000,
    force_refresh: bool = False,
) -> dict[str, Any]:
    """Read and extract any website into clean structured Markdown.

    Tries:
    1. Cache lookup (unless force_refresh is True)
    2. Playwright with stealth (if render_js is True)
    3. Direct HTTP fetch + HTML cleaning
    4. Playwright headless browser fallback (if HTTP fails or returns bot challenge / empty)
    5. Jina Reader fallback
    6. News Syndication RSS fallback for blocked news portals
    """
    clean_url = str(url or "").strip()
    if not clean_url.startswith("http://") and not clean_url.startswith("https://"):
        clean_url = "https://" + clean_url

    cache_key = f"web_v2:{'js:' if render_js else ''}{clean_url}"
    if not force_refresh:
        cached = cache_get("web_page", cache_key)
        if isinstance(cached, dict) and cached.get("markdown") and len(cached.get("text", "")) >= 100:
            return cached

    method_used = "http"
    html_content: str | None = None
    extracted_text: str = ""
    error_log: list[str] = []

    # 1. Playwright if requested explicitly
    if render_js:
        pw_html, err = await fetch_playwright(clean_url)
        if _is_usable_html(pw_html):
            html_content = pw_html
            method_used = "playwright"
        else:
            error_log.append(f"Playwright failed: {err or 'bot block/empty'}")

    # 2. Fast Direct HTTP Fetch
    if not html_content:
        http_html, err = await fetch_http(clean_url)
        if _is_usable_html(http_html):
            # Verify that cleaner can extract meaningful text
            test_parsed = clean_html_to_markdown(http_html, clean_url)
            if len(test_parsed.get("text", "").strip()) >= 150 or test_parsed.get("is_feed"):
                html_content = http_html
                method_used = "http"
            else:
                error_log.append("Direct HTTP returned page with low readable text")
        else:
            error_log.append(f"Direct HTTP failed: {err or 'blocked by edge firewall'}")

    # 3. If HTTP was blocked, empty, or had low text, try Playwright fallback
    if not html_content and not render_js:
        pw_html, pw_err = await fetch_playwright(clean_url, timeout=16.0)
        if _is_usable_html(pw_html):
            test_parsed = clean_html_to_markdown(pw_html, clean_url)
            if len(test_parsed.get("text", "").strip()) >= 150:
                html_content = pw_html
                method_used = "playwright-fallback"
            else:
                error_log.append("Playwright returned page with low readable text")
        else:
            error_log.append(f"Playwright fallback failed: {pw_err or 'blocked by edge firewall'}")

    # 4. If still no valid HTML, try Jina Reader
    jina_markdown: str | None = None
    if not html_content:
        jina_md, jina_err = await fetch_jina_reader(clean_url)
        if jina_md and len(jina_md.strip()) >= 120 and not BOT_BLOCK_PATTERNS.search(jina_md[:500]):
            jina_markdown = jina_md
            method_used = "jina-reader"
        else:
            error_log.append(f"Jina reader fallback failed: {jina_err or 'blocked/empty'}")

    # 5. If still blocked, check Syndication Fallback for news domains
    syndication_result: dict[str, Any] | None = None
    if not html_content and not jina_markdown:
        syn_res, syn_err = await fetch_syndication_fallback(clean_url)
        if syn_res:
            syndication_result = syn_res
            method_used = "syndication-feed"
        else:
            error_log.append(f"Syndication fallback: {syn_err}")

    # Process into structured result
    if syndication_result:
        result = {
            "title": syndication_result["title"],
            "description": syndication_result["description"],
            "url": clean_url,
            "markdown": syndication_result["markdown"][:max_chars],
            "text": syndication_result["text"][:max_chars],
            "method": method_used,
            "chars": len(syndication_result["markdown"][:max_chars]),
        }
    elif jina_markdown:
        title = urlparse(clean_url).hostname or "Web Page"
        m_title = re.search(r"^Title:\s*(.+)$", jina_markdown, re.M)
        if m_title:
            title = m_title.group(1).strip()
        result = {
            "title": title,
            "description": f"Extracted via {method_used}",
            "url": clean_url,
            "markdown": jina_markdown[:max_chars],
            "text": jina_markdown[:max_chars],
            "method": method_used,
            "chars": len(jina_markdown[:max_chars]),
        }
    elif html_content:
        parsed = clean_html_to_markdown(html_content, clean_url)
        md_text = parsed["markdown"][:max_chars]
        if not md_text:
            md_text = parsed["text"][:max_chars]
        result = {
            "title": parsed["title"],
            "description": parsed["description"],
            "url": clean_url,
            "markdown": md_text or "No readable text content found on page.",
            "text": parsed["text"][:max_chars],
            "method": method_used,
            "chars": len(md_text),
        }
    else:
        err_detail = " | ".join(error_log)
        result = {
            "title": "Failed to Read Website",
            "description": "Connection or scraping error",
            "url": clean_url,
            "markdown": f"Could not read {clean_url}. Errors: {err_detail}",
            "text": f"Could not read {clean_url}.",
            "method": "error",
            "chars": 0,
            "error": err_detail,
        }

    # Save to SQLite KV cache
    if result.get("method") != "error":
        cache_put("web_page", result, cache_key)

    return result
