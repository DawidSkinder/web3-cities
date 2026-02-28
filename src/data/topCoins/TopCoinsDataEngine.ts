import type { TopCoinItem, TopCoinsSnapshot, TopCoinsStaticSnapshotFile } from './types';

type TopCoinsDataEngineConfig = {
  endpoint?: string;
  rawEndpoint?: string;
  limit?: number;
  pollMs?: number;
  storageKey?: string;
};

type TopCoinsSnapshotListener = (snapshot: TopCoinsSnapshot) => void;

type TopCoinsSnapshotSeed = Omit<TopCoinsSnapshot, 'sequence' | 'emittedAt'>;

const DEFAULT_POLL_MS = 60_000;
const MIN_POLL_MS = 60_000;
const LOCAL_STORAGE_KEY = 'top200:last-good-snapshot:v2';

function resolveDefaultEndpoint() {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}data/top-coins.json`;
}

function resolveDefaultRawEndpoint() {
  const fromEnv = String(import.meta.env.VITE_TOP_COINS_RAW_URL ?? '').trim();
  if (fromEnv) return fromEnv;

  if (typeof window === 'undefined') return '';
  const host = window.location.hostname.toLowerCase();
  if (!host.endsWith('.github.io')) return '';

  const owner = host.split('.')[0] ?? '';
  const repo = window.location.pathname.split('/').filter(Boolean)[0] ?? '';
  if (!owner || !repo) return '';

  const branch = String(import.meta.env.VITE_TOP_COINS_RAW_BRANCH ?? 'main').trim() || 'main';
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/public/data/top-coins.json`;
}

