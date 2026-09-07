# bur market analyzer

A live crypto research workspace with technical analysis, a persistent paper account, and **bur bot**, an experimental Spot trading assistant that requires approval for every order. Light is the default; Basic themes offer a Light/Dark switch and Advanced themes offer Espresso, Walnut, Sand, and Midnight. The supplied bear image is the brand asset.

## 1. Architecture and market connectors

React 19 + Vinext/Vite + Tailwind 4 + the bundled shadcn/Base UI primitives. The hosted backend runs on Cloudflare Workers with D1 persistence and a private R2 credential vault. Lightweight Charts 5 draws real candles and technical studies. A browser Web Worker owns analysis, preventing streaming calculations from blocking interaction.

```
Binance REST + WebSocket / alternate candle providers
                   ↓ canonical UTC bars and depth
         MarketSession: history, recovery, deduplication
                   ↓
     IndicatorEngine + AdvancedEngine + Calibration
                   ↓ bounded delta updates
    Dashboard → user-reviewed proposal → approval API
                                      ↓
                            D1 paper ledger / Binance Spot
```

`lib/market/types.ts` defines the abstract `MarketConnector` and standard `Bar`, `Book`, `Subscription`, and `MarketEvent` contracts. Implement `history()` and `connect()` to add another venue. Providers do not own scoring or UI logic.

- **Binance auto:** public read-only WebSockets with alternate hosts, a watchdog, capped exponential reconnect delay with jitter, REST fallback, and history recovery. Top-20 depth events are complete snapshots, not diff updates. Prices are USDT.
- **Binance live polling:** same market and execution venue, asynchronous REST checks approximately every three seconds plus request latency. This survives blocked WebSockets when REST is reachable.
- **Coinbase:** public USD candle charts for BTC, ETH, and SOL; checks every five seconds plus request latency. Candle publication can lag. BNB is unavailable. This is chart-only and does not supply executable Binance depth.
- **Yahoo Finance:** unofficial indicative USD chart endpoint, checked every 15 seconds. It can return 429 or regional/provider errors; no Yahoo order book exists here. The verification environment returned 429, so Yahoo connectivity is not claimed as verified.
- **Replay:** explicitly synthetic, accelerated, deterministic prices. Never used to execute paper or real orders.

The app never silently changes venue, quote currency, or switches live mode to synthetic prices. No external connection can be guaranteed uninterrupted. Failure states retain the last chart while stale execution data blocks orders. REST caches are brief; reconnects rebuild missing completed candles before analysis resumes. Prices across USD and USDT venues, last trades, bids, asks, and closed candles need not match. The dashboard labels the source and UTC candle time. Historical signal entries are reference prices at the completed candle, not current offers.

An optional dedicated Node service (`server/index.ts`) shares sessions among clients, fans out bounded delta frames, enforces origin and client limits, handles slow consumers and heartbeats, and closes cleanly. Run it separately; the hosted dashboard uses the browser worker and same-origin APIs, not this Node process.

## 2. Analysis and probabilities

Core streaming indicators: SMA-seeded EMA 9/21/50/200, Wilder RSI 14 and ATR 14, MACD 12/26/9, and population-variance Bollinger Bands 20/2. Recursive indicators update in constant time. Advanced calculations use windows bounded to 201 bars. Partial candles can update the chart but never enter recursive indicators, scoring, or calibration. Committed points are bounded to 600 and signal history to 80.

The complete implemented inventory and formulas are in the website's **About bur bot** page and `lib/engine/advanced.ts`: SMA, WMA, VWMA, UTC VWAP, ADX/DI, stochastic, StochRSI, CCI, Williams %R, ROC, momentum, OBV, MFI, CMF, volume z-score, Keltner, Donchian, historical volatility, unshifted Ichimoku lines, Supertrend, prior-day pivots, and 52-bar Fibonacci levels. There are **47 numeric technical readouts and 13 named candle patterns**, not every possible indicator. Diagnostic indicators are not all counted as independent votes.

Bur Confluence v2 weights trend alignment 30, MACD momentum 20, RSI balance 10, band position 5, volume flow 10, trend strength 10, VWAP position 5, and directional candle patterns 10. Each factor is bounded to ±1. Scores ≥35 mean BUY, ≤−35 mean SELL, otherwise HOLD. Stops use 1.5 ATR and targets 2R, bounded against implausible risk levels. These are planning references, not automatic exit orders.

Calibration opens at most one non-overlapping historical trial per market. Only subsequent candles can resolve it. Target before stop within 12 candles is a success only when target return exceeds 12 bps assumed costs. Same-candle target/stop touches and timeouts count as failures. The last 300 resolved trials are separated by direction. The estimate is `100 × (wins + 2) / (trials + 4)` with a Wilson 95% sampling interval. No samples means no percentage; fewer than 30 is exploratory. Reloading a finite history window can change the calibration sample.

**This is not an independently validated live win rate or the probability that the next tick rises.** Historical OHLC trials do not model book execution, news history, market impact, or changing fees. There is no claim of profitable out-of-sample performance.

CoinDesk and Cointelegraph RSS provide current linked headlines. The news gate needs recent healthy coverage and blocks relevant major-risk headlines in the last hour. Headline sentiment is a keyword heuristic, not a fact check or a trained news prediction model.

## 3. Dashboard, bot, and paper trading

