"""Financial Market Retrieval & Quote Engines for Poor Man AI.

Supports high-fidelity real-time and extended-hours (pre-market, regular, after-hours)
data retrieval across four primary financial sources:
1. Google Finance (https://www.google.com/finance)
2. Nasdaq (https://www.nasdaq.com)
3. Yahoo Finance (https://finance.yahoo.com)
4. MarketWatch (https://www.marketwatch.com)
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any
from urllib.parse import quote

import httpx

from server.cache import get as cache_get
from server.cache import put as cache_put
from server.web_reader import BROWSER_HEADERS, read_website

logger = logging.getLogger(__name__)

# Standard timeout for financial API requests
TIMEOUT = 12.0

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Ch-Ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
}


def _clean_str(text: str | None) -> str:
    if not text:
        return ""
    # Normalize narrow non-breaking spaces (\u202f), non-breaking spaces (\xa0), and extra whitespace
    t = text.replace("\u202f", " ").replace("\xa0", " ").strip()
    return re.sub(r"\s+", " ", t)


def _split_symbol(raw: str) -> tuple[str, str | None]:
    """Parse symbols like 'SHOE:NASDAQ', 'NASDAQ:SHOE', or bare 'SHOE'."""
    s = (raw or "").strip().upper()
    if ":" in s:
        parts = s.split(":", 1)
        # If exchange is first (e.g. NASDAQ:SHOE) vs symbol first (SHOE:NASDAQ)
        if parts[0] in {"NASDAQ", "NYSE", "AMEX", "INDEXNASDAQ", "INDEXSP", "INDEXDJX", "BATS", "OTC"}:
            return parts[1].strip(), parts[0].strip()
        return parts[0].strip(), parts[1].strip()
    return s, None


# ---------------------------------------------------------------------------
# 1. Yahoo Finance
# ---------------------------------------------------------------------------
async def fetch_yahoo_finance(symbol: str) -> dict[str, Any]:
    """Fetch quote and after-hours data from Yahoo Finance v8 chart API."""
    sym, _ = _split_symbol(symbol)
    cache_key = f"yf:{sym}"
    cached = cache_get("search", cache_key)
    if cached:
        return cached if isinstance(cached, dict) else json.loads(cached)

    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{quote(sym)}?includePrePost=true&interval=1d&range=1d"
    headers = {**DEFAULT_HEADERS, "Referer": "https://finance.yahoo.com"}

    async with httpx.AsyncClient(headers=headers, timeout=TIMEOUT) as client:
        try:
            resp = await client.get(url)
            if resp.status_code != 200:
                return {"source": "yahoo", "symbol": sym, "error": f"HTTP {resp.status_code}"}
            data = resp.json()
            res = data.get("chart", {}).get("result")
            if not res:
                err = data.get("chart", {}).get("error", {}).get("description", "Not found")
                return {"source": "yahoo", "symbol": sym, "error": err}
            
            meta = res[0].get("meta", {})
            reg_price = meta.get("regularMarketPrice")
            reg_prev = meta.get("chartPreviousClose") or meta.get("previousClose")
            reg_change = meta.get("fulldayChange") or (round(reg_price - reg_prev, 4) if reg_price and reg_prev else None)
            reg_pct = meta.get("regularMarketChangePercent")
            if reg_pct is None and reg_price and reg_prev and reg_prev > 0:
                reg_pct = round(((reg_price - reg_prev) / reg_prev) * 100, 2)

            post_price = meta.get("postMarketPrice")
            post_time = meta.get("postMarketTime")
            post_change = None
            post_pct = None
            if post_price and reg_price:
                post_change = round(post_price - reg_price, 4)
                if reg_price > 0:
                    post_pct = round((post_change / reg_price) * 100, 2)

            pre_price = meta.get("preMarketPrice")

            out = {
                "source": "yahoo",
                "source_url": f"https://finance.yahoo.com/quote/{sym}/",
                "symbol": sym,
                "company_name": meta.get("shortName") or meta.get("longName") or sym,
                "currency": meta.get("currency", "USD"),
                "exchange": meta.get("fullExchangeName") or meta.get("exchangeName"),
                "regular_market": {
                    "price": reg_price,
                    "change": reg_change,
                    "change_percent": f"{reg_pct:+.2f}%" if reg_pct is not None else None,
                    "previous_close": reg_prev,
                    "day_high": meta.get("regularMarketDayHigh"),
                    "day_low": meta.get("regularMarketDayLow"),
                    "volume": meta.get("regularMarketVolume"),
                },
                "after_hours": {
                    "price": post_price,
                    "change": post_change,
                    "change_percent": f"{post_pct:+.2f}%" if post_pct is not None else None,
                    "timestamp": post_time,
                } if post_price else None,
                "pre_market": {
                    "price": pre_price,
                } if pre_price else None,
                "fifty_two_week_high": meta.get("fiftyTwoWeekHigh"),
                "fifty_two_week_low": meta.get("fiftyTwoWeekLow"),
            }
            cache_put("search", out, cache_key, ttl=60)
            return out
        except Exception as e:
            return {"source": "yahoo", "symbol": sym, "error": str(e)}


# ---------------------------------------------------------------------------
# 2. Nasdaq
# ---------------------------------------------------------------------------
async def fetch_nasdaq(symbol: str) -> dict[str, Any]:
    """Fetch official Nasdaq real-time, closing, and extended-hours quote."""
    sym, _ = _split_symbol(symbol)
    cache_key = f"nasdaq:{sym}"
    cached = cache_get("search", cache_key)
    if cached:
        return cached if isinstance(cached, dict) else json.loads(cached)

    url = f"https://api.nasdaq.com/api/quote/{quote(sym)}/info?assetclass=stocks"
    headers = {
        **DEFAULT_HEADERS,
        "Referer": f"https://www.nasdaq.com/market-activity/stocks/{quote(sym.lower())}",
        "Origin": "https://www.nasdaq.com",
    }

    async with httpx.AsyncClient(headers=headers, timeout=TIMEOUT) as client:
        try:
            resp = await client.get(url)
            if resp.status_code != 200:
                return {"source": "nasdaq", "symbol": sym, "error": f"HTTP {resp.status_code}"}
            data = resp.json()
            body = data.get("data")
            if not body:
                return {"source": "nasdaq", "symbol": sym, "error": "Symbol not found on Nasdaq"}

            primary = body.get("primaryData") or {}
            secondary = body.get("secondaryData") or {}
            key_stats = body.get("keyStats") or {}

            # In Nasdaq API:
            # During extended trading (pre or post market), primaryData contains the real-time extended price
            # and secondaryData contains the regular session close.
            # During regular session, primaryData contains the active session price.
            sec_label = str(secondary.get("lastTradeTimestamp") or "")
            is_extended = bool(primary.get("isRealTime")) and ("Closed at" in sec_label)

            reg_data = secondary if is_extended else primary
            ext_data = primary if is_extended else None

            out = {
                "source": "nasdaq",
                "source_url": f"https://www.nasdaq.com/market-activity/stocks/{sym.lower()}",
                "symbol": sym,
                "company_name": _clean_str(body.get("companyName")),
                "exchange": body.get("exchange"),
                "stock_type": body.get("stockType"),
                "regular_market": {
                    "price": _clean_str(reg_data.get("lastSalePrice")),
                    "change": _clean_str(reg_data.get("netChange")),
                    "change_percent": _clean_str(reg_data.get("percentageChange")),
                    "timestamp": _clean_str(reg_data.get("lastTradeTimestamp")),
                    "volume": _clean_str(reg_data.get("volume")),
                },
                "after_hours": {
                    "price": _clean_str(ext_data.get("lastSalePrice")),
                    "change": _clean_str(ext_data.get("netChange")),
                    "change_percent": _clean_str(ext_data.get("percentageChange")),
                    "timestamp": _clean_str(ext_data.get("lastTradeTimestamp")),
                    "bid": _clean_str(ext_data.get("bidPrice")),
                    "ask": _clean_str(ext_data.get("askPrice")),
                    "volume": _clean_str(ext_data.get("volume")),
                } if ext_data else None,
                "key_stats": {
                    "market_cap": _clean_str(key_stats.get("MarketCap", {}).get("value") if isinstance(key_stats.get("MarketCap"), dict) else str(key_stats.get("MarketCap") or "")),
                    "day_range": _clean_str(key_stats.get("DayRange", {}).get("value") if isinstance(key_stats.get("DayRange"), dict) else str(key_stats.get("DayRange") or "")),
                    "fifty_two_week_range": _clean_str(key_stats.get("fiftyTwoWeekHighLow", {}).get("value") if isinstance(key_stats.get("fiftyTwoWeekHighLow"), dict) else str(key_stats.get("fiftyTwoWeekHighLow") or "")),
                },
            }
            cache_put("search", out, cache_key, ttl=60)
            return out
        except Exception as e:
            return {"source": "nasdaq", "symbol": sym, "error": str(e)}


# ---------------------------------------------------------------------------
# 3. Google Finance
# ---------------------------------------------------------------------------
async def fetch_google_finance(symbol: str, exchange: str | None = None) -> dict[str, Any]:
    """Fetch live quote, after-hours, and summary stats from Google Finance."""
    sym, parsed_ex = _split_symbol(symbol)
    ex = exchange or parsed_ex or "NASDAQ"
    cache_key = f"gf:{sym}:{ex}"
    cached = cache_get("search", cache_key)
    if cached:
        return cached if isinstance(cached, dict) else json.loads(cached)

    url = f"https://www.google.com/finance/quote/{quote(sym)}:{quote(ex)}"
    res = await read_website(url, max_chars=14_000)
    if res.get("method") == "error" or not res.get("markdown"):
        # Try alternate fallback without exchange or with NYSE
        if ex == "NASDAQ":
            url_alt = f"https://www.google.com/finance/quote/{quote(sym)}:NYSE"
            res = await read_website(url_alt, max_chars=14_000)
            if res.get("method") != "error":
                ex = "NYSE"
                url = url_alt

    md = res.get("markdown") or ""
    title = res.get("title") or ""
    if "Stock Price & News" not in title and not md:
        return {"source": "google_finance", "symbol": sym, "exchange": ex, "error": "Unable to extract quote from Google Finance"}

    # Extract price lines
    clean_md = _clean_str(md)
    lines = [ln.strip() for ln in md.splitlines() if ln.strip()]

    company_name = None
    m_name = re.search(r"^(.*?)\s*\(([A-Z]+)\)\s+Stock Price", title)
    if m_name:
        company_name = m_name.group(1).strip()

    # Search for regular price and after-hours in lines
    reg_price = None
    reg_change = None
    reg_pct = None
    ah_price = None
    ah_change = None
    ah_pct = None
    ah_time = None
    mkt_cap = None
    volume = None
    range_52w = None

    for i, line in enumerate(lines):
        line_clean = _clean_str(line)
        # Look for $12.71 pattern
        if re.match(r"^\$\s*\d+(?:\.\d+)?$", line_clean) and not reg_price:
            reg_price = line_clean
            # Subsequent lines often contain change
            window = " ".join(_clean_str(ln) for ln in lines[i : min(i + 5, len(lines))])
            m_chg = re.search(r"([+-]?\d+(?:\.\d+)?%)\s*\(\s*([+-]?\d+(?:\.\d+)?)\s*\)", window)
            if m_chg:
                reg_pct = m_chg.group(1)
                reg_change = m_chg.group(2)

        if "after hours" in line_clean.lower():
            # Check lines around it for after hours price
            window_ah = lines[max(0, i - 4) : min(i + 4, len(lines))]
            for al in window_ah:
                al_c = _clean_str(al)
                if re.match(r"^\$\s*\d+(?:\.\d+)?$", al_c) and al_c != reg_price:
                    ah_price = al_c
                    break
                elif re.match(r"^\$\s*\d+(?:\.\d+)?$", al_c) and not ah_price:
                    ah_price = al_c
            # Find time e.g. 6:12 PM
            m_time = re.search(r"\d{1,2}:\d{2}\s*(?:AM|PM)", line_clean, re.I)
            if m_time:
                ah_time = m_time.group(0)

        if line_clean.lower().startswith("mkt. cap") or line_clean.lower().startswith("market cap"):
            if i + 1 < len(lines):
                mkt_cap = _clean_str(lines[i + 1])
        if line_clean.lower().startswith("volume") and not volume:
            if i + 1 < len(lines):
                volume = _clean_str(lines[i + 1])
        if "52-wk high" in line_clean.lower() or "52 week high" in line_clean.lower():
            if i + 1 < len(lines):
                range_52w = _clean_str(lines[i + 1])

    out = {
        "source": "google_finance",
        "source_url": url,
        "symbol": sym,
        "exchange": ex,
        "company_name": company_name or sym,
        "regular_market": {
            "price": reg_price,
            "change": reg_change,
            "change_percent": reg_pct,
            "volume": volume,
            "market_cap": mkt_cap,
        },
        "after_hours": {
            "price": ah_price or reg_price,
            "change": ah_change,
            "change_percent": ah_pct,
            "timestamp": ah_time,
        } if ("after hours" in clean_md.lower() or ah_price) else None,
        "fifty_two_week_high_low": range_52w,
    }
    cache_put("search", out, cache_key, ttl=60)
    return out


# ---------------------------------------------------------------------------
# 4. MarketWatch
# ---------------------------------------------------------------------------
async def fetch_marketwatch(symbol: str) -> dict[str, Any]:
    """Fetch real-time, closing, and extended-hours quote from MarketWatch."""
    sym, _ = _split_symbol(symbol)
    cache_key = f"mw:{sym}"
    cached = cache_get("search", cache_key)
    if cached:
        return cached if isinstance(cached, dict) else json.loads(cached)

    url = f"https://www.marketwatch.com/investing/stock/{quote(sym.lower())}"
    res = await read_website(url, max_chars=14_000)
    if res.get("method") == "error" or not res.get("markdown"):
        return {"source": "marketwatch", "symbol": sym, "error": "Unable to load MarketWatch page"}

    md = res.get("markdown") or ""
    title = res.get("title") or ""
    lines = [ln.strip() for ln in md.splitlines() if ln.strip()]

    company_name = None
    m_name = re.search(r"^(?:[A-Z0-9]+)\s+Stock Price\s*\|\s*(.*?)\s+Stock Quote", title, re.I)
    if m_name:
        company_name = m_name.group(1).strip()

    has_after_hours = False
    ah_price = None
    ah_change = None
    ah_pct = None
    ah_time = None
    ah_volume = None

    reg_close = None
    reg_change = None
    reg_pct = None
    day_range = None
    w52_range = None
    open_price = None
    volume = None

    for i, line in enumerate(lines):
        line_clean = _clean_str(line)
        if line_clean.lower() == "after hours":
            has_after_hours = True
            # Search nearby lines for after hours metrics
            for j in range(i, min(i + 15, len(lines))):
                sub = _clean_str(lines[j])
                if "last updated:" in sub.lower() and j + 1 < len(lines):
                    ah_time = _clean_str(lines[j + 1])
                m_p = re.search(r"##\s*\$\s*(\d+(?:\.\d+)?)", sub)
                if m_p and not ah_price:
                    ah_price = f"${m_p.group(1)}"
                if "after hours volume:" in sub.lower() and j + 1 < len(lines):
                    ah_volume = _clean_str(lines[j + 1])

        # Closing table parse
        if "| Close | Chg | Chg % |" in line or "| Close |" in line:
            if i + 2 < len(lines):
                parts = [p.strip() for p in lines[i + 2].split("|") if p.strip()]
                if len(parts) >= 3:
                    reg_close = parts[0]
                    reg_change = parts[1]
                    reg_pct = parts[2]

        if "day range" in line_clean.lower():
            if i >= 1 and i + 1 < len(lines):
                day_range = f"{_clean_str(lines[i-1])} - {_clean_str(lines[i+1])}"
        if "52 week range" in line_clean.lower():
            if i >= 1 and i + 1 < len(lines):
                w52_range = f"{_clean_str(lines[i-1])} - {_clean_str(lines[i+1])}"
        if line_clean.lower().startswith("- open") or line_clean.lower().startswith("open"):
            m_op = re.search(r"\$\s*\d+(?:\.\d+)?", line_clean)
            if m_op:
                open_price = m_op.group(0)

    # If regular close wasn't in table, fallback to standard header parse
    if not reg_close and ah_price:
        reg_close = ah_price

    out = {
        "source": "marketwatch",
        "source_url": url,
        "symbol": sym,
        "company_name": company_name or sym,
        "regular_market": {
            "price": reg_close,
            "change": reg_change,
            "change_percent": reg_pct,
            "open": open_price,
            "day_range": day_range,
        },
        "after_hours": {
            "price": ah_price,
            "volume": ah_volume,
            "timestamp": ah_time,
        } if has_after_hours else None,
        "fifty_two_week_range": w52_range,
    }
    cache_put("search", out, cache_key, ttl=60)
    return out


# ---------------------------------------------------------------------------
# Aggregator & Comparator Tools
# ---------------------------------------------------------------------------
async def fetch_financial_quote(
    symbol: str,
    source: str = "all",
    include_after_hours: bool = True,
) -> dict[str, Any]:
    """Fetch quotes across Google Finance, Nasdaq, Yahoo Finance, and MarketWatch."""
    src = (source or "all").lower().strip()
    tasks: dict[str, Any] = {}

    if src in {"all", "nasdaq"}:
        tasks["nasdaq"] = fetch_nasdaq(symbol)
    if src in {"all", "yahoo", "yahoo_finance"}:
        tasks["yahoo"] = fetch_yahoo_finance(symbol)
    if src in {"all", "google", "google_finance"}:
        tasks["google"] = fetch_google_finance(symbol)
    if src in {"all", "marketwatch"}:
        tasks["marketwatch"] = fetch_marketwatch(symbol)

    keys = list(tasks.keys())
    results = await asyncio.gather(*(tasks[k] for k in keys), return_exceptions=True)

    data: dict[str, Any] = {}
    for k, res in zip(keys, results):
        if isinstance(res, Exception):
            data[k] = {"error": str(res)}
        else:
            data[k] = res

    # Synthesize consensus price
    prices: list[float] = []
    ah_prices: list[float] = []
    company = None

    for d in data.values():
        if not isinstance(d, dict) or d.get("error"):
            continue
        if not company and d.get("company_name"):
            company = d.get("company_name")
        rm = d.get("regular_market") or {}
        p_raw = rm.get("price")
        if p_raw is not None:
            clean_num = re.sub(r"[^\d.]+", "", str(p_raw))
            try:
                prices.append(float(clean_num))
            except ValueError:
                pass
        ah = d.get("after_hours") or {}
        ah_raw = ah.get("price")
        if ah_raw is not None:
            clean_ah = re.sub(r"[^\d.]+", "", str(ah_raw))
            try:
                ah_prices.append(float(clean_ah))
            except ValueError:
                pass

    consensus = {
        "symbol": symbol.upper(),
        "company_name": company or symbol.upper(),
        "regular_market_consensus_price": round(sum(prices) / len(prices), 2) if prices else None,
        "after_hours_consensus_price": round(sum(ah_prices) / len(ah_prices), 2) if ah_prices else None,
        "reporting_sources": len([d for d in data.values() if isinstance(d, dict) and not d.get("error")]),
    }

    return {
        "symbol": symbol.upper(),
        "consensus": consensus,
        "sources": data,
    }


async def compare_financial_quotes(symbol: str, sources: list[str] | None = None) -> dict[str, Any]:
    """Cross-examine quotes from Google Finance, Nasdaq, Yahoo Finance, and MarketWatch."""
    quotes = await fetch_financial_quote(symbol, source="all")
    src_data = quotes.get("sources", {})

    comparison: list[dict[str, Any]] = []
    for s_name, item in src_data.items():
        if isinstance(item, dict) and not item.get("error"):
            rm = item.get("regular_market") or {}
            ah = item.get("after_hours") or {}
            comparison.append(
                {
                    "source": s_name,
                    "url": item.get("source_url"),
                    "regular_price": rm.get("price"),
                    "regular_change": rm.get("change_percent") or rm.get("change"),
                    "after_hours_price": ah.get("price") if ah else None,
                    "after_hours_change": ah.get("change_percent") or ah.get("change") if ah else None,
                    "after_hours_timestamp": ah.get("timestamp") if ah else None,
                }
            )

    return {
        "symbol": symbol.upper(),
        "comparison_table": comparison,
        "consensus": quotes.get("consensus"),
    }


async def fetch_financial_news(symbol: str, source: str = "all") -> dict[str, Any]:
    """Extract financial headlines and market commentary for a symbol."""
    sym, _ = _split_symbol(symbol)
    articles: list[dict[str, str]] = []

    # 1. MarketWatch news
    try:
        mw_res = await read_website(f"https://www.marketwatch.com/investing/stock/{quote(sym.lower())}", max_chars=8000)
        md = mw_res.get("markdown") or ""
        lines = [ln.strip() for ln in md.splitlines() if ln.strip()]
        for ln in lines:
            if re.match(r"^-\s*\d{1,2}:\d{2}[ap]\s+", ln, re.I):
                clean_headline = re.sub(r"^-\s*\d{1,2}:\d{2}[ap]\s+", "", ln).strip()
                articles.append({"source": "MarketWatch", "headline": clean_headline})
    except Exception as e:
        logger.warning("Error fetching MarketWatch news: %s", e)

    # 2. Google Finance news via search
    try:
        from server.tools import run_tool
        raw_hits = await run_tool("web_search", {"query": f"{sym} stock news MarketWatch Google Finance"})
        from server.reason import parse_hits
        for h in parse_hits(raw_hits)[:5]:
            articles.append({"source": h.get("title") or "Web", "headline": h.get("snippet") or "", "url": h.get("url") or ""})
    except Exception as e:
        logger.warning("Error fetching web news: %s", e)

    return {
        "symbol": sym,
        "headlines": articles[:10],
    }
