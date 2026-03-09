import type { FeedHandlers, FeedStatusEvent, NormalizedTrade, TradeFeed } from './types';

type BinanceTradeMessage = {
  e?: string;
  E?: number;
  s?: string;
  t?: number;
  p?: string;
  q?: string;
  T?: number;
  m?: boolean;
};

type BinanceAggTradeMessage = {
  a?: number;
  p?: string;
  q?: string;
  f?: number;
  l?: number;
  T?: number;
  m?: boolean;
};

type BackfillRequest = {
  fromId?: number;
  startTime?: number;
  endTime?: number;
  limit?: number;
};

type BinanceTradeFeedConfig = {
  symbol: string;
};

const BINANCE_TRADE_WS_BASE = 'wss://stream.binance.com:9443/ws';
const BINANCE_AGG_TRADES_REST = 'https://api.binance.com/api/v3/aggTrades';
const BACKFILL_LIMIT = 1000;
const BACKFILL_MAX_TRADES = 10_000;
const BACKFILL_OVERLAP_GUARD_MS = 750;

export class BinanceTradeFeed implements TradeFeed {
  readonly source = 'binance' as const;
  private readonly symbol: string;
  private readonly tradeWsUrl: string;

  private ws: WebSocket | null = null;
  private handlers: FeedHandlers | null = null;
  private stopped = true;
  private reconnectTimer: number | null = null;
  private inactivityTimer: number | null = null;
  private reconnectAttempt = 0;
  private lastMessageAt = 0;
  private disconnectDetectedAt = 0;

  private connectedOnce = false;
  private backfillInFlight = false;
  private backfillRunToken = 0;
  private backfillTradesTotal = 0;

  private lastSeenTradeTimestamp = 0;
  private lastSeenRawTradeId: number | null = null;
  private lastSeenAggTradeId: number | null = null;

  constructor(config: BinanceTradeFeedConfig) {
    this.symbol = config.symbol.trim().toUpperCase();
    this.tradeWsUrl = `${BINANCE_TRADE_WS_BASE}/${this.symbol.toLowerCase()}@trade`;
  }

