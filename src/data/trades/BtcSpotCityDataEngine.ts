import { BinanceTradeFeed } from './BinanceTradeFeed';
import { MockTradeFeed } from './MockTradeFeed';
import { TradeWindowAggregator } from './TradeWindowAggregator';
import type {
  BlockEvent,
  FeedStatusEvent,
  NormalizedTrade,
  TradeFeed,
  TradeFeedMode,
  TradeSource
} from './types';

type DataEngineConfig = {
  feedMode?: TradeFeedMode;
  windowMs?: number;
  logWindows?: boolean;
};

type BlockEventListener = (event: BlockEvent) => void;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatSigned(value: number, decimals: number) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(decimals)}`;
}

function formatTimestamp(ms: number) {
  return new Date(ms).toISOString().slice(11, 19);
}

export function resolveTradeFeedMode(): TradeFeedMode {
  const urlMode =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('feed')
      : null;
  const envMode = import.meta.env.VITE_TRADE_FEED_MODE;
  const rawMode = (urlMode ?? envMode ?? 'auto').toLowerCase();

  if (rawMode === 'live' || rawMode === 'mock' || rawMode === 'auto') {
    return rawMode;
  }
  return 'auto';
}

export class BtcSpotCityDataEngine {
  private readonly feedMode: TradeFeedMode;
  private readonly windowMs: number;
  private readonly logWindows: boolean;
  private readonly listeners = new Set<BlockEventListener>();
  private readonly aggregator: TradeWindowAggregator;

  private activeFeed: TradeFeed | null = null;
  private activeSource: TradeSource = 'binance';
  private started = false;
  private liveTradeSeen = false;
  private fallbackToMockTimer: number | null = null;
  private firstLiveTradeDeadlineMs = 12000;
  private mockFallbackActivated = false;

  constructor(config: DataEngineConfig = {}) {
    this.feedMode = config.feedMode ?? resolveTradeFeedMode();
    this.windowMs = config.windowMs ?? 3000;
    this.logWindows = config.logWindows ?? true;

    this.aggregator = new TradeWindowAggregator({
      windowMs: this.windowMs,
      feedMode: this.feedMode,
      getCurrentSource: () => this.activeSource,
      onBlockEvent: (event) => this.handleBlockEvent(event)
    });
  }

  start() {
    if (this.started) {
      return;
    }

    this.started = true;
    this.liveTradeSeen = false;
    this.mockFallbackActivated = false;
    this.aggregator.start();

    if (this.feedMode === 'mock') {
      this.startFeed(new MockTradeFeed());
      return;
    }

    this.startFeed(new BinanceTradeFeed());

    if (this.feedMode === 'auto') {
      this.armInitialMockFallbackTimer();
    }
  }

  stop() {
    this.started = false;
    this.clearFallbackTimer();
    this.activeFeed?.stop();
    this.activeFeed = null;
    this.aggregator.stop();
  }

  subscribe(listener: BlockEventListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private startFeed(feed: TradeFeed) {
    this.activeFeed?.stop();
    this.activeFeed = feed;
    this.activeSource = feed.source;

    feed.start({
      onTrade: (trade) => this.handleTrade(trade),
      onStatus: (event) => this.handleFeedStatus(event)
    });
  }

  private handleTrade(trade: NormalizedTrade) {
    if (trade.source === 'binance' && !this.liveTradeSeen) {
      this.liveTradeSeen = true;
      this.clearFallbackTimer();
      console.info('[BTC Spot City] live trade stream active (Binance).');
    }

    this.activeSource = trade.source;
    this.aggregator.ingest(trade);
  }

  private handleFeedStatus(event: FeedStatusEvent) {
    if (event.state === 'stopped') {
      return;
    }

    const details = [
      `source=${event.source}`,
      `state=${event.state}`,
      event.attempt !== undefined ? `attempt=${event.attempt}` : '',
      event.delayMs !== undefined ? `delay=${event.delayMs}ms` : '',
      event.code !== undefined ? `code=${event.code}` : '',
      event.reason ? `reason=${event.reason}` : '',
      event.message ? `msg=${event.message}` : ''
    ]
      .filter(Boolean)
      .join(' ');

    console.info(`[BTC Spot City][feed] ${details}`);

    if (
      this.feedMode === 'auto' &&
      !this.liveTradeSeen &&
      !this.mockFallbackActivated &&
      event.source === 'binance' &&
      event.state === 'reconnecting' &&
      (event.attempt ?? 0) >= 4
    ) {
      this.activateMockFallback('live feed reconnect threshold reached');
    }
  }

  private armInitialMockFallbackTimer() {
    this.clearFallbackTimer();
    this.fallbackToMockTimer = window.setTimeout(() => {
      this.fallbackToMockTimer = null;
      if (!this.liveTradeSeen && !this.mockFallbackActivated && this.started) {
        this.activateMockFallback('no live trades received during startup window');
      }
    }, this.firstLiveTradeDeadlineMs);
  }

  private clearFallbackTimer() {
    if (this.fallbackToMockTimer !== null) {
      window.clearTimeout(this.fallbackToMockTimer);
      this.fallbackToMockTimer = null;
    }
  }

  private activateMockFallback(reason: string) {
    if (this.mockFallbackActivated || !this.started) {
      return;
    }

    this.mockFallbackActivated = true;
    console.warn(`[BTC Spot City] switching to mock trade feed (${reason}).`);
    this.startFeed(new MockTradeFeed());
  }

  private handleBlockEvent(event: BlockEvent) {
    if (this.logWindows) {
      this.logBlockEvent(event);
    }

    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private logBlockEvent(event: BlockEvent) {
    const m = event.metrics;
    const imbalancePct = m.imbalance * 100;
    const intensityPct = clamp(m.intensity * 100, 0, 100);

    console.log(
      `[BTC Spot City][${formatTimestamp(event.windowEnd)}] ` +
        `${event.source}/${event.feedMode} ` +
        `n=${m.tradeCount} ` +
        `v=${m.totalVolume.toFixed(4)} ` +
        `b=${m.buyVolume.toFixed(4)} ` +
        `s=${m.sellVolume.toFixed(4)} ` +
        `imb=${formatSigned(imbalancePct, 1)}% ` +
        `avg=${m.averageTradeSize.toFixed(5)} ` +
        `dp=${formatSigned(m.priceChange, 2)} ` +
        `vol=${m.volatility.toFixed(2)} ` +
        `I=${intensityPct.toFixed(0)}`
    );
  }
}

