---
name: financial-markets
description: Query, cross-reference, and analyze real-time and extended-hours stock quotes, after-hours prints, pre-market data, and market news across Google Finance, Nasdaq, Yahoo Finance, and MarketWatch.
hooks: [on_user_message, on_plan, on_observations, on_before_judge]
tools: [financial_quote, financial_compare, financial_news, read_url, web_search, final_answer]
phase: gather
priority: 15
sources: [https://www.google.com/finance, https://www.nasdaq.com, https://finance.yahoo.com, https://www.marketwatch.com]
---

# Financial Markets Skill: Multi-Platform Quote & Tape Intelligence

SOP for querying, verifying, and synthesizing equity quotes and extended trading activity across Google Finance, Nasdaq, Yahoo Finance, and MarketWatch.

## 1. Supported Financial Venues & Capabilities

1. **Google Finance** (`https://www.google.com/finance`):
   - **URL Structure**: `https://www.google.com/finance/quote/{SYMBOL}:{EXCHANGE}` (e.g. `SHOE:NASDAQ`, `AAPL:NASDAQ`, `SPY:NYSEARCA`).
   - **Key Data**: Regular market price, net change, % change, after-hours extended tape (`After hours · HH:MM PM`), Day high/low, 52-week range, volume, and market capitalization.

2. **Nasdaq** (`https://www.nasdaq.com` & `https://api.nasdaq.com`):
   - **Endpoint**: `/api/quote/{SYMBOL}/info?assetclass=stocks`.
   - **Key Data**: Official exchange tape. Contains real-time `primaryData` (extended trading price, bid/ask spread, bid/ask size, real-time volume) and `secondaryData` (official 4:00 PM ET closing session print).

3. **Yahoo Finance** (`https://finance.yahoo.com` & v8 chart API):
   - **Endpoint**: `/v8/finance/chart/{SYMBOL}?includePrePost=true&interval=1d&range=1d`.
   - **Key Data**: `regularMarketPrice`, `chartPreviousClose`, `postMarketPrice`, `preMarketPrice`, `regularMarketVolume`, 52-week high/low, currency.

4. **MarketWatch** (`https://www.marketwatch.com`):
   - **URL Structure**: `https://www.marketwatch.com/investing/stock/{symbol}`.
   - **Key Data**: Intraday close, after-hours last trade, after-hours volume, after-hours timestamp, 65-day average volume comparison, and real-time market pulse news.

## 2. Trading Session Protocols (US Eastern Time)

- **Pre-Market Session**: 04:00 AM – 09:30 AM ET
- **Regular Trading Session**: 09:30 AM – 04:00 PM ET
- **After-Hours / Extended Session**: 04:00 PM – 08:00 PM ET

## 3. Tool Usage Workflow

1. **Quote Ingestion**:
   - Call `financial_quote(symbol="TICKER", source="all")` to simultaneously retrieve data from Google Finance, Nasdaq, Yahoo Finance, and MarketWatch.
   - For specific venue queries, specify `source="google"`, `source="nasdaq"`, `source="yahoo"`, or `source="marketwatch"`.

2. **Discrepancy Resolution & Tape Cross-Examination**:
   - Call `financial_compare(symbol="TICKER")` to align prints across all 4 venues.
   - When reporting after-hours data:
     - Always report the **exact timestamp** and **venue** of the trade.
     - Note that after-hours trading features lower liquidity and wider bid-ask spreads than the regular session.
     - If no post-market trades have occurred since the 4:00 PM close, explicitly report the regular session close as the prevailing reference mark.

3. **Contextual Market News**:
   - Call `financial_news(symbol="TICKER")` to retrieve accompanying catalysts, earnings reports, or analyst coverage from MarketWatch and financial wires.

4. **User-Facing Presentation**:
   - Present the data clearly with session status (Regular Close vs. After Hours), exact prices, net change, % change, volume, and timestamps.
   - Link to the canonical venue pages for user verification.
