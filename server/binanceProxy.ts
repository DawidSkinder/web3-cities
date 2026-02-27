const BINANCE_API_BASE = 'https://api.binance.com';
const TICKER_24H_PATH = '/api/v3/ticker/24hr';
const EXCHANGE_INFO_PATH = '/api/v3/exchangeInfo';

const DEFAULT_LIMIT = 200;
const DEFAULT_QUOTE = 'USDT';
const DEFAULT_TTL_MS = Number(process.env.TOP_COINS_CACHE_TTL_MS ?? 60_000);
const DEFAULT_MAX_STALE_MS = Number(process.env.TOP_COINS_CACHE_MAX_STALE_MS ?? 10 * 60_000);
const EXCHANGE_INFO_TTL_MS = Number(process.env.TOP_COINS_EXCHANGE_INFO_TTL_MS ?? 6 * 60 * 60_000);
const REQUEST_TIMEOUT_MS = Number(process.env.TOP_COINS_REQUEST_TIMEOUT_MS ?? 9_000);

export type BinanceTopCoinItem = {
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

export type BinanceTopCoinsApiResponse = {
  asOf: string;
  cache: {
    hit: boolean;
    ageMs: number;
    ttlMs: number;
    source: 'binance' | 'stale';
  };
  universe: {
    quote: string;
    limit: number;
    excluded: string[];
  };
  items: BinanceTopCoinItem[];
};

type ExchangeInfoSymbol = {
  symbol: string;
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

type CachedPayload = {
  asOf: string;
  universe: {
    quote: string;
    limit: number;
    excluded: string[];
  };
  items: BinanceTopCoinItem[];
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
  if (now - lastErrorLogAt < 3_000) {
    return;
  }
  lastErrorLogAt = now;
  console.error(`[top-coins-proxy] ${message}`, error);
}

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(id)
  };
}

async function fetchJsonWithRetry<T>(url: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const timeout = createTimeoutSignal(REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        signal: timeout.signal
      });

      if ((response.status === 429 || response.status === 418) && attempt === 0) {
        const backoffMs = response.status === 418 ? 1800 : 900;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
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

async function getExchangeInfoMap(nowMs: number) {
  const age = nowMs - exchangeInfoCache.fetchedAt;
  if (exchangeInfoCache.symbols && age <= EXCHANGE_INFO_TTL_MS) {
    return exchangeInfoCache.symbols;
  }

  if (exchangeInfoCache.inFlight) {
    return exchangeInfoCache.inFlight;
  }

  exchangeInfoCache.inFlight = (async () => {
    const payload = await fetchJsonWithRetry<ExchangeInfoPayload>(`${BINANCE_API_BASE}${EXCHANGE_INFO_PATH}`);
    const next = new Map<string, SymbolMeta>();

    for (const row of payload.symbols ?? []) {
      if (!row?.symbol || !row.baseAsset || !row.quoteAsset) continue;
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

async function fetchTopCoinsFromBinance(limit: number, quote: string) {
  const [tickers, exchangeInfo] = await Promise.all([
    fetchJsonWithRetry<Ticker24h[]>(`${BINANCE_API_BASE}${TICKER_24H_PATH}`),
    getExchangeInfoMap(Date.now())
  ]);

  const items: BinanceTopCoinItem[] = [];

  for (const ticker of tickers) {
    const symbol = ticker?.symbol;
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

  const trimmed = items.slice(0, limit);

  return {
    asOf: new Date().toISOString(),
    universe: {
      quote,
      limit,
      excluded: []
    },
    items: trimmed
  } satisfies CachedPayload;
}

async function getCachedTopCoins(limit: number, quote: string) {
  const key = cacheKey(limit, quote);
  const now = Date.now();
  const ttlMs = DEFAULT_TTL_MS;
  const maxStaleMs = DEFAULT_MAX_STALE_MS;

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
        source: 'binance' as const
      }
    };
  }

  if (!state.inFlight) {
    // Request coalescing: once stale, all concurrent callers await this same promise.
    state.inFlight = fetchTopCoinsFromBinance(limit, quote)
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
        hit: state.payload != null && ageMs <= ttlMs,
        ageMs: 0,
        ttlMs,
        source: 'binance' as const
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
          source: 'stale' as const
        }
      };
    }

    throw error;
  }
}

export async function getTopCoinsApiResponse(url: string): Promise<BinanceTopCoinsApiResponse> {
  const parsed = new URL(url, 'http://localhost');
  const limit = normalizeLimit(parsed.searchParams.get('limit'));
  const quote = normalizeQuote(parsed.searchParams.get('quote'));
  const { payload, cache } = await getCachedTopCoins(limit, quote);

  return {
    asOf: payload.asOf,
    cache,
    universe: payload.universe,
    items: payload.items
  };
}

export async function handleTopCoinsApiRequest(url: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=10, s-maxage=60, stale-while-revalidate=300'
  };

  try {
    const response = await getTopCoinsApiResponse(url);
    return {
      status: 200,
      headers,
      body: JSON.stringify(response)
    };
  } catch (error) {
    logProxyError('failed to fetch Binance top coins', error);
    return {
      status: 502,
      headers,
      body: JSON.stringify({
        error: 'upstream-unavailable',
        message: 'Top coins snapshot is temporarily unavailable.'
      })
    };
  }
}
