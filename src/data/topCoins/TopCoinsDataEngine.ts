import type { TopCoinItem, TopCoinsApiResponse, TopCoinsSnapshot } from './types';

type TopCoinsDataEngineConfig = {
  endpoint?: string;
  limit?: number;
  quote?: string;
  pollMs?: number;
};

type TopCoinsSnapshotListener = (snapshot: TopCoinsSnapshot) => void;

const DEFAULT_ENDPOINT = '/api/top-coins';

function parsePollMs(raw: unknown) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 60_000;
  return Math.max(30_000, Math.floor(parsed));
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

export class TopCoinsDataEngine {
  private readonly endpoint: string;
  private readonly limit: number;
  private readonly quote: string;
  private readonly pollMs: number;

  private readonly listeners = new Set<TopCoinsSnapshotListener>();
  private started = false;
  private timer: number | null = null;
  private activeRequest: Promise<void> | null = null;
  private activeAbort: AbortController | null = null;
  private sequence = 0;
  private lastSnapshot: TopCoinsSnapshot | null = null;

  private sessionMaxQuoteVolume = 0;
  private sessionMaxAbsPct = 0;
  private lastError: string | null = null;

  constructor(config: TopCoinsDataEngineConfig = {}) {
    this.endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
    this.limit = Math.max(1, Math.min(500, Math.floor(config.limit ?? 200)));
    this.quote = (config.quote ?? 'USDT').trim().toUpperCase() || 'USDT';
    this.pollMs = parsePollMs(config.pollMs ?? import.meta.env.VITE_TOP_COINS_POLL_MS);
  }

  start() {
    if (this.started) return;

    this.started = true;
    this.sequence = 0;
    this.sessionMaxQuoteVolume = 0;
    this.sessionMaxAbsPct = 0;
    this.lastError = null;
    this.lastSnapshot = null;

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

  private async pollNow() {
    if (!this.started || this.activeRequest) {
      return this.activeRequest;
    }

    this.activeAbort = new AbortController();
    this.activeRequest = this.fetchAndEmit(this.activeAbort.signal)
      .catch((error) => {
        if (!this.started) return;
        this.lastError = error instanceof Error ? error.message : 'unknown-error';
        console.warn('[Top Coins Engine] poll failed', error);
        if (this.lastSnapshot) {
          this.sequence += 1;
          const erroredSnapshot: TopCoinsSnapshot = {
            ...this.lastSnapshot,
            sequence: this.sequence,
            emittedAt: Date.now(),
            debug: {
              ...this.lastSnapshot.debug,
              fetchedAt: Date.now(),
              lastError: this.lastError
            }
          };
          this.lastSnapshot = erroredSnapshot;
          for (const listener of this.listeners) {
            listener(erroredSnapshot);
          }
        }
      })
      .finally(() => {
        this.activeAbort = null;
        this.activeRequest = null;
      });

    return this.activeRequest;
  }

  private async fetchAndEmit(signal: AbortSignal) {
    const url = new URL(this.endpoint, window.location.origin);
    url.searchParams.set('limit', String(this.limit));
    url.searchParams.set('quote', this.quote);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      signal
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`proxy ${response.status}: ${message.slice(0, 180)}`);
    }

    const payload = (await response.json()) as TopCoinsApiResponse;
    const items = (payload.items ?? []).slice(0, this.limit);

    const topGainer = topBy(items, (item) => item.priceChangePercent) ?? items[0] ?? null;
    const topLoser = topBy(items, (item) => -item.priceChangePercent) ?? items[0] ?? null;
    const topVolume = topBy(items, (item) => item.quoteVolume) ?? items[0] ?? null;

    const positive = items.reduce((acc, item) => acc + (item.priceChangePercent >= 0 ? 1 : 0), 0);
    const negative = Math.max(0, items.length - positive);

    this.sessionMaxQuoteVolume = Math.max(
      this.sessionMaxQuoteVolume,
      ...items.map((item) => item.quoteVolume)
    );
    this.sessionMaxAbsPct = Math.max(
      this.sessionMaxAbsPct,
      ...items.map((item) => Math.abs(item.priceChangePercent))
    );

    this.sequence += 1;
    this.lastError = null;

    const snapshot: TopCoinsSnapshot = {
      kind: 'top-coins-snapshot',
      sequence: this.sequence,
      emittedAt: Date.now(),
      asOf: payload.asOf,
      ttlMs: payload.cache?.ttlMs ?? this.pollMs,
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
        cacheHit: payload.cache?.hit ?? false,
        cacheAgeMs: payload.cache?.ageMs ?? 0,
        cacheSource: payload.cache?.source ?? 'binance',
        fetchedAt: Date.now(),
        pollMs: this.pollMs,
        lastError: this.lastError,
        quote: payload.universe?.quote ?? this.quote
      }
    };
    this.lastSnapshot = snapshot;

    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export function resolveTopCoinsItems(snapshot: TopCoinsSnapshot | null) {
  return snapshot?.items ?? ([] as TopCoinItem[]);
}