  start(handlers: FeedHandlers) {
    this.stop();
    this.handlers = handlers;
    this.stopped = false;
    this.reconnectAttempt = 0;
    this.lastMessageAt = 0;
    this.disconnectDetectedAt = 0;
    this.connectedOnce = false;
    this.backfillInFlight = false;
    this.backfillRunToken += 1;
    this.backfillTradesTotal = 0;
    this.lastSeenTradeTimestamp = 0;
    this.lastSeenRawTradeId = null;
    this.lastSeenAggTradeId = null;
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.clearTimers();
    this.backfillInFlight = false;
    this.backfillRunToken += 1;

    const ws = this.ws;
    this.ws = null;

    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        // Ignore close errors during teardown.
      }
    }

    this.emitStatus({ state: 'stopped', message: 'feed stopped' });
  }

  private connect() {
    if (this.stopped) {
      return;
    }

    this.emitStatus({
      state: this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting',
      attempt: this.reconnectAttempt,
      channel: 'ws'
    });

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.tradeWsUrl);
    } catch (error) {
      this.emitStatus({
        state: 'disconnected',
        message: error instanceof Error ? error.message : 'websocket construction failed',
        channel: 'ws'
      });
      this.disconnectDetectedAt = Date.now();
      this.scheduleReconnect('constructor');
      return;
    }

    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws || this.stopped) {
        return;
      }

      const shouldBackfill = this.connectedOnce && this.lastSeenTradeTimestamp > 0;
      const reconnectOpenedAtMs = Date.now();
      this.connectedOnce = true;
      this.reconnectAttempt = 0;
      this.lastMessageAt = reconnectOpenedAtMs;
      this.emitStatus({ state: 'connected', channel: 'ws' });
      this.scheduleInactivityCheck();

      if (shouldBackfill) {
        void this.runReconnectBackfill(reconnectOpenedAtMs);
      }
    };

    ws.onmessage = (event) => {
      if (this.ws !== ws || this.stopped) {
        return;
      }

      this.lastMessageAt = Date.now();
      this.scheduleInactivityCheck();

      if (typeof event.data !== 'string') {
        return;
      }

      let payload: BinanceTradeMessage;
      try {
        payload = JSON.parse(event.data) as BinanceTradeMessage;
      } catch {
        return;
      }

      const normalized = this.normalizeTrade(payload);
      if (!normalized) {
        return;
      }

      this.lastSeenTradeTimestamp = Math.max(this.lastSeenTradeTimestamp, normalized.timestamp);
      this.lastSeenRawTradeId = Math.max(this.lastSeenRawTradeId ?? normalized.id, normalized.id);
      this.handlers?.onTrade(normalized);
    };

    ws.onerror = () => {
      if (this.stopped) {
        return;
      }
      this.disconnectDetectedAt = Date.now();
      this.emitStatus({ state: 'disconnected', message: 'websocket error', channel: 'ws' });
    };

    ws.onclose = (event) => {
      if (this.ws === ws) {
        this.ws = null;
      }
      if (this.stopped) {
        return;
      }

      this.disconnectDetectedAt = Date.now();
      this.clearInactivityTimer();
      this.emitStatus({
        state: 'disconnected',
        code: event.code,
        reason: event.reason || 'socket closed',
        channel: 'ws'
      });
      this.scheduleReconnect('close');
    };
  }

  private normalizeTrade(message: BinanceTradeMessage): NormalizedTrade | null {
    const id = Number(message.t);
    const price = Number(message.p);
    const quantity = Number(message.q);
    const timestamp = Number(message.T ?? message.E ?? Date.now());
    const isBuyerMaker = message.m;

    if (!Number.isFinite(id) || !Number.isInteger(id) || id < 0) {
      return null;
    }
    if (!Number.isFinite(price) || !Number.isFinite(quantity) || !Number.isFinite(timestamp)) {
      return null;
    }
    if (typeof isBuyerMaker !== 'boolean') {
      return null;
    }
    if (price <= 0 || quantity <= 0) {
      return null;
    }

    const aggressorSide = isBuyerMaker ? 'sell' : 'buy';

    return {
      id,
      idKind: 'trade',
      timestamp,
      price,
      quantity,
      isBuyerMaker,
      aggressorSide,
      side: aggressorSide,
      source: 'binance',
      transport: 'ws'
    };
  }

  private normalizeAggTrade(message: BinanceAggTradeMessage): NormalizedTrade | null {
    const id = Number(message.a);
    const price = Number(message.p);
    const quantity = Number(message.q);
    const timestamp = Number(message.T ?? Date.now());
    const isBuyerMaker = message.m;
    const rawTradeIdStart = message.f;
    const rawTradeIdEnd = message.l;

    if (!Number.isFinite(id) || !Number.isInteger(id) || id < 0) {
      return null;
    }
    if (!Number.isFinite(price) || !Number.isFinite(quantity) || !Number.isFinite(timestamp)) {
      return null;
    }
    if (typeof isBuyerMaker !== 'boolean') {
      return null;
    }
    if (price <= 0 || quantity <= 0) {
      return null;
    }

    const aggressorSide = isBuyerMaker ? 'sell' : 'buy';

    return {
      id,
      idKind: 'aggTrade',
      timestamp,
      price,
      quantity,
      isBuyerMaker,
      aggressorSide,
      side: aggressorSide,
      source: 'binance',
      transport: 'rest',
      rawTradeIdStart:
        Number.isFinite(Number(rawTradeIdStart)) && Number(rawTradeIdStart) >= 0
          ? Number(rawTradeIdStart)
          : undefined,
      rawTradeIdEnd:
        Number.isFinite(Number(rawTradeIdEnd)) && Number(rawTradeIdEnd) >= 0
          ? Number(rawTradeIdEnd)
          : undefined
    };
  }

  private async runReconnectBackfill(reconnectOpenedAtMs: number) {
    if (this.stopped || this.backfillInFlight) {
      return;
    }

    const gapStart = Math.max(0, this.lastSeenTradeTimestamp + 1);
    const gapEnd = Math.max(gapStart, reconnectOpenedAtMs - BACKFILL_OVERLAP_GUARD_MS);

    if (gapEnd <= gapStart) {
      return;
    }

    this.backfillInFlight = true;
    const runToken = ++this.backfillRunToken;
    let emittedThisRun = 0;
    let fetchedThisRun = 0;
    let usedFromId = this.lastSeenAggTradeId !== null;
    let nextFromId = this.lastSeenAggTradeId !== null ? this.lastSeenAggTradeId + 1 : undefined;

    this.emitStatus({
      state: 'connected',
      channel: 'rest',
      backfillPhase: 'started',
      backfillTradesDelta: 0,
      backfillTradesTotal: this.backfillTradesTotal,
      backfillUsedFromId: usedFromId,
      message: `backfill start ${gapStart}-${gapEnd}`
    });

    try {
      while (!this.stopped && runToken === this.backfillRunToken && fetchedThisRun < BACKFILL_MAX_TRADES) {
        const request: BackfillRequest = {
          limit: BACKFILL_LIMIT
        };

        if (typeof nextFromId === 'number') {
          request.fromId = nextFromId;
        } else {
          request.startTime = gapStart;
          request.endTime = gapEnd;
        }

        const page = await this.fetchAggTradesPage(request);
        if (this.stopped || runToken !== this.backfillRunToken) {
          return;
        }
        if (page.length === 0) {
          break;
        }

        fetchedThisRun += page.length;
        let pageCrossedGapEnd = false;

        for (const row of page) {
          const normalized = this.normalizeAggTrade(row);
          if (!normalized) {
            continue;
          }

          this.lastSeenAggTradeId = Math.max(this.lastSeenAggTradeId ?? normalized.id, normalized.id);
          nextFromId = normalized.id + 1;
          usedFromId = true;

          if (normalized.timestamp > gapEnd) {
            pageCrossedGapEnd = true;
            continue;
          }

          this.lastSeenTradeTimestamp = Math.max(this.lastSeenTradeTimestamp, normalized.timestamp);
          this.handlers?.onTrade(normalized);
          emittedThisRun += 1;
        }

        if (page.length < BACKFILL_LIMIT) {
          break;
        }
        if (pageCrossedGapEnd) {
          break;
        }
      }

      this.backfillTradesTotal += emittedThisRun;
      this.emitStatus({
        state: 'connected',
        channel: 'rest',
        backfillPhase: 'completed',
        backfillTradesDelta: emittedThisRun,
        backfillTradesTotal: this.backfillTradesTotal,
        backfillUsedFromId: usedFromId,
        message:
          fetchedThisRun >= BACKFILL_MAX_TRADES
            ? `backfill capped at ${BACKFILL_MAX_TRADES} rows`
            : `backfill complete (${emittedThisRun} trades)`
      });
    } catch (error) {
      this.emitStatus({
        state: 'connected',
        channel: 'rest',
        backfillPhase: 'failed',
        backfillTradesDelta: 0,
        backfillTradesTotal: this.backfillTradesTotal,
        backfillUsedFromId: usedFromId,
        message: error instanceof Error ? error.message : 'backfill failed'
      });
    } finally {
      if (runToken === this.backfillRunToken) {
        this.backfillInFlight = false;
      }
    }
  }

  private async fetchAggTradesPage(request: BackfillRequest) {
    const url = new URL(BINANCE_AGG_TRADES_REST);
    url.searchParams.set('symbol', this.symbol);
    url.searchParams.set('limit', String(request.limit ?? BACKFILL_LIMIT));
    if (typeof request.fromId === 'number') {
      url.searchParams.set('fromId', String(request.fromId));
    }
    if (typeof request.startTime === 'number') {
      url.searchParams.set('startTime', String(request.startTime));
    }
    if (typeof request.endTime === 'number') {
      url.searchParams.set('endTime', String(request.endTime));
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`backfill HTTP ${response.status}`);
    }

    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) {
      throw new Error('backfill response is not an array');
    }

    return data as BinanceAggTradeMessage[];
  }

  private scheduleReconnect(reason: string) {
    if (this.stopped) {
      return;
    }

    this.clearReconnectTimer();
    this.reconnectAttempt += 1;

    const baseDelay = Math.min(15000, 1000 * 2 ** Math.min(this.reconnectAttempt - 1, 4));
    const jitter = Math.floor(Math.random() * 400);
    const delayMs = baseDelay + jitter;

    this.emitStatus({
      state: 'reconnecting',
      attempt: this.reconnectAttempt,
      delayMs,
      reason,
      channel: 'ws'
    });

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delayMs);
  }

  private scheduleInactivityCheck() {
    if (this.stopped) {
      return;
    }

    this.clearInactivityTimer();
    this.inactivityTimer = window.setTimeout(() => {
      if (this.stopped) {
        return;
      }

      const idleForMs = Date.now() - this.lastMessageAt;
      if (idleForMs >= 15000) {
        this.disconnectDetectedAt = Date.now();
        this.emitStatus({
          state: 'disconnected',
          message: `inactivity timeout (${idleForMs}ms)`,
          channel: 'ws'
        });
        try {
          this.ws?.close();
        } catch {
          // Ignore and rely on reconnect timer.
        }
      } else {
        this.scheduleInactivityCheck();
      }
    }, 15000);
  }

  private emitStatus(event: Omit<FeedStatusEvent, 'source' | 'timestamp'>) {
    this.handlers?.onStatus?.({
      ...event,
      source: this.source,
      timestamp: Date.now()
    });
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearInactivityTimer() {
    if (this.inactivityTimer !== null) {
      window.clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  private clearTimers() {
    this.clearReconnectTimer();
    this.clearInactivityTimer();
  }
}
