export type TopCoinItem = {
  symbol: string;
  base: string;
  quote: string;
  lastPrice: number;
  priceChangePercent: number;
  quoteVolume: number;
  rankByQuoteVolume: number;
  tradeCount: number;
  highPrice: number;
  lowPrice: number;
  logoPath: string | null;
};

export type TopCoinsStaticSnapshotFile = {
  asOf: string;
  intervalSec: number;
  source: string;
  hash: string;
  logosAttempted?: number;
  logosDownloaded?: number;
  logosMissing?: number;
  coins: TopCoinItem[];
};

export type TopCoinsSnapshot = {
  kind: 'top-coins-snapshot';
  sequence: number;
  emittedAt: number;
  asOf: number;
  asOfIso: string;
  hash: string;
  hashChanged: boolean;
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
    breadth: number;
  };
  debug: {
    symbols: number;
    fetchedAt: number;
    lastFetchAt: number;
    lastSuccessAt: number;
    lastAsOf: number;
    lastHash: string;
    hashChanged: boolean;
    changedCount: number;
    refreshAgeSec: number;
    pollMs: number;
    nextUpdateAt: number;
    endpoint: string;
    lastError: string | null;
    lastFetchOk: boolean;
    logosMissing: number;
    logosAttempted: number;
    logosDownloaded: number;
  };
};
