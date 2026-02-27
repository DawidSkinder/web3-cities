import type { TopCoinItem, TopCoinsSnapshot, TopCoinsStaticSnapshotFile } from './types';

type TopCoinsDataEngineConfig = {
  endpoint?: string;
  limit?: number;
  pollMs?: number;
};

type TopCoinsSnapshotListener = (snapshot: TopCoinsSnapshot) => void;

type TopCoinsSnapshotSeed = Omit<TopCoinsSnapshot, 'sequence' | 'emittedAt'>;

function resolveDefaultEndpoint() {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}data/top-coins.json`;
}

function parsePollMs(raw: unknown, minMs: number, fallbackMs: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallbackMs;
  return Math.max(minMs, Math.floor(parsed));
}

function resolveTopPollOverrideMs() {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('topPoll');
  if (!raw) return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds)) return null;
  return Math.max(5_000, Math.floor(seconds * 1000));
}

function parseLimit(raw: unknown) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 200;
  return Math.max(1, Math.min(200, Math.floor(parsed)));
}

function topBy<T>(items: T[], getValue: (item: T) => number) {
  let best: T | null = null;
  let bestValue = -Infinity;
  for (const item of items) {
    const value = getValue(item);
    if (value > bestValue) {
      best = item;
      bestValue = value;
    }
  }
  return best;
}

function asNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseLogoPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized;
}

function parseTopCoinItem(raw: unknown, fallbackRank: number): TopCoinItem | null {
  const row = asRecord(raw);
  if (!row) return null;

  const symbol = asString(row.symbol).trim().toUpperCase();
  if (!symbol) return null;

  return {
    rank: Math.max(1, Math.floor(asNumber(row.rank, fallbackRank))),
    symbol,
    baseAsset: asString(row.baseAsset).trim().toUpperCase() || symbol.replace(/USDT$/, ''),
    quoteAsset: asString(row.quoteAsset).trim().toUpperCase() || 'USDT',
    lastPrice: asNumber(row.lastPrice, 0),
    priceChangePercent: asNumber(row.priceChangePercent, 0),
    quoteVolume: Math.max(0, asNumber(row.quoteVolume, 0)),
    baseVolume: Math.max(0, asNumber(row.baseVolume, 0)),
    tradeCount: Math.max(0, Math.floor(asNumber(row.tradeCount, 0))),
    highPrice: asNumber(row.highPrice, 0),
    lowPrice: asNumber(row.lowPrice, 0),
    logoPath: parseLogoPath(row.logoPath)
  };
}

function parsePayload(raw: unknown, limit: number): TopCoinsStaticSnapshotFile {
  const payload = asRecord(raw);
  if (!payload) {
    throw new Error('snapshot-invalid-payload');
  }

  const itemsRaw = Array.isArray(payload.items) ? payload.items : [];
  const parsedItems: TopCoinItem[] = [];
  for (let i = 0; i < itemsRaw.length; i++) {
    const item = parseTopCoinItem(itemsRaw[i], i + 1);
    if (item) parsedItems.push(item);
  }

  parsedItems.sort((a, b) => a.rank - b.rank || a.symbol.localeCompare(b.symbol));

  const asOf = Math.floor(asNumber(payload.asOf, NaN));
  if (!Number.isFinite(asOf) || asOf <= 0) {
    throw new Error('snapshot-invalid-asof');
  }

  return {
    asOf,
    source: asString(payload.source, 'binance-spot-rest'),
    window: asString(payload.window, '24h'),
    baseQuote: asString(payload.baseQuote, 'USDT').toUpperCase(),
    method: asString(payload.method, 'top200-by-quoteVolume'),
    logosAttempted: Math.max(0, Math.floor(asNumber(payload.logosAttempted, parsedItems.length))),
    logosDownloaded: Math.max(0, Math.floor(asNumber(payload.logosDownloaded, 0))),
    logosMissing: Math.max(0, Math.floor(asNumber(payload.logosMissing, 0))),
    items: parsedItems.slice(0, limit)
  };
}

function normalizeError(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'snapshot-unknown-error';
}

function hashStringFnv1a(input: string) {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `h${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export class TopCoinsDataEngine {
  private readonly endpoint: string;
  private readonly limit: number;
  private readonly pollMs: number;

  private readonly listeners = new Set<TopCoinsSnapshotListener>();
  private started = false;
  private timer: number | null = null;
  private activeRequest: Promise<void> | null = null;
  private activeAbort: AbortController | null = null;

  private sequence = 0;
  private sessionMaxQuoteVolume = 0;
  private sessionMaxAbsPct = 0;
  private lastSnapshot: TopCoinsSnapshot | null = null;

  private lastFetchAt = 0;
  private lastAsOf = 0;
  private lastHash = 'none';

  constructor(config: TopCoinsDataEngineConfig = {}) {
    this.endpoint = config.endpoint?.trim() || resolveDefaultEndpoint();
    this.limit = parseLimit(config.limit ?? import.meta.env.VITE_TOP_COINS_LIMIT);

    const topPollOverrideMs = resolveTopPollOverrideMs();
    const configuredPoll = config.pollMs ?? import.meta.env.VITE_TOP_COINS_POLL_MS;
    this.pollMs =
      topPollOverrideMs ??
      parsePollMs(configuredPoll, 30_000, 30_000);
  }

  start() {
    if (this.started) return;

    this.started = true;
    this.sequence = 0;
    this.sessionMaxQuoteVolume = 0;
    this.sessionMaxAbsPct = 0;
    this.lastSnapshot = null;
    this.lastFetchAt = 0;
    this.lastAsOf = 0;
    this.lastHash = 'none';

    void this.pollNow();
    this.timer = window.setInterval(() => {
      void this.pollNow();
    }, this.pollMs);
  }

  stop() {
    this.started = false;
    if (this.timer != null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    if (this.activeAbort) {
      this.activeAbort.abort();
      this.activeAbort = null;
    }
    this.activeRequest = null;
  }

  subscribe(listener: TopCoinsSnapshotListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(seed: TopCoinsSnapshotSeed) {
    this.sequence += 1;
    const snapshot: TopCoinsSnapshot = {
      ...seed,
      sequence: this.sequence,
      emittedAt: Date.now()
    };
    this.lastSnapshot = snapshot;
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private shouldEmit(next: TopCoinsSnapshotSeed) {
    if (!this.lastSnapshot) return true;
    if (this.lastSnapshot.asOf !== next.asOf) return true;
    if (this.lastSnapshot.debug.lastHash !== next.debug.lastHash) return true;
    if (this.lastSnapshot.debug.lastError !== next.debug.lastError) return true;
    if (this.lastSnapshot.debug.lastFetchOk !== next.debug.lastFetchOk) return true;
    if (this.lastSnapshot.debug.logosMissing !== next.debug.logosMissing) return true;
    return false;
  }

  private buildEmptySnapshot(lastError: string): TopCoinsSnapshotSeed {
    const now = Date.now();
    return {
      kind: 'top-coins-snapshot',
      asOf: 0,
      ttlMs: this.pollMs,
      items: [],
      stats: {
        topGainer: { symbol: 'N/A', pct: 0 },
        topLoser: { symbol: 'N/A', pct: 0 },
        topVolume: { symbol: 'N/A', quoteVolume: 0 },
        sessionMaxQuoteVolume: this.sessionMaxQuoteVolume,
        sessionMaxAbsPct: this.sessionMaxAbsPct,
        marketBreadth: {
          positive: 0,
          negative: 0
        }
      },
      debug: {
        symbols: 0,
        fetchedAt: now,
        lastFetchAt: now,
        lastAsOf: 0,
        lastHash: this.lastHash,
        refreshAgeSec: 0,
        pollMs: this.pollMs,
        endpoint: this.endpoint,
        lastError,
        lastFetchOk: false,
        logosMissing: 0,
        logosAttempted: 0,
        logosDownloaded: 0
      }
    };
  }

  private async pollNow() {
    if (!this.started || this.activeRequest) {
      return this.activeRequest;
    }

    this.activeAbort = new AbortController();
    this.activeRequest = this.fetchAndEmit(this.activeAbort.signal)
      .catch((error) => {
        if (!this.started) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;

        const message = normalizeError(error);
        const now = Date.now();

        if (this.lastSnapshot) {
          const lastSuccessfulFetchAt = this.lastSnapshot.debug.lastFetchAt || this.lastFetchAt || now;
          const next: TopCoinsSnapshotSeed = {
            ...this.lastSnapshot,
            debug: {
              ...this.lastSnapshot.debug,
              fetchedAt: now,
              lastFetchAt: lastSuccessfulFetchAt,
              refreshAgeSec: Math.max(0, (now - Math.max(lastSuccessfulFetchAt, 1)) / 1000),
              lastError: message,
              lastFetchOk: false
            }
          };
          if (this.shouldEmit(next)) {
            this.emit(next);
          }
        } else {
          this.emit(this.buildEmptySnapshot(message));
        }
      })
      .finally(() => {
        this.activeAbort = null;
        this.activeRequest = null;
      });

    return this.activeRequest;
  }

  private async fetchAndEmit(signal: AbortSignal) {
    const now = Date.now();
    const url = new URL(this.endpoint, window.location.origin);
    url.searchParams.set('v', String(now));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      cache: 'no-store',
      signal
    });

    if (!response.ok) {
      throw new Error(`snapshot-http-${response.status}`);
    }

    const body = await response.text();
    const bodyHash = hashStringFnv1a(body);

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new Error('snapshot-invalid-json');
    }

    const payload = parsePayload(json, this.limit);
    const items = payload.items;

    const topGainer = topBy(items, (item) => item.priceChangePercent) ?? items[0] ?? null;
    const topLoser = topBy(items, (item) => -item.priceChangePercent) ?? items[0] ?? null;
    const topVolume = topBy(items, (item) => item.quoteVolume) ?? items[0] ?? null;

    const positive = items.reduce((acc, item) => acc + (item.priceChangePercent >= 0 ? 1 : 0), 0);
    const negative = Math.max(0, items.length - positive);

    this.sessionMaxQuoteVolume = Math.max(
      this.sessionMaxQuoteVolume,
      ...items.map((item) => item.quoteVolume)
    );
    this.sessionMaxAbsPct = Math.max(this.sessionMaxAbsPct, ...items.map((item) => Math.abs(item.priceChangePercent)));

    this.lastFetchAt = now;
    this.lastAsOf = payload.asOf;
    this.lastHash = bodyHash;

    const next: TopCoinsSnapshotSeed = {
      kind: 'top-coins-snapshot',
      asOf: payload.asOf,
      ttlMs: this.pollMs,
      items,
      stats: {
        topGainer: {
          symbol: topGainer?.symbol ?? 'N/A',
          pct: topGainer?.priceChangePercent ?? 0
        },
        topLoser: {
          symbol: topLoser?.symbol ?? 'N/A',
          pct: topLoser?.priceChangePercent ?? 0
        },
        topVolume: {
          symbol: topVolume?.symbol ?? 'N/A',
          quoteVolume: topVolume?.quoteVolume ?? 0
        },
        sessionMaxQuoteVolume: this.sessionMaxQuoteVolume,
        sessionMaxAbsPct: this.sessionMaxAbsPct,
        marketBreadth: {
          positive,
          negative
        }
      },
      debug: {
        symbols: items.length,
        fetchedAt: now,
        lastFetchAt: now,
        lastAsOf: payload.asOf,
        lastHash: bodyHash,
        refreshAgeSec: Math.max(0, (now - payload.asOf) / 1000),
        pollMs: this.pollMs,
        endpoint: this.endpoint,
        lastError: null,
        lastFetchOk: true,
        logosMissing: payload.logosMissing ?? 0,
        logosAttempted: payload.logosAttempted ?? items.length,
        logosDownloaded: payload.logosDownloaded ?? 0
      }
    };

    const changed =
      !this.lastSnapshot ||
      this.lastSnapshot.asOf !== payload.asOf ||
      this.lastSnapshot.debug.lastHash !== bodyHash ||
      !this.lastSnapshot.debug.lastFetchOk ||
      this.lastSnapshot.debug.lastError != null;
    if (!changed) {
      return;
    }

    if (this.shouldEmit(next)) {
      this.emit(next);
    }
  }
}

export function resolveTopCoinsItems(snapshot: TopCoinsSnapshot | null) {
  return snapshot?.items ?? ([] as TopCoinItem[]);
}
