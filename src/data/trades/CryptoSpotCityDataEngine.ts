import type { CryptoCityPreset } from '../cryptoCity/presets';
import { BinanceTradeFeed } from './BinanceTradeFeed';
import { MockTradeFeed } from './MockTradeFeed';
import { RecentTradeDeduper } from './RecentTradeDeduper';
import { TradeWindowAggregator } from './TradeWindowAggregator';
import type {
  BlockEvent,
  BlockEventIntegrityMetrics,
  FeedStatusEvent,
  NormalizedTrade,
  TradeFeed,
  TradeFeedMode,
  TradeSource
} from './types';

type DataEngineConfig = {
  preset: CryptoCityPreset;
  feedMode?: TradeFeedMode;
  windowMs?: number;
  graceMs?: number;
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

export class CryptoSpotCityDataEngine {
  private readonly preset: CryptoCityPreset;
  private readonly feedMode: TradeFeedMode;
  private readonly windowMs: number;
  private readonly graceMs: number;
  private readonly logWindows: boolean;
  private readonly listeners = new Set<BlockEventListener>();
  private readonly aggregator: TradeWindowAggregator;
  private readonly deduper = new RecentTradeDeduper({
    capacity: 50_000,
    maxAgeMs: 120_000
  });

  private activeFeed: TradeFeed | null = null;
  private activeSource: TradeSource = 'binance';
  private started = false;
  private liveTradeSeen = false;
  private fallbackToMockTimer: number | null = null;
  private firstLiveTradeDeadlineMs = 12000;
  private mockFallbackActivated = false;

  private dedupDroppedTotal = 0;
  private backfillTradesIngestedTotal = 0;
  private lastBackfillActivityAt = 0;
  private readonly backfillRecentWindowMs = 30_000;

  private sessionMaxBuyNotional = 0;
  private sessionMaxBuyNotionalWindowStart = 0;
  private sessionMaxBuyNotionalSequence = 0;
  private sessionMaxInitialized = false;

  constructor(config: DataEngineConfig) {
    this.preset = config.preset;
    this.feedMode = config.feedMode ?? resolveTradeFeedMode();
    this.windowMs = config.windowMs ?? 3000;
    this.graceMs = config.graceMs ?? 6000;
    this.logWindows = config.logWindows ?? true;

    this.aggregator = new TradeWindowAggregator({
      windowMs: this.windowMs,
      graceMs: this.graceMs,
      feedMode: this.feedMode,
      getCurrentSource: () => this.activeSource,
      getIntegritySnapshot: () => this.getIntegritySnapshot(),
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
    this.resetIntegrityAndSessionStats();
    this.aggregator.start();

    if (this.feedMode === 'mock') {
      this.startFeed(new MockTradeFeed(this.preset.mock));
      return;
    }

    this.startFeed(new BinanceTradeFeed({ symbol: this.preset.binanceSymbol }));

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

  private resetIntegrityAndSessionStats() {
    this.deduper.reset();
    this.dedupDroppedTotal = 0;
    this.backfillTradesIngestedTotal = 0;
    this.lastBackfillActivityAt = 0;
    this.sessionMaxBuyNotional = 0;
    this.sessionMaxBuyNotionalWindowStart = 0;
    this.sessionMaxBuyNotionalSequence = 0;
    this.sessionMaxInitialized = false;
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
    if (trade.source === 'binance' && trade.transport === 'ws' && !this.liveTradeSeen) {
      this.liveTradeSeen = true;
      this.clearFallbackTimer();
      console.info(`[${this.preset.title}] live trade stream active (Binance ${this.preset.binanceSymbol}).`);
    }

    if (trade.transport === 'rest') {
      this.lastBackfillActivityAt = Date.now();
    }

    if (this.shouldDropDuplicateTrade(trade)) {
      this.dedupDroppedTotal += 1;
      this.aggregator.recordDedupDrop(trade);
      return;
    }

    if (trade.transport === 'rest') {
      this.backfillTradesIngestedTotal += 1;
    }

    this.activeSource = trade.source;
    this.aggregator.ingest(trade);
  }

  private shouldDropDuplicateTrade(trade: NormalizedTrade) {
    if (trade.source !== 'binance') {
      return false;
    }

    const nowMs = Date.now();
    const idKey = `binance:${trade.idKind}:${trade.id}`;
    if (this.deduper.hasOrRemember(idKey, nowMs)) {
      return true;
    }

    if (
      trade.idKind === 'aggTrade' &&
      typeof trade.rawTradeIdStart === 'number' &&
      typeof trade.rawTradeIdEnd === 'number' &&
      trade.rawTradeIdEnd >= trade.rawTradeIdStart
    ) {
      let fullyCoveredByRecentRawTrades = true;
      for (let rawId = trade.rawTradeIdStart; rawId <= trade.rawTradeIdEnd; rawId += 1) {
        if (!this.deduper.has(`binance:trade:${rawId}`, nowMs)) {
          fullyCoveredByRecentRawTrades = false;
          break;
        }
      }

      if (fullyCoveredByRecentRawTrades) {
        return true;
      }
    }

    return false;
  }

  private handleFeedStatus(event: FeedStatusEvent) {
    if (event.state === 'stopped') {
      return;
    }

    if (event.channel === 'rest' || event.backfillPhase) {
      this.lastBackfillActivityAt = Date.now();
    }

    const details = [
      `symbol=${this.preset.binanceSymbol}`,
      `source=${event.source}`,
      `state=${event.state}`,
      event.channel ? `channel=${event.channel}` : '',
      event.attempt !== undefined ? `attempt=${event.attempt}` : '',
      event.delayMs !== undefined ? `delay=${event.delayMs}ms` : '',
      event.code !== undefined ? `code=${event.code}` : '',
      event.backfillPhase ? `backfill=${event.backfillPhase}` : '',
      event.backfillTradesDelta !== undefined ? `bfDelta=${event.backfillTradesDelta}` : '',
      event.backfillTradesTotal !== undefined ? `bfTotal=${event.backfillTradesTotal}` : '',
      event.reason ? `reason=${event.reason}` : '',
      event.message ? `msg=${event.message}` : ''
    ]
      .filter(Boolean)
      .join(' ');

    console.info(`[${this.preset.title}][feed] ${details}`);

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
    console.warn(`[${this.preset.title}] switching to mock trade feed (${reason}).`);
    this.startFeed(new MockTradeFeed(this.preset.mock));
  }

  private handleBlockEvent(event: BlockEvent) {
    this.attachSessionMax(event);

    if (this.logWindows) {
      this.logBlockEvent(event);
    }

    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private attachSessionMax(event: BlockEvent) {
    const currentBuyNotional = Math.max(0, event.metrics.buyNotionalQuote || 0);
    if (!this.sessionMaxInitialized) {
      this.sessionMaxInitialized = true;
      this.sessionMaxBuyNotional = currentBuyNotional;
      this.sessionMaxBuyNotionalWindowStart = event.windowStart;
      this.sessionMaxBuyNotionalSequence = event.sequence;
    } else if (currentBuyNotional > this.sessionMaxBuyNotional) {
      this.sessionMaxBuyNotional = currentBuyNotional;
      this.sessionMaxBuyNotionalWindowStart = event.windowStart;
      this.sessionMaxBuyNotionalSequence = event.sequence;
    }

    event.metrics.sessionMaxBuyNotional = this.sessionMaxBuyNotional;
    event.metrics.sessionMaxBuyNotionalWindowStart = this.sessionMaxBuyNotionalWindowStart;
    event.metrics.sessionMaxBuyNotionalSequence = this.sessionMaxBuyNotionalSequence;
  }

  private getIntegritySnapshot(): Omit<
    BlockEventIntegrityMetrics,
    'dedupDroppedWindow' | 'lateTradesBufferedWindow'
  > {
    const backfillUsedRecently =
      this.lastBackfillActivityAt > 0 && Date.now() - this.lastBackfillActivityAt <= this.backfillRecentWindowMs;

    return {
      dedupDroppedTotal: this.dedupDroppedTotal,
      backfillUsedRecently,
      backfillTradesIngested: this.backfillTradesIngestedTotal,
      feed:
        this.activeSource === 'mock'
          ? 'mock'
          : this.backfillTradesIngestedTotal > 0
            ? 'live-ws+rest'
            : 'live-ws'
    };
  }

  private logBlockEvent(event: BlockEvent) {
    const metrics = event.metrics;
    const imbalancePct = metrics.imbalance * 100;
    const intensityPct = clamp(metrics.intensity * 100, 0, 100);
    console.log(
      `[${this.preset.title}][${formatTimestamp(event.windowEnd)}] ${event.source}/${event.feedMode} ` +
        `n=${metrics.tradeCount} buyN=${metrics.buyTradeCount} v=${metrics.totalVolume.toFixed(4)} ` +
        `buyV=${metrics.buyBaseQty.toFixed(4)} buyQ=${metrics.buyNotionalQuote.toFixed(2)} ` +
        `maxBuyQ=${metrics.sessionMaxBuyNotional.toFixed(2)} ` +
        `dup=${metrics.integrity.dedupDroppedWindow}/${metrics.integrity.dedupDroppedTotal} ` +
        `late=${metrics.integrity.lateTradesBufferedWindow} ` +
        `bf=${metrics.integrity.backfillTradesIngested}${metrics.integrity.backfillUsedRecently ? '*' : ''} ` +
        `imb=${formatSigned(imbalancePct, 1)}% avg=${metrics.averageTradeSize.toFixed(5)} ` +
        `dp=${formatSigned(metrics.priceChange, 2)} vol=${metrics.volatility.toFixed(2)} I=${intensityPct.toFixed(0)}`
    );
  }
}
