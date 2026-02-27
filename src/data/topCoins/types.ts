export type TopCoinItem = {
  rank: number;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  lastPrice: number;
  priceChangePercent: number;
  quoteVolume: number;
  baseVolume: number;
  tradeCount: number;
  highPrice: number;
  lowPrice: number;
};

export type TopCoinsStaticSnapshotFile = {
  asOf: number;
  source: string;
  window: string;
  baseQuote: string;
  method: string;
  items: TopCoinItem[];
};

export type TopCoinsSnapshot = {
  kind: 'top-coins-snapshot';
  sequence: number;
  emittedAt: number;
  asOf: number;
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
    fetchedAt: number;
    pollMs: number;
    endpoint: string;
    lastError: string | null;
    lastFetchOk: boolean;
  };
};
