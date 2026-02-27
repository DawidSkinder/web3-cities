# dawidskinder.pl-2026
Personal website

## City Modes
- `top200` (default): **Top Coins Skyline (Binance Spot REST)**
- `btc`: **Bitcoin Spot Buys (Binance WS)**

Mode can be selected from the SANDBOX panel or via query param:
- `?mode=top200`
- `?mode=btc`

Fallback env:
- `VITE_CITY_MODE=top200|btc`

## Top Coins Snapshot (GitHub Pages Only)
Top Coins mode uses a static snapshot file served by GitHub Pages:
- `public/data/top-coins.json`

The frontend polls:
- `${BASE_URL}data/top-coins.json`

No Cloudflare Worker, no `/api/top-coins` backend route, and no third-party proxy is required.

## Snapshot Generation Workflow
Workflow:
- `.github/workflows/generate-top-coins-snapshot.yml`

It runs on:
- `schedule` every 5 minutes
- `workflow_dispatch`

What it does:
1. Fetches Binance Spot REST data (`/api/v3/ticker/24hr` + `/api/v3/exchangeInfo`).
2. Filters to `TRADING` symbols with quote asset `USDT`.
3. Ranks by `quoteVolume` descending (symbol tiebreak ascending).
4. Writes deterministic JSON to `public/data/top-coins.json`.
5. Commits only when the file content changed.

This gives cache/rate safety for viral traffic because all clients read one shared static snapshot from Pages.

## Local Development
1. Install dependencies:
   - `npm install`
2. Start dev server:
   - `npm run dev`

Optional:
- Generate a fresh snapshot locally:
  - `npm run generate:top-coins-snapshot`

## Deploy
- GitHub Pages deploy workflow: `.github/workflows/deploy.yml`
- Data snapshot workflow: `.github/workflows/generate-top-coins-snapshot.yml`

No Cloudflare secrets or worker deployment is needed.
