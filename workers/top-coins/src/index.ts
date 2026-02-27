const BINANCE_API_BASE = 'https://api.binance.com';
const TICKER_24H_PATH = '/api/v3/ticker/24hr';
const EXCHANGE_INFO_PATH = '/api/v3/exchangeInfo';

const DEFAULT_LIMIT = 200;
const DEFAULT_QUOTE = 'USDT';
const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_STALE_MS = 10 * 60_000;
const DEFAULT_EXCHANGE_INFO_TTL_MS = 6 * 60 * 60_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 9_000;

type CacheSource = 'binance' | 'stale';

type TopCoinItem = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  lastPrice: number;
  priceChangePercent: number;
  quoteVolume: number;
  volume: number;
  highPrice: number;
  lowPrice: number;
  openPrice: number;
  closeTime: number;
  tradeCount: number;
};

type CachedPayload = {
  asOf: string;
  universe: {
    quote: string;
    limit: number;
    excluded: string[];
  };
  items: TopCoinItem[];
};

type ApiResponse = {
  asOf: string;
  cache: {
    hit: boolean;
    ageMs: number;
    ttlMs: number;
    source: CacheSource;
  };
  universe: {
    quote: string;
    limit: number;
    excluded: string[];
  };
  items: TopCoinItem[];
};

type ExchangeInfoSymbol = {
  symbol?: string;
  status?: string;
  baseAsset?: string;
  quoteAsset?: string;
  isSpotTradingAllowed?: boolean;
  permissions?: string[];
};

type ExchangeInfoPayload = {
  symbols?: ExchangeInfoSymbol[];
};

type Ticker24h = {
  symbol?: string;
  lastPrice?: string;
  priceChangePercent?: string;
  quoteVolume?: string;
  volume?: string;
  highPrice?: string;
  lowPrice?: string;
  openPrice?: string;
  closeTime?: number;
  count?: number;
};

type SymbolMeta = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
};

type CacheState = {
  fetchedAt: number;
  payload: CachedPayload | null;
  inFlight: Promise<CachedPayload> | null;
};

type ExchangeInfoCacheState = {
  fetchedAt: number;
  symbols: Map<string, SymbolMeta> | null;
  inFlight: Promise<Map<string, SymbolMeta>> | null;
};

export interface Env {
  TOP_COINS_CACHE_TTL_MS?: string;
  TOP_COINS_CACHE_MAX_STALE_MS?: string;
  TOP_COINS_EXCHANGE_INFO_TTL_MS?: string;
  TOP_COINS_REQUEST_TIMEOUT_MS?: string;
  ALLOWED_ORIGINS?: string;
}

const responseCache = new Map<string, CacheState>();
const exchangeInfoCache: ExchangeInfoCacheState = {
  fetchedAt: 0,
  symbols: null,
  inFlight: null
};

let lastErrorLogAt = 0;

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseEnvInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeLimit(raw: string | null) {
  const parsed = Number(raw ?? DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(500, Math.floor(parsed)));
}

function normalizeQuote(raw: string | null) {
  const next = (raw ?? DEFAULT_QUOTE).trim().toUpperCase();
  if (!next || !/^[A-Z0-9]{2,16}$/.test(next)) {
    return DEFAULT_QUOTE;
  }
  return next;
}

function cacheKey(limit: number, quote: string) {
  return `${quote}:${limit}`;
}

function logProxyError(message: string, error: unknown) {
  const now = Date.now();
  if (now - lastErrorLogAt < 3_000) return;
  lastErrorLogAt = now;
  console.error(`[top-coins-worker] ${message}`, error);
}

function resolveAllowedOrigin(request: Request, env: Env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;

  const allow = (env.ALLOWED_ORIGINS ?? '*')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (allow.includes('*')) {
    return '*';
  }

  if (allow.includes(origin)) {
    return origin;
  }

  return null;
}

