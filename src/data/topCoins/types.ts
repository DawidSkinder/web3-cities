export type TopCoinItem = {
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

export type TopCoinsApiResponse = {
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
  items: TopCoinItem[];
};

export type TopCoinsSnapshot = {
  kind: 'top-coins-snapshot';
  sequence: number;
  emittedAt: number;
  asOf: string;
  ttlMs: number;
  items: TopCoinItem[];
  stats: {
    topGainer: { symbol: string; pct: number };
    topLoser: { symbol: string; pct: number };
    topVolume: { symbol: string; quoteVolume: number };
    sessionMaxQuoteVolume: number;
    sessionMaxAbsPct: number;
    marketBreadth: {
      positive: number;
      negative: number;
    };
  };
  debug: {
    symbols: number;
    cacheHit: boolean;
    cacheAgeMs: number;
    cacheSource: 'binance' | 'stale';
    fetchedAt: number;
    pollMs: number;
    lastError: string | null;
    quote: string;
  };
};
