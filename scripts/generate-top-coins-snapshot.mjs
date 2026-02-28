import { createHash } from 'node:crypto';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BINANCE_DATA_PATHS = {
  ticker24h: '/api/v3/ticker/24hr',
  exchangeInfo: '/api/v3/exchangeInfo'
};
const BINANCE_BASE_CANDIDATES = [
  process.env.BINANCE_DATA_BASE,
  'https://data-api.binance.vision',
  'https://api.binance.com',
  'https://api-gcp.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com'
]
  .map((raw) => String(raw ?? '').trim())
  .filter(Boolean);

const QUOTE_ASSET = 'USDT';
const LIMIT = 150;
const INTERVAL_SEC = 60;
const LOGO_CONCURRENCY = 8;
const LEVERAGED_TOKEN_SUFFIX = /(UP|DOWN|BULL|BEAR)$/;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const dataDir = path.join(repoRoot, 'public', 'data');
const logosDir = path.join(dataDir, 'logos');
const outputPath = path.join(dataDir, 'top-coins.json');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function isSpotSymbolAllowed(symbol, baseAsset) {
  if (!symbol.endsWith(QUOTE_ASSET)) return false;
  if (!/^[A-Z0-9]+USDT$/.test(symbol)) return false;
  if (!baseAsset) return false;
  if (LEVERAGED_TOKEN_SUFFIX.test(baseAsset)) return false;
  return true;
}

function normalizeTickerRow(ticker, symbolMeta) {
  const symbol = String(ticker?.symbol ?? '').toUpperCase();
  if (!symbol || symbol !== symbolMeta.symbol) return null;

  return {
    symbol,
    base: symbolMeta.base,
    quote: symbolMeta.quote,
    lastPrice: toNumber(ticker?.lastPrice),
    priceChangePercent: toNumber(ticker?.priceChangePercent),
    quoteVolume: Math.max(0, toNumber(ticker?.quoteVolume)),
    tradeCount: Math.max(0, Math.floor(toNumber(ticker?.count))),
    highPrice: toNumber(ticker?.highPrice),
    lowPrice: toNumber(ticker?.lowPrice)
  };
}

async function fetchJsonWithRetry(url, label, maxAttempts = 2) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'top-coins-snapshot-bot/2.0'
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

async function fetchBinanceJson(apiPath, label) {
  const errors = [];
  for (const base of BINANCE_BASE_CANDIDATES) {
    const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
    const url = `${normalizedBase}${apiPath}`;
    try {
      return await fetchJsonWithRetry(url, `${label} @ ${normalizedBase}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      continue;
    }
  }
  throw new Error(`${label} failed on all Binance endpoints: ${errors.join(' | ')}`);
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fetchLogoBinary(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'image/png,image/webp,image/*,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    return null;
  }

  const contentType = String(response.headers.get('content-type') ?? '').toLowerCase();
  if (!contentType.startsWith('image/')) {
    return null;
  }

  const data = await response.arrayBuffer();
  if (!data || data.byteLength < 128) {
    return null;
  }

  return Buffer.from(data);
}

function logoCandidates(baseAsset, symbol) {
  const baseUpper = String(baseAsset || '').toUpperCase();
  const baseLower = baseUpper.toLowerCase();
  const symbolUpper = String(symbol || '').toUpperCase();

  return [
    `https://bin.bnbstatic.com/static/images/common/cryptoicons/${baseUpper}.png`,
    `https://bin.bnbstatic.com/static/images/common/cryptoicons/${symbolUpper}.png`,
    `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${baseLower}.png`
  ];
}

async function resolveLogoForCoin(coin) {
  const symbol = String(coin.symbol ?? '').toUpperCase();
  if (!symbol) return { logoPath: null, downloaded: false };

  const fileName = `${symbol}.png`;
  const filePath = path.join(logosDir, fileName);
  const publicPath = `/data/logos/${fileName}`;

  if (await fileExists(filePath)) {
    return { logoPath: publicPath, downloaded: false };
  }

  const candidates = logoCandidates(coin.base, coin.symbol);
  for (let i = 0; i < candidates.length; i++) {
    const binary = await fetchLogoBinary(candidates[i]);
    if (!binary) continue;
    await writeFile(filePath, binary);
    return { logoPath: publicPath, downloaded: true };
  }

  return { logoPath: null, downloaded: false };
}

async function runWithConcurrency(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;

  async function runOne() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      out[index] = await worker(items[index], index);
    }
  }

  const workers = [];
  const count = Math.max(1, Math.min(limit, items.length));
  for (let i = 0; i < count; i++) {
    workers.push(runOne());
  }
  await Promise.all(workers);
  return out;
}