function parsePollMs(raw: unknown, minMs: number, fallbackMs: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallbackMs;
  return Math.max(minMs, Math.floor(parsed));
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

  const rank = Math.max(1, Math.floor(asNumber(row.rankByQuoteVolume, fallbackRank)));
  const base = asString(row.base).trim().toUpperCase() || symbol.replace(/USDT$/, '');
  const quote = asString(row.quote).trim().toUpperCase() || 'USDT';

  return {
    symbol,
    base,
    quote,
    lastPrice: asNumber(row.lastPrice, 0),
    priceChangePercent: asNumber(row.priceChangePercent, 0),
    quoteVolume: Math.max(0, asNumber(row.quoteVolume, 0)),
    rankByQuoteVolume: rank,
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

  const asOfRaw = asString(payload.asOf).trim();
  if (!asOfRaw) {
    throw new Error('snapshot-invalid-asof');
  }
  const asOfMs = Date.parse(asOfRaw);
  if (!Number.isFinite(asOfMs) || asOfMs <= 0) {
    throw new Error('snapshot-invalid-asof');
  }

  const intervalSec = Math.max(1, Math.floor(asNumber(payload.intervalSec, 60)));
  const source = asString(payload.source, 'binance').trim().toLowerCase() || 'binance';
  const hash = asString(payload.hash).trim().toLowerCase();
  if (!/^[a-f0-9]{8}$/.test(hash)) {
    throw new Error('snapshot-invalid-hash');
  }

  const coinsRaw = Array.isArray(payload.coins) ? payload.coins : [];
  const parsedCoins: TopCoinItem[] = [];
  for (let i = 0; i < coinsRaw.length; i++) {
    const item = parseTopCoinItem(coinsRaw[i], i + 1);
    if (item) parsedCoins.push(item);
  }

  parsedCoins.sort((a, b) => a.rankByQuoteVolume - b.rankByQuoteVolume || a.symbol.localeCompare(b.symbol));
  if (parsedCoins.length < limit) {
    throw new Error('snapshot-invalid-count');
  }

  return {
    asOf: new Date(asOfMs).toISOString(),
    intervalSec,
    source,
    hash,
    logosAttempted: Math.max(0, Math.floor(asNumber(payload.logosAttempted, parsedCoins.length))),
    logosDownloaded: Math.max(0, Math.floor(asNumber(payload.logosDownloaded, 0))),
    logosMissing: Math.max(0, Math.floor(asNumber(payload.logosMissing, 0))),
    coins: parsedCoins.slice(0, limit)
  };
}

function normalizeError(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'snapshot-unknown-error';
}

function normalizeEndpointError(endpoint: string, error: unknown) {
  const message = normalizeError(error);
  return `${endpoint} :: ${message}`;
}

function formatTopVolume(quoteVolume: number) {
  if (!Number.isFinite(quoteVolume)) return '$0';
  if (quoteVolume >= 1_000_000_000) return `$${(quoteVolume / 1_000_000_000).toFixed(2)}B`;
  if (quoteVolume >= 1_000_000) return `$${(quoteVolume / 1_000_000).toFixed(2)}M`;
  if (quoteVolume >= 1_000) return `$${(quoteVolume / 1_000).toFixed(2)}K`;
  return `$${quoteVolume.toFixed(0)}`;
}

export class TopCoinsDataEngine {
  private readonly endpoints: string[];
  private readonly limit: number;
  private readonly pollMs: number;
  private readonly storageKey: string;

  private readonly listeners = new Set<TopCoinsSnapshotListener>();
  private started = false;
  private timer: number | null = null;
  private activeRequest: Promise<void> | null = null;
  private activeAbort: AbortController | null = null;

  private sequence = 0;
  private sessionMaxQuoteVolume = 0;
  private sessionMaxAbsPct = 0;
  private lastSnapshot: TopCoinsSnapshot | null = null;
  private lastGoodPayload: TopCoinsStaticSnapshotFile | null = null;

  private lastFetchAt = 0;
  private lastSuccessAt = 0;
  private lastAsOf = 0;
  private lastSeenHash = 'none';

  constructor(config: TopCoinsDataEngineConfig = {}) {
    const pagesEndpoint = config.endpoint?.trim() || resolveDefaultEndpoint();
    const rawEndpoint = config.rawEndpoint?.trim() || resolveDefaultRawEndpoint();

    this.endpoints = [rawEndpoint, pagesEndpoint].filter((value, index, arr) => Boolean(value) && arr.indexOf(value) === index);
    this.limit = parseLimit(config.limit ?? import.meta.env.VITE_TOP_COINS_LIMIT);
    this.pollMs = parsePollMs(config.pollMs ?? import.meta.env.VITE_TOP_COINS_POLL_MS, MIN_POLL_MS, DEFAULT_POLL_MS);
    this.storageKey = config.storageKey?.trim() || LOCAL_STORAGE_KEY;
  }

  start() {
    if (this.started) return;

    this.started = true;
    this.sequence = 0;
    this.sessionMaxQuoteVolume = 0;
    this.sessionMaxAbsPct = 0;
    this.lastSnapshot = null;
    this.lastGoodPayload = this.readLastGoodSnapshot();
    this.lastFetchAt = 0;
    this.lastSuccessAt = 0;
    this.lastAsOf = 0;
    this.lastSeenHash = this.lastGoodPayload?.hash ?? 'none';

    if (this.lastGoodPayload) {
      const restored = this.buildSnapshotSeed({
        payload: this.lastGoodPayload,
        fetchedAt: Date.now(),
        endpoint: 'local-cache',
        lastError: null,
        lastFetchOk: false,
        hashChanged: true,
        changedCount: 0,
        asOfOverrideMs: Date.parse(this.lastGoodPayload.asOf)
      });
      this.emit(restored);
    }

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

  private readLastGoodSnapshot() {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      return parsePayload(parsed, this.limit);
    } catch {
      return null;
    }
  }

  private writeLastGoodSnapshot(payload: TopCoinsStaticSnapshotFile) {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(payload));
    } catch {
      // Ignore storage failures.
    }
  }

  private buildEmptySnapshot(lastError: string, fetchedAt: number): TopCoinsSnapshotSeed {
    const nextUpdateAt = fetchedAt + this.pollMs;
    return {
      kind: 'top-coins-snapshot',
      asOf: this.lastAsOf,
      asOfIso: this.lastAsOf > 0 ? new Date(this.lastAsOf).toISOString() : '',
      hash: this.lastSeenHash,
      hashChanged: false,
      ttlMs: this.pollMs,
      items: this.lastGoodPayload?.coins ?? [],
      stats: {
        topGainer: { symbol: 'N/A', pct: 0 },
        topLoser: { symbol: 'N/A', pct: 0 },
        topVolume: { symbol: 'N/A', quoteVolume: 0 },
        sessionMaxQuoteVolume: this.sessionMaxQuoteVolume,
        sessionMaxAbsPct: this.sessionMaxAbsPct,
        marketBreadth: {
          positive: 0,
          negative: 0
        },
        breadth: 0
      },
      debug: {
        symbols: this.lastGoodPayload?.coins.length ?? 0,
        fetchedAt,
        lastFetchAt: fetchedAt,
        lastSuccessAt: this.lastSuccessAt,
        lastAsOf: this.lastAsOf,
        lastHash: this.lastSeenHash,
        hashChanged: false,
        changedCount: 0,
        refreshAgeSec: this.lastAsOf > 0 ? Math.max(0, (fetchedAt - this.lastAsOf) / 1000) : 0,
        pollMs: this.pollMs,
        nextUpdateAt,
        endpoint: this.endpoints[0] ?? 'none',
        lastError,
        lastFetchOk: false,
        logosMissing: this.lastGoodPayload?.logosMissing ?? 0,
        logosAttempted: this.lastGoodPayload?.logosAttempted ?? this.lastGoodPayload?.coins.length ?? 0,
        logosDownloaded: this.lastGoodPayload?.logosDownloaded ?? 0
      }
    };
  }

  private computeChangedCount(nextItems: TopCoinItem[], prevItems: TopCoinItem[] | null) {
    if (!prevItems || prevItems.length === 0) return nextItems.length;

    const prevMap = new Map<string, TopCoinItem>();
    for (const item of prevItems) {
      prevMap.set(item.symbol, item);
    }

    let changed = 0;
    for (const next of nextItems) {
      const prev = prevMap.get(next.symbol);
      if (!prev) {
        changed += 1;
        continue;
      }

      const pctDelta = Math.abs(next.priceChangePercent - prev.priceChangePercent);
      const volumeBase = Math.max(prev.quoteVolume, 1);
      const volumeDeltaRatio = Math.abs(next.quoteVolume - prev.quoteVolume) / volumeBase;
      if (pctDelta > 0.1 || volumeDeltaRatio > 0.05) {
        changed += 1;
      }
    }

    return changed;
  }

  private buildSnapshotSeed({
    payload,
    fetchedAt,
    endpoint,
    lastError,
    lastFetchOk,
    hashChanged,
    changedCount,
    asOfOverrideMs
  }: {
    payload: TopCoinsStaticSnapshotFile;
    fetchedAt: number;
    endpoint: string;
    lastError: string | null;
    lastFetchOk: boolean;
    hashChanged: boolean;
    changedCount: number;
    asOfOverrideMs?: number;
  }): TopCoinsSnapshotSeed {
    const asOfMs = Number.isFinite(asOfOverrideMs) ? (asOfOverrideMs as number) : Date.parse(payload.asOf);
    const items = payload.coins;

    const topGainer = topBy(items, (item) => item.priceChangePercent) ?? items[0] ?? null;
    const topLoser = topBy(items, (item) => -item.priceChangePercent) ?? items[0] ?? null;
    const topVolume = topBy(items, (item) => item.quoteVolume) ?? items[0] ?? null;

    let positive = 0;
    let negative = 0;
    for (const item of items) {
      if (item.priceChangePercent > 0) positive += 1;
      if (item.priceChangePercent < 0) negative += 1;
    }

    this.sessionMaxQuoteVolume = Math.max(
      this.sessionMaxQuoteVolume,
      ...items.map((item) => item.quoteVolume)
    );
    this.sessionMaxAbsPct = Math.max(this.sessionMaxAbsPct, ...items.map((item) => Math.abs(item.priceChangePercent)));

    const nextUpdateAt = fetchedAt + this.pollMs;
    const breadthBase = Math.max(items.length, 1);
    const breadth = (positive - negative) / breadthBase;

    return {
      kind: 'top-coins-snapshot',
      asOf: asOfMs,
      asOfIso: Number.isFinite(asOfMs) && asOfMs > 0 ? new Date(asOfMs).toISOString() : '',
      hash: payload.hash,
      hashChanged,
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
        },
        breadth
      },
      debug: {
        symbols: items.length,
        fetchedAt,
        lastFetchAt: this.lastFetchAt,
        lastSuccessAt: this.lastSuccessAt,
        lastAsOf: this.lastAsOf,
        lastHash: this.lastSeenHash,
        hashChanged,
        changedCount,
        refreshAgeSec: this.lastAsOf > 0 ? Math.max(0, (fetchedAt - this.lastAsOf) / 1000) : 0,
        pollMs: this.pollMs,
        nextUpdateAt,
        endpoint,
        lastError,
        lastFetchOk,
        logosMissing: payload.logosMissing ?? 0,
        logosAttempted: payload.logosAttempted ?? items.length,
        logosDownloaded: payload.logosDownloaded ?? 0
      }
    };
  }

  private shouldEmit(next: TopCoinsSnapshotSeed) {
    if (!this.lastSnapshot) return true;
    if (this.lastSnapshot.debug.lastHash !== next.debug.lastHash) return true;
    if (this.lastSnapshot.debug.lastError !== next.debug.lastError) return true;
    if (this.lastSnapshot.debug.lastFetchOk !== next.debug.lastFetchOk) return true;
    if (this.lastSnapshot.asOf !== next.asOf) return true;
    if (this.lastSnapshot.debug.changedCount !== next.debug.changedCount) return true;
    if (this.lastSnapshot.debug.lastFetchAt !== next.debug.lastFetchAt) return true;
    return false;
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
        this.lastFetchAt = now;

        const seed = this.buildEmptySnapshot(message, now);
        if (this.shouldEmit(seed)) {
          this.emit(seed);
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
    this.lastFetchAt = now;
    const minuteBucket = Math.floor(now / 60_000);

    let payload: TopCoinsStaticSnapshotFile | null = null;
    let usedEndpoint = this.endpoints[0] ?? resolveDefaultEndpoint();
    const endpointErrors: string[] = [];

    for (const endpoint of this.endpoints) {
      try {
        const url = new URL(endpoint, window.location.origin);
        url.searchParams.set('t', String(minuteBucket));

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
        let json: unknown;
        try {
          json = JSON.parse(body);
        } catch {
          throw new Error('snapshot-invalid-json');
        }

        payload = parsePayload(json, this.limit);
        usedEndpoint = endpoint;
        break;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw error;
        }
        endpointErrors.push(normalizeEndpointError(endpoint, error));
      }
    }

    if (!payload) {
      throw new Error(endpointErrors.join(' | ') || 'snapshot-fetch-failed');
    }

    const parsedAsOfMs = Date.parse(payload.asOf);
    const hashChanged = this.lastSeenHash === 'none' || payload.hash !== this.lastSeenHash;
    const changedCount = hashChanged
      ? this.computeChangedCount(payload.coins, this.lastGoodPayload?.coins ?? null)
      : 0;

    this.lastSuccessAt = now;
    this.lastAsOf = Number.isFinite(parsedAsOfMs) ? parsedAsOfMs : this.lastAsOf;

    if (hashChanged || !this.lastGoodPayload) {
      this.lastGoodPayload = payload;
      this.writeLastGoodSnapshot(payload);
    }
    this.lastSeenHash = payload.hash;

    const effectivePayload = this.lastGoodPayload ?? payload;
    const seed = this.buildSnapshotSeed({
      payload: effectivePayload,
      fetchedAt: now,
      endpoint: usedEndpoint,
      lastError: null,
      lastFetchOk: true,
      hashChanged,
      changedCount,
      asOfOverrideMs: Number.isFinite(parsedAsOfMs) ? parsedAsOfMs : undefined
    });

    if (hashChanged) {
      const topGainer = seed.stats.topGainer;
      const topLoser = seed.stats.topLoser;
      const topVolume = seed.stats.topVolume;
      console.info(
        `[top200] asOf=${seed.asOfIso} hash=${seed.hash} changed=${changedCount} ` +
          `topGainer=${topGainer.symbol}(${topGainer.pct >= 0 ? '+' : ''}${topGainer.pct.toFixed(2)}%) ` +
          `topLoser=${topLoser.symbol}(${topLoser.pct >= 0 ? '+' : ''}${topLoser.pct.toFixed(2)}%) ` +
          `topVol=${topVolume.symbol}(${formatTopVolume(topVolume.quoteVolume)})`
      );
    }

    if (this.shouldEmit(seed)) {
      this.emit(seed);
    }
  }
}

export function resolveTopCoinsItems(snapshot: TopCoinsSnapshot | null) {
  return snapshot?.items ?? ([] as TopCoinItem[]);
}
