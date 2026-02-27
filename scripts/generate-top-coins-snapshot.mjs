import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BINANCE_TICKER_24H_URL = 'https://api.binance.com/api/v3/ticker/24hr';
const BINANCE_EXCHANGE_INFO_URL = 'https://api.binance.com/api/v3/exchangeInfo';
const QUOTE_ASSET = 'USDT';
const LIMIT = 200;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.join(repoRoot, 'public', 'data', 'top-coins.json');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizeTickerRow(ticker, symbolMeta) {
  const symbol = String(ticker.symbol ?? '').toUpperCase();
  if (!symbol || symbol !== symbolMeta.symbol) return null;

  return {
    rank: 0,
    symbol,
    baseAsset: symbolMeta.baseAsset,
    quoteAsset: symbolMeta.quoteAsset,
    lastPrice: toNumber(ticker.lastPrice),
    priceChangePercent: toNumber(ticker.priceChangePercent),
    quoteVolume: Math.max(0, toNumber(ticker.quoteVolume)),
    baseVolume: Math.max(0, toNumber(ticker.volume)),
    tradeCount: Math.max(0, Math.floor(toNumber(ticker.count))),
    highPrice: toNumber(ticker.highPrice),
    lowPrice: toNumber(ticker.lowPrice)
  };
}

async function fetchJsonWithRetry(url, label, maxAttempts = 2) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      });
    } catch (error) {
      if (attempt < maxAttempts) {
        await sleep(1200 * attempt);
        continue;
      }
      throw new Error(`${label} request failed: ${error instanceof Error ? error.message : 'network-error'}`);
    }

    if (response.ok) {
      return response.json();
    }

    const shouldRetry = response.status === 418 || response.status === 429 || response.status >= 500;
    if (shouldRetry && attempt < maxAttempts) {
      await sleep(1500 * attempt);
      continue;
    }

    const body = (await response.text()).slice(0, 220);
    throw new Error(`${label} request failed with ${response.status}: ${body}`);
  }

  throw new Error(`${label} request failed after retries`);
}

async function generateSnapshot() {
  const [ticker24hr, exchangeInfo] = await Promise.all([
    fetchJsonWithRetry(BINANCE_TICKER_24H_URL, 'ticker/24hr'),
    fetchJsonWithRetry(BINANCE_EXCHANGE_INFO_URL, 'exchangeInfo')
  ]);

  if (!Array.isArray(ticker24hr)) {
    throw new Error('ticker/24hr payload is not an array');
  }

  const symbols = Array.isArray(exchangeInfo?.symbols) ? exchangeInfo.symbols : null;
  if (!symbols) {
    throw new Error('exchangeInfo payload missing symbols array');
  }

  const tradableSymbolMap = new Map();
  for (const entry of symbols) {
    const symbol = String(entry?.symbol ?? '').toUpperCase();
    const status = String(entry?.status ?? '').toUpperCase();
    const quoteAsset = String(entry?.quoteAsset ?? '').toUpperCase();
    const baseAsset = String(entry?.baseAsset ?? '').toUpperCase();
    const isSpotTradingAllowed = entry?.isSpotTradingAllowed;

    if (!symbol || !baseAsset) continue;
    if (status !== 'TRADING') continue;
    if (quoteAsset !== QUOTE_ASSET) continue;
    if (!symbol.endsWith(QUOTE_ASSET)) continue;
    if (typeof isSpotTradingAllowed === 'boolean' && !isSpotTradingAllowed) continue;

    tradableSymbolMap.set(symbol, {
      symbol,
      baseAsset,
      quoteAsset
    });
  }

  const normalized = [];
  for (const ticker of ticker24hr) {
    const symbol = String(ticker?.symbol ?? '').toUpperCase();
    const symbolMeta = tradableSymbolMap.get(symbol);
    if (!symbolMeta) continue;
    const row = normalizeTickerRow(ticker, symbolMeta);
    if (!row) continue;
    normalized.push(row);
  }

  normalized.sort((a, b) => b.quoteVolume - a.quoteVolume || a.symbol.localeCompare(b.symbol));

  const items = normalized.slice(0, LIMIT).map((item, index) => ({
    rank: index + 1,
    symbol: item.symbol,
    baseAsset: item.baseAsset,
    quoteAsset: item.quoteAsset,
    lastPrice: item.lastPrice,
    priceChangePercent: item.priceChangePercent,
    quoteVolume: item.quoteVolume,
    baseVolume: item.baseVolume,
    tradeCount: item.tradeCount,
    highPrice: item.highPrice,
    lowPrice: item.lowPrice
  }));

  return {
    asOf: Date.now(),
    source: 'binance-spot-rest',
    window: '24h',
    baseQuote: QUOTE_ASSET,
    method: 'top200-by-quoteVolume',
    items
  };
}

async function writeSnapshotFile() {
  const snapshot = await generateSnapshot();
  const output = `${JSON.stringify(snapshot, null, 2)}\n`;

  await mkdir(path.dirname(outputPath), { recursive: true });

  let previous = null;
  try {
    previous = await readFile(outputPath, 'utf8');
  } catch {
    previous = null;
  }

  if (previous === output) {
    console.log('Top coins snapshot unchanged.');
    return false;
  }

  const tempPath = `${outputPath}.tmp`;
  await writeFile(tempPath, output, 'utf8');
  await rename(tempPath, outputPath);

  console.log(`Top coins snapshot updated: ${snapshot.items.length} items.`);
  return true;
}

writeSnapshotFile().catch((error) => {
  console.error(`[top-coins-snapshot] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