function buildSnapshotHash({ source, intervalSec, coins }) {
  const normalizedForHash = {
    source,
    intervalSec,
    coins: coins.map((coin) => ({
      symbol: coin.symbol,
      base: coin.base,
      quote: coin.quote,
      lastPrice: coin.lastPrice,
      priceChangePercent: coin.priceChangePercent,
      quoteVolume: coin.quoteVolume,
      rankByQuoteVolume: coin.rankByQuoteVolume,
      tradeCount: coin.tradeCount,
      highPrice: coin.highPrice,
      lowPrice: coin.lowPrice
    }))
  };
  const payload = JSON.stringify(normalizedForHash);
  return createHash('sha256').update(payload).digest('hex').slice(0, 8);
}

async function generateSnapshot() {
  const [ticker24hr, exchangeInfo] = await Promise.all([
    fetchBinanceJson(BINANCE_DATA_PATHS.ticker24h, 'ticker/24hr'),
    fetchBinanceJson(BINANCE_DATA_PATHS.exchangeInfo, 'exchangeInfo')
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
    const permissions = Array.isArray(entry?.permissions)
      ? entry.permissions.map((p) => String(p ?? '').toUpperCase())
      : null;

    if (!symbol || !baseAsset) continue;
    if (status !== 'TRADING') continue;
    if (quoteAsset !== QUOTE_ASSET) continue;
    if (!isSpotSymbolAllowed(symbol, baseAsset)) continue;
    if (typeof isSpotTradingAllowed === 'boolean' && !isSpotTradingAllowed) continue;
    if (permissions && permissions.length > 0 && !permissions.includes('SPOT')) continue;

    tradableSymbolMap.set(symbol, {
      symbol,
      base: baseAsset,
      quote: quoteAsset
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

  const ranked = normalized.slice(0, LIMIT).map((coin, index) => ({
    symbol: coin.symbol,
    base: coin.base,
    quote: coin.quote,
    lastPrice: coin.lastPrice,
    priceChangePercent: coin.priceChangePercent,
    quoteVolume: coin.quoteVolume,
    rankByQuoteVolume: index + 1,
    tradeCount: coin.tradeCount,
    highPrice: coin.highPrice,
    lowPrice: coin.lowPrice
  }));

  if (ranked.length < LIMIT) {
    throw new Error(`not-enough-symbols-after-filtering: expected ${LIMIT}, got ${ranked.length}`);
  }

  await mkdir(logosDir, { recursive: true });

  const logoResults = await runWithConcurrency(ranked, LOGO_CONCURRENCY, async (coin) => resolveLogoForCoin(coin));

  let downloadedNow = 0;
  let logosAvailable = 0;
  const coins = ranked.map((coin, index) => {
    const logo = logoResults[index];
    if (logo?.downloaded) downloadedNow += 1;
    if (logo?.logoPath) logosAvailable += 1;
    return {
      symbol: coin.symbol,
      base: coin.base,
      quote: coin.quote,
      lastPrice: coin.lastPrice,
      priceChangePercent: coin.priceChangePercent,
      quoteVolume: coin.quoteVolume,
      rankByQuoteVolume: coin.rankByQuoteVolume,
      tradeCount: coin.tradeCount,
      highPrice: coin.highPrice,
      lowPrice: coin.lowPrice,
      logoPath: logo?.logoPath ?? null
    };
  });

  const hash = buildSnapshotHash({
    source: 'binance',
    intervalSec: INTERVAL_SEC,
    coins
  });

  return {
    asOf: new Date().toISOString(),
    intervalSec: INTERVAL_SEC,
    source: 'binance',
    hash,
    logosAttempted: coins.length,
    logosDownloaded: logosAvailable,
    logosMissing: Math.max(0, coins.length - logosAvailable),
    coins,
    _debug: {
      downloadedNow
    }
  };
}

async function writeSnapshotFile() {
  const snapshotRaw = await generateSnapshot();
  const { _debug, ...snapshot } = snapshotRaw;
  await mkdir(path.dirname(outputPath), { recursive: true });

  const output = `${JSON.stringify(snapshot, null, 2)}\n`;
  const tempPath = `${outputPath}.tmp`;
  await writeFile(tempPath, output, 'utf8');
  await rename(tempPath, outputPath);

  console.log(
    `Top coins snapshot updated: ${snapshot.coins.length} coins, hash=${snapshot.hash}, logos ${snapshot.logosDownloaded}/${snapshot.logosAttempted} (new ${_debug.downloadedNow}).`
  );
}

writeSnapshotFile().catch((error) => {
  console.error(`[top-coins-snapshot] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
