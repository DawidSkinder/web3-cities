import type { FeedHandlers, FeedStatusEvent, NormalizedTrade, TradeFeed } from './types';

type BinanceTradeMessage = {
  e?: string;
  E?: number;
  s?: string;
  p?: string;
  q?: string;
  T?: number;
  m?: boolean;
};

const BINANCE_BTC_TRADE_WS = 'wss://stream.binance.com:9443/ws/btcusdt@trade';

export class BinanceTradeFeed implements TradeFeed {
  readonly source = 'binance' as const;

  private ws: WebSocket | null = null;
  private handlers: FeedHandlers | null = null;
  private stopped = true;
  private reconnectTimer: number | null = null;
  private inactivityTimer: number | null = null;
  private reconnectAttempt = 0;
  private lastMessageAt = 0;

  start(handlers: FeedHandlers) {
    this.stop();
    this.handlers = handlers;
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.clearTimers();

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
      attempt: this.reconnectAttempt
    });

    let ws: WebSocket;
    try {
      ws = new WebSocket(BINANCE_BTC_TRADE_WS);
    } catch (error) {
      this.emitStatus({
        state: 'disconnected',
        message: error instanceof Error ? error.message : 'websocket construction failed'
      });
      this.scheduleReconnect('constructor');
      return;
    }

    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws || this.stopped) {
        return;
      }

      this.reconnectAttempt = 0;
      this.lastMessageAt = Date.now();
      this.emitStatus({ state: 'connected' });
      this.scheduleInactivityCheck();
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
      if (normalized) {
        this.handlers?.onTrade(normalized);
      }
    };

    ws.onerror = () => {
      if (this.stopped) {
        return;
      }
      this.emitStatus({ state: 'disconnected', message: 'websocket error' });
    };

    ws.onclose = (event) => {
      if (this.ws === ws) {
        this.ws = null;
      }
      if (this.stopped) {
        return;
      }

      this.clearInactivityTimer();
      this.emitStatus({
        state: 'disconnected',
        code: event.code,
        reason: event.reason || 'socket closed'
      });
      this.scheduleReconnect('close');
    };
  }

  private normalizeTrade(message: BinanceTradeMessage): NormalizedTrade | null {
    const price = Number(message.p);
    const quantity = Number(message.q);
    const timestamp = Number(message.T ?? message.E ?? Date.now());

    if (!Number.isFinite(price) || !Number.isFinite(quantity) || !Number.isFinite(timestamp)) {
      return null;
    }
    if (price <= 0 || quantity <= 0) {
      return null;
    }

    return {
      timestamp,
      price,
      quantity,
      side: message.m ? 'sell' : 'buy',
      source: 'binance'
    };
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
      reason
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
        this.emitStatus({
          state: 'disconnected',
          message: `inactivity timeout (${idleForMs}ms)`
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