- Candlesticks; individually selectable EMA overlays, bands, VWAP, channels, levels and other studies; optional Volume/RSI/MACD/ATR and advanced oscillator panels; signal arrows.
- Settings persist theme, chart studies, minimum estimated success (default **60%**), and minimum trials (default **30**) locally. Chart visibility never changes the strategy formula.
- bur bot checks the selected market every **30 seconds while running**. Browsers may throttle background tabs. Qualified proposals show a top popup with estimated success, trials, side, quantity, and reference price. HOLD, insufficient samples, stale data, targets below costs, and below-threshold estimates remain quiet and explain themselves in bot status. Successful proposals are deduplicated per completed candle.
- Both client and server enforce the reliability filter; the server recomputes the current signal and rechecks news and market depth. Changing source, market, timeframe, destination, or bot parameters pauses the bot.
- Paper accounts start with 100,000 virtual USDT, scoped to the signed-in user and stored in D1. Fills sweep current Binance top-20 depth, add 1 bp adverse slippage and 10 bps fees, and use an integer ledger with BigInt intermediates. Actual exchange queue priority and fills cannot be reproduced exactly.
- Every order has a 30-second review, explicit approval, cash/inventory checks, exchange quantity/notional filters, a 1,000 USDT cap, and a 100 reviewed-order daily limit. Spot SELL reduces owned assets; there are no short, margin, leverage, withdrawal, or transfer endpoints.
- D1 transactional compare-and-swap prevents duplicate paper fills. Real orders are claimed before submission; ambiguous responses become UNKNOWN and block subsequent real orders until reconciliation. No automatic retry of a Binance order POST.
- Market orders recheck a 0.5% reference-price tolerance before submission; that does not guarantee the final exchange fill price. Pause cancels pending approvals and prevents new submissions, but cannot reverse an order already sent.
- Order history, CSV export, account balances, positions, fees, realized and marked P&L, and a cost-aware risk/reward calculator are included.

## 4. Run and verify

Requires Node 22.13+ (tested with Node 26) and npm.

```sh
npm ci
node scripts/setup-vault.mjs
npx wrangler d1 migrations apply DB --local --config wrangler.local.json
npm run dev -- --port 3000
```

Local preview uses the Sites development plugin's identity; outside its development auth proxy, the explicitly localhost-only development fallback applies. Production requires the Sites dispatcher-injected authenticated user header. **Do not deploy the Worker directly to an untrusted, public origin without replacing this boundary with verified authentication.** All database reads/writes are user-scoped; mutation APIs require same-origin JSON.

```sh
npm run typecheck
npm test
npm run build
# Optional local API integration tests; executes virtual paper trades only:
npx tsx tests/http.integration.ts
# Optional dedicated market stream:
npm run server
```

The stream endpoint is `ws://localhost:8080/stream?symbol=BTCUSDT&interval=1m&mode=live` with an allowed Origin header; `/healthz` reports service health. Set `MARKET_ALLOWED_ORIGINS`, `MARKET_HOST`, and `MARKET_PORT` for a controlled Node deployment. Terminate TLS at a trusted ingress for remote use.

D1 schema lives in `db/schema.ts`, with committed migrations in `drizzle/`. Generate future migrations with the checked-in Drizzle configuration. Sites packaging includes these migrations and provisions the logical `DB` and `VAULT` bindings from `.openai/hosting.json`.

### Credential vault

Binance API key/secret inputs are never stored in browser storage or sent to the analysis worker. The backend verifies account trading access and encrypts credentials with AES-GCM, a fresh nonce, and the user identity as authenticated additional data. Decryption stays server-side.

An optional private runtime `CREDENTIAL_ENCRYPTION_KEY` contains 32 random bytes encoded as base64. Local setup writes `.dev.vars` with exclusive creation, permissions 0600, and no key output. `.env*`, `.dev.vars*`, build output, and local databases are excluded from Git and distribution.

Without an environment key, the hosted Worker generates one internally and stores it in the private R2 `VAULT` binding using conditional first-write creation. No public routes expose this storage or key. R2 and the D1 encrypted credentials must both remain private. Back up both according to your retention policy. Do not delete/replace the vault key or switch key sources without a controlled credential re-encryption migration; reconnect accounts if a key is lost. Restrict site editing access because an operator able to change server code can access its secrets.

### Verification scope and deployment limits

Automated tests cover indicator warmup, zero-variance cases, gaps, pattern recognition, no future-data leakage, probability uncertainty, risk sizing, paper accounting, encryption identity binding, news gating, and bot filter boundaries. Local HTTP integration verifies actual live-priced paper proposals, explicit consent, duplicate/concurrent approval handling, cancellation, pause, and origin checks.

Public Binance quotes and streaming depth and Coinbase candles were checked. The app matched a simultaneous Binance BTCUSDT bid/ask comparison within one cent. This point-in-time result is not a permanent accuracy guarantee. No actual Binance credentials were supplied during development, and no real orders were placed. Authenticated Binance trading still requires testing with the user's eligible account and API permissions. Yahoo returned 429 in this environment. The experimental strategy is not financially validated for real-money use.

Provider references: [Binance Spot API](https://developers.binance.com/docs/binance-spot-api-docs), [Coinbase Exchange](https://docs.cdp.coinbase.com/exchange/docs), [Lightweight Charts](https://tradingview.github.io/lightweight-charts/), [Cloudflare R2](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