function applyCorsHeaders(headers: Headers, request: Request, env: Env) {
  const allowedOrigin = resolveAllowedOrigin(request, env);
  if (!allowedOrigin) {
    return false;
  }

  headers.set('Access-Control-Allow-Origin', allowedOrigin);
  headers.set('Access-Control-Allow-Methods', 'GET,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type,Accept');
  headers.set('Access-Control-Max-Age', '86400');
  if (allowedOrigin !== '*') {
    headers.set('Vary', 'Origin');
  }
  return true;
}

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(id)
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry<T>(url: string, env: Env) {
  const timeoutMs = parseEnvInt(env.TOP_COINS_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS, 2000, 60_000);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const timeout = createTimeoutSignal(timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        signal: timeout.signal
      });

      if ((response.status === 429 || response.status === 418) && attempt === 0) {
        await sleep(response.status === 418 ? 1800 : 900);
        continue;
      }

      if (!response.ok) {
        throw new Error(`upstream ${response.status} for ${url}`);
      }

      return (await response.json()) as T;
    } finally {
      timeout.clear();
    }
  }

  throw new Error(`rate limited by Binance for ${url}`);
}

async function getExchangeInfoMap(nowMs: number, env: Env) {
  const ttlMs = parseEnvInt(env.TOP_COINS_EXCHANGE_INFO_TTL_MS, DEFAULT_EXCHANGE_INFO_TTL_MS, 30_000, 24 * 60 * 60_000);
  const age = nowMs - exchangeInfoCache.fetchedAt;

  if (exchangeInfoCache.symbols && age <= ttlMs) {
    return exchangeInfoCache.symbols;
  }

  if (exchangeInfoCache.inFlight) {
    return exchangeInfoCache.inFlight;
  }

  exchangeInfoCache.inFlight = (async () => {
    const payload = await fetchJsonWithRetry<ExchangeInfoPayload>(`${BINANCE_API_BASE}${EXCHANGE_INFO_PATH}`, env);
    const next = new Map<string, SymbolMeta>();

    for (const row of payload.symbols ?? []) {
      if (!row.symbol || !row.baseAsset || !row.quoteAsset) continue;
      if (row.status !== 'TRADING') continue;
      if (row.isSpotTradingAllowed === false) continue;
      if (Array.isArray(row.permissions) && row.permissions.length > 0 && !row.permissions.includes('SPOT')) continue;

      next.set(row.symbol, {
        symbol: row.symbol,
        baseAsset: row.baseAsset,
        quoteAsset: row.quoteAsset
      });
    }

    exchangeInfoCache.symbols = next;
    exchangeInfoCache.fetchedAt = Date.now();
    return next;
  })();

  try {
    return await exchangeInfoCache.inFlight;
  } finally {
    exchangeInfoCache.inFlight = null;
  }
}

async function fetchTopCoinsFromBinance(limit: number, quote: string, env: Env) {
  const [tickers, exchangeInfo] = await Promise.all([
    fetchJsonWithRetry<Ticker24h[]>(`${BINANCE_API_BASE}${TICKER_24H_PATH}`, env),
    getExchangeInfoMap(Date.now(), env)
  ]);

  const items: TopCoinItem[] = [];

  for (const ticker of tickers) {
    const symbol = ticker.symbol;
    if (!symbol) continue;

    const meta = exchangeInfo.get(symbol);
    if (!meta) continue;
    if (meta.quoteAsset !== quote) continue;

    items.push({
      symbol,
      baseAsset: meta.baseAsset,
      quoteAsset: meta.quoteAsset,
      lastPrice: safeNumber(ticker.lastPrice, 0),
      priceChangePercent: safeNumber(ticker.priceChangePercent, 0),
      quoteVolume: safeNumber(ticker.quoteVolume, 0),
      volume: safeNumber(ticker.volume, 0),
      highPrice: safeNumber(ticker.highPrice, 0),
      lowPrice: safeNumber(ticker.lowPrice, 0),
      openPrice: safeNumber(ticker.openPrice, 0),
      closeTime: safeNumber(ticker.closeTime, 0),
      tradeCount: safeNumber(ticker.count, 0)
    });
  }

  items.sort((a, b) => {
    if (b.quoteVolume !== a.quoteVolume) {
      return b.quoteVolume - a.quoteVolume;
    }
    return a.symbol.localeCompare(b.symbol);
  });

  return {
    asOf: new Date().toISOString(),
    universe: {
      quote,
      limit,
      excluded: []
    },
    items: items.slice(0, limit)
  } satisfies CachedPayload;
}

