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
  logoPath: string | null;
};

export type TopCoinsStaticSnapshotFile = {
  asOf: number;
  source: string;
  window: string;
  baseQuote: string;
  method: string;
  logosAttempted?: number;
  logosDownloaded?: number;
  logosMissing?: number;
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
    lastFetchAt: number;
    lastAsOf: number;
    lastHash: string;
    refreshAgeSec: number;
    pollMs: number;
    endpoint: string;
    lastError: string | null;
    lastFetchOk: boolean;
    logosMissing: number;
    logosAttempted: number;
    logosDownloaded: number;
  };
};
