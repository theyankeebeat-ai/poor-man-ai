---
name: financial-markets
topics: [stocks, finance, quotes, after-hours, pre-market, google-finance, nasdaq, yahoo-finance, marketwatch, ticker, market-hours]
sources: [https://www.google.com/finance, https://www.nasdaq.com, https://finance.yahoo.com, https://www.marketwatch.com]
---

# Knowledge Playbook: Financial Market Intelligence & Multi-Venue Tape

How to systematically extract, verify, and reason about US stock quotes and extended-hours trading from Google Finance, Nasdaq, Yahoo Finance, and MarketWatch.

## 1. Platform Profiles & Ingestion Mechanics

### Google Finance (`https://www.google.com/finance`)
- **Canonical Routing**: URLs follow `https://www.google.com/finance/quote/{TICKER}:{EXCHANGE}`. Common exchanges include `NASDAQ`, `NYSE`, `AMEX`, `INDEXNASDAQ` (.IXIC), `INDEXSP` (.INX), `INDEXDJX` (.DJI).
- **DOM Structure**:
  - Regular price: `div.YMlKec.fxKbKc` or `div[data-last-price]`.
  - Intraday change: Follows `Today` with signed percentage and delta (e.g., `+3.50% (+0.43)`).
  - Extended Hours: Highlighted with bedtime/moon icon, formatted as `After hours · HH:MM PM` with price delta relative to 4:00 PM close.
  - Core Fundamentals: Open, High, Low, Market Cap, P/E ratio, Dividend yield, 52-wk high/low.

### Nasdaq Official Exchange (`https://www.nasdaq.com`)
- **REST Endpoints**:
  - Quote summary: `https://api.nasdaq.com/api/quote/{TICKER}/info?assetclass=stocks`.
  - Extended trading: `https://api.nasdaq.com/api/quote/{TICKER}/extended-trading?assetclass=stocks`.
- **Session Splitting**:
  - `primaryData`: Contains active trading session. During 4:00 PM – 8:00 PM ET, `primaryData` displays the real-time after-hours prints, bid, ask, and volume.
  - `secondaryData`: Preserves the official closing bell print at 4:00 PM ET with `Closed at [Date] 4:00 PM ET`.
  - Tape Authority: Official regulatory record for all Nasdaq-listed equities (e.g. `SHOE:NASDAQ`, `AAPL`, `MSFT`).

### Yahoo Finance (`https://finance.yahoo.com`)
- **JSON API**: `https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}?includePrePost=true&interval=1d&range=1d`.
- **Fields**:
  - `regularMarketPrice`, `regularMarketChangePercent`, `regularMarketVolume`.
  - `postMarketPrice`, `postMarketChange`, `postMarketTime` (Unix epoch).
  - `preMarketPrice`, `preMarketTime`.
  - `chartPreviousClose`: Yesterday's official close.

### MarketWatch (`https://www.marketwatch.com`)
- **URL Route**: `https://www.marketwatch.com/investing/stock/{ticker}`.
- **Features**:
  - Distinct `After Hours` section showing exact timestamp of last trade (e.g. `Sep 11, 2026 4:26 p.m. EDT`), delayed quote, and `After Hours Volume`.
  - Closing summary table: `| Close | Chg | Chg % |`.
  - Intraday range, 52-week range, open price, and live financial news feed.

## 2. Trading Sessions & Mechanics (US Equities)

1. **Pre-Market (04:00 – 09:30 ET)**:
   - Early electronic matching via ECNs. Lower liquidity, wider bid-ask spreads.
2. **Regular Session (09:30 – 16:00 ET)**:
   - Primary market hours with continuous order matching and high liquidity.
3. **After-Hours / Post-Market (16:00 – 20:00 ET)**:
   - Electronic trading following earnings releases and corporate announcements.
   - Prices can remain stagnant if no shares are exchanged; last trade timestamp is essential.

## 3. Consensus & Cross-Examination Protocol

- Always consult multiple sources (Google Finance, Nasdaq, Yahoo Finance, MarketWatch) before reporting after-hours figures.
- When there are no post-market trades, report the 4:00 PM regular session close and clarify that after-hours trades have not crossed since the closing bell.
- Always disclose the timestamp associated with any extended-hours quote.
