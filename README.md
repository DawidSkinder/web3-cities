# dawidskinder.pl-2026
Personal website

## City Modes
- `top200` (default): **Top Coins Skyline (Binance Spot REST via server proxy)**
- `btc`: **Bitcoin Spot Buys (Binance WS)**

Mode can be selected from the SANDBOX panel or via query param:
- `?mode=top200`
- `?mode=btc`

Fallback env:
- `VITE_CITY_MODE=top200|btc`

Note:
- On `*.github.io` static hosting (no server functions), app falls back to `btc` by default unless `?mode=` or `VITE_CITY_MODE` explicitly selects another mode.

## Top Coins Proxy (`/api/top-coins`)
The frontend never calls Binance REST directly. It calls:

`GET /api/top-coins?limit=200&quote=USDT`

Implemented in `server/binanceProxy.ts` with:
- In-memory TTL cache (default `60s`)
- Request coalescing (concurrent clients share one upstream fetch)
- Binance 429/418 backoff + retry
- Stale fallback (`maxStale` default `10m`) when Binance is temporarily unavailable
- HTTP cache headers:
  - `Cache-Control: public, max-age=10, s-maxage=60, stale-while-revalidate=300`

## Run Locally
1. Install dependencies:
   - `npm install`
2. Start dev:
   - `npm run dev`

The Vite dev server mounts `/api/top-coins` through middleware and uses the same cache logic as production.

Optional envs:
- `VITE_TOP_COINS_POLL_MS` (default 60000, floor 30000)
- `VITE_TOP_COINS_LIMIT` (default 200)
- `VITE_TOP_COINS_QUOTE` (default `USDT`)
- `TOP_COINS_CACHE_TTL_MS` (default 60000)
- `TOP_COINS_CACHE_MAX_STALE_MS` (default 600000)

## Production Proxy Deployment
Production serverless handler:
- `api/top-coins.ts`

Deploy on a platform that supports serverless functions (e.g. Vercel/Netlify-compatible adapters) so `/api/top-coins` is served server-side with cache + stale safety.