async function getCachedTopCoins(limit: number, quote: string, env: Env) {
  const key = cacheKey(limit, quote);
  const now = Date.now();
  const ttlMs = parseEnvInt(env.TOP_COINS_CACHE_TTL_MS, DEFAULT_TTL_MS, 10_000, 10 * 60_000);
  const maxStaleMs = parseEnvInt(env.TOP_COINS_CACHE_MAX_STALE_MS, DEFAULT_MAX_STALE_MS, ttlMs, 60 * 60_000);

  let state = responseCache.get(key);
  if (!state) {
    state = {
      fetchedAt: 0,
      payload: null,
      inFlight: null
    };
    responseCache.set(key, state);
  }

  const ageMs = now - state.fetchedAt;
  if (state.payload && ageMs <= ttlMs) {
    return {
      payload: state.payload,
      cache: {
        hit: true,
        ageMs,
        ttlMs,
        source: 'binance' as CacheSource
      }
    };
  }

  if (!state.inFlight) {
    // Coalescing: stale cache refresh happens once, all concurrent requests await same promise.
    state.inFlight = fetchTopCoinsFromBinance(limit, quote, env)
      .then((payload) => {
        state!.payload = payload;
        state!.fetchedAt = Date.now();
        return payload;
      })
      .finally(() => {
        state!.inFlight = null;
      });
  }

  try {
    const payload = await state.inFlight;
    return {
      payload,
      cache: {
        hit: false,
        ageMs: 0,
        ttlMs,
        source: 'binance' as CacheSource
      }
    };
  } catch (error) {
    const staleAgeMs = now - state.fetchedAt;
    if (state.payload && staleAgeMs <= maxStaleMs) {
      return {
        payload: state.payload,
        cache: {
          hit: true,
          ageMs: staleAgeMs,
          ttlMs,
          source: 'stale' as CacheSource
        }
      };
    }

    throw error;
  }
}

async function handleTopCoins(request: Request, env: Env) {
  const url = new URL(request.url);
  const limit = normalizeLimit(url.searchParams.get('limit'));
  const quote = normalizeQuote(url.searchParams.get('quote'));

  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=10, s-maxage=60, stale-while-revalidate=300'
  });

  const corsOk = applyCorsHeaders(headers, request, env);
  if (request.headers.get('Origin') && !corsOk) {
    return new Response(JSON.stringify({ error: 'origin-not-allowed' }), {
      status: 403,
      headers
    });
  }

  try {
    const { payload, cache } = await getCachedTopCoins(limit, quote, env);
    const body: ApiResponse = {
      asOf: payload.asOf,
      cache,
      universe: payload.universe,
      items: payload.items
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers
    });
  } catch (error) {
    logProxyError('failed to fetch Binance top coins', error);
    return new Response(
      JSON.stringify({
        error: 'upstream-unavailable',
        message: 'Top coins snapshot is temporarily unavailable.'
      }),
      {
        status: 502,
        headers
      }
    );
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      const headers = new Headers();
      const corsOk = applyCorsHeaders(headers, request, env);
      if (!corsOk && request.headers.get('Origin')) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'method-not-allowed' }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        }
      });
    }

    if (url.pathname === '/api/top-coins' || url.pathname === '/top-coins' || url.pathname === '/') {
      return handleTopCoins(request, env);
    }

    return new Response(JSON.stringify({ error: 'not-found' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    });
  }
};
