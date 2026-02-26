import { RollingIntensityNormalizer } from './RollingIntensityNormalizer';
import type {
  BlockEvent,
  BlockEventIntegrityMetrics,
  NormalizedTrade,
  TradeFeedMode,
  TradeSource
} from './types';

type Bucket = {
  tradeCount: number;
  totalVolume: number;
  buyVolume: number;
  sellVolume: number;
  buyTradeCount: number;
  buyNotionalQuote: number;
  totalNotional: number;
  dedupDroppedCount: number;
  lateTradesBufferedCount: number;
  firstTradeTs: number;
  lastTradeTs: number;
  openPrice: number;
  closePrice: number;
  meanPrice: number;
  m2Price: number;
};

type AggregatorIntegritySnapshot = Omit<
  BlockEventIntegrityMetrics,
  'dedupDroppedWindow' | 'lateTradesBufferedWindow'
>;

type AggregatorConfig = {
  windowMs?: number;
  graceMs?: number;
  feedMode: TradeFeedMode;
  getCurrentSource: () => TradeSource;
  getIntegritySnapshot: () => AggregatorIntegritySnapshot;
  onBlockEvent: (event: BlockEvent) => void;
};

export class TradeWindowAggregator {
  private readonly windowMs: number;
  private readonly graceMs: number;
  private readonly feedMode: TradeFeedMode;
  private readonly getCurrentSource: () => TradeSource;
  private readonly getIntegritySnapshot: () => AggregatorIntegritySnapshot;
  private readonly onBlockEvent: (event: BlockEvent) => void;
  private readonly buckets = new Map<number, Bucket>();
  private readonly intensityNormalizer = new RollingIntensityNormalizer(120);

  private tickTimer: number | null = null;
  private running = false;
  private nextEmitWindowStart = 0;
  private sequence = 0;
  private lastClosePrice = 0;
  private maxSeenTradeTimestampMs = Number.NEGATIVE_INFINITY;
  private latestSeenWindowStart = Number.NEGATIVE_INFINITY;
  private hasFirstTrade = false;

  constructor(config: AggregatorConfig) {
    this.windowMs = config.windowMs ?? 3000;
    this.graceMs = config.graceMs ?? 6000;
    this.feedMode = config.feedMode;
    this.getCurrentSource = config.getCurrentSource;
    this.getIntegritySnapshot = config.getIntegritySnapshot;
    this.onBlockEvent = config.onBlockEvent;
  }

  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    this.buckets.clear();
    this.intensityNormalizer.reset();
    this.nextEmitWindowStart = 0;
    this.sequence = 0;
    this.lastClosePrice = 0;
    this.maxSeenTradeTimestampMs = Number.NEGATIVE_INFINITY;
    this.latestSeenWindowStart = Number.NEGATIVE_INFINITY;
    this.hasFirstTrade = false;
    this.scheduleNextTick();
  }

  stop() {
    this.running = false;
    if (this.tickTimer !== null) {
      window.clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
    this.buckets.clear();
  }

  ingest(trade: NormalizedTrade) {
    if (!this.running) {
      return;
    }

    if (!Number.isFinite(trade.timestamp) || !Number.isFinite(trade.price) || !Number.isFinite(trade.quantity)) {
      return;
    }
    if (trade.price <= 0 || trade.quantity <= 0) {
      return;
    }

    const windowStart = Math.floor(trade.timestamp / this.windowMs) * this.windowMs;
    if (!this.hasFirstTrade) {
      this.nextEmitWindowStart = windowStart;
      this.hasFirstTrade = true;
    }
    if (windowStart < this.nextEmitWindowStart - this.windowMs * 2) {
      return;
    }

    const priorLatestWindowStart = this.latestSeenWindowStart;
    const isBufferedLateTrade =
      Number.isFinite(priorLatestWindowStart) &&
      windowStart < priorLatestWindowStart &&
      windowStart >= this.nextEmitWindowStart;

    let bucket = this.buckets.get(windowStart);
    if (!bucket) {
      bucket = {
        tradeCount: 0,
        totalVolume: 0,
        buyVolume: 0,
        sellVolume: 0,
        buyTradeCount: 0,
        buyNotionalQuote: 0,
        totalNotional: 0,
        dedupDroppedCount: 0,
        lateTradesBufferedCount: 0,
        firstTradeTs: Number.POSITIVE_INFINITY,
        lastTradeTs: Number.NEGATIVE_INFINITY,
        openPrice: trade.price,
        closePrice: trade.price,
        meanPrice: 0,
        m2Price: 0
      };
      this.buckets.set(windowStart, bucket);
    }

    if (isBufferedLateTrade) {
      bucket.lateTradesBufferedCount += 1;
    }

    bucket.tradeCount += 1;
    bucket.totalVolume += trade.quantity;
    bucket.totalNotional += trade.price * trade.quantity;

    if (trade.aggressorSide === 'buy') {
      bucket.buyVolume += trade.quantity;
      bucket.buyTradeCount += 1;
      bucket.buyNotionalQuote += trade.price * trade.quantity;
    } else {
      bucket.sellVolume += trade.quantity;
    }

    if (trade.timestamp <= bucket.firstTradeTs) {
      bucket.firstTradeTs = trade.timestamp;
      bucket.openPrice = trade.price;
    }
    if (trade.timestamp >= bucket.lastTradeTs) {
      bucket.lastTradeTs = trade.timestamp;
      bucket.closePrice = trade.price;
    }

    const delta = trade.price - bucket.meanPrice;
    bucket.meanPrice += delta / bucket.tradeCount;
    const delta2 = trade.price - bucket.meanPrice;
    bucket.m2Price += delta * delta2;

    this.maxSeenTradeTimestampMs = Math.max(this.maxSeenTradeTimestampMs, trade.timestamp);
    this.latestSeenWindowStart = Math.max(this.latestSeenWindowStart, windowStart);
    this.flushCompletedWindows();
  }

  recordDedupDrop(trade: Pick<NormalizedTrade, 'timestamp'>) {
    if (!this.running || !Number.isFinite(trade.timestamp)) {
      return;
    }
    const windowStart = Math.floor(trade.timestamp / this.windowMs) * this.windowMs;
    const bucket = this.buckets.get(windowStart);
    if (!bucket) {
      return;
    }
    bucket.dedupDroppedCount += 1;
  }

  private scheduleNextTick() {
    if (!this.running) {
      return;
    }

    this.tickTimer = window.setTimeout(() => {
      this.flushCompletedWindows();
      this.scheduleNextTick();
    }, 250);
  }

  private flushCompletedWindows() {
    if (!this.hasFirstTrade || !Number.isFinite(this.maxSeenTradeTimestampMs)) {
      return;
    }

    const watermarkTs = this.maxSeenTradeTimestampMs - this.graceMs;
    while (this.nextEmitWindowStart + this.windowMs <= watermarkTs) {
      const windowStart = this.nextEmitWindowStart;
      const windowEnd = windowStart + this.windowMs;
      const bucket = this.buckets.get(windowStart);
      this.buckets.delete(windowStart);

      const event = this.buildEvent(windowStart, windowEnd, bucket);
      this.onBlockEvent(event);
      this.nextEmitWindowStart = windowEnd;
    }

    const minActiveWindow = this.nextEmitWindowStart - this.windowMs * 3;
    for (const key of this.buckets.keys()) {
      if (key < minActiveWindow) {
        this.buckets.delete(key);
      }
    }
  }

  private buildEvent(windowStart: number, windowEnd: number, bucket?: Bucket): BlockEvent {
    const hasTrades = Boolean(bucket && bucket.tradeCount > 0);

    const totalVolume = bucket?.totalVolume ?? 0;
    const buyVolume = bucket?.buyVolume ?? 0;
    const sellVolume = bucket?.sellVolume ?? 0;
    const buyTradeCount = bucket?.buyTradeCount ?? 0;
    const buyNotionalQuote = bucket?.buyNotionalQuote ?? 0;
    const buyBaseQty = buyVolume;
    const buyVwapPrice = buyBaseQty > 0 ? buyNotionalQuote / buyBaseQty : 0;
    const tradeCount = bucket?.tradeCount ?? 0;
    const averageTradeSize = tradeCount > 0 ? totalVolume / tradeCount : 0;

    const fallbackPrice = this.lastClosePrice;
    const openPrice = hasTrades ? (bucket?.openPrice ?? fallbackPrice) : fallbackPrice;
    const closePrice = hasTrades ? (bucket?.closePrice ?? fallbackPrice) : fallbackPrice;

    if (hasTrades) {
      this.lastClosePrice = closePrice;
    }

    const priceChange = hasTrades ? closePrice - openPrice : 0;
    const priceChangePct = openPrice > 0 ? priceChange / openPrice : 0;

    const priceVariance =
      bucket && bucket.tradeCount > 1 ? bucket.m2Price / bucket.tradeCount : 0;
    const volatility = Math.sqrt(priceVariance);

    const imbalance = totalVolume > 0 ? (buyVolume - sellVolume) / totalVolume : 0;
    const averagePrice =
      bucket && bucket.totalVolume > 0 ? bucket.totalNotional / bucket.totalVolume : closePrice;

    const totalNotional =
      bucket && bucket.totalNotional > 0 ? bucket.totalNotional : averagePrice * totalVolume;
    const activityRaw =
      Math.log1p(totalNotional) +
      0.35 * Math.log1p(tradeCount) +
      0.5 * Math.log1p(volatility) +
      0.15 * Math.abs(imbalance);
    const intensity = this.intensityNormalizer.normalize(activityRaw);

    const integrityBase = this.getIntegritySnapshot();

    this.sequence += 1;

    return {
      kind: 'city-block-event',
      sequence: this.sequence,
      emittedAt: Date.now(),
      windowStart,
      windowEnd,
      windowMs: this.windowMs,
      source: this.getCurrentSource(),
      feedMode: this.feedMode,
      hasTrades,
      metrics: {
        totalVolume,
        buyVolume,
        sellVolume,
        buyBaseQty,
        buyNotionalQuote,
        buyTradeCount,
        buyVwapPrice,
        imbalance,
        tradeCount,
        averageTradeSize,
        openPrice,
        closePrice,
        priceChange,
        priceChangePct,
        priceVariance,
        volatility,
        averagePrice,
        intensity,
        sessionMaxBuyNotional: 0,
        sessionMaxBuyNotionalWindowStart: windowStart,
        sessionMaxBuyNotionalSequence: this.sequence,
        integrity: {
          ...integrityBase,
          dedupDroppedWindow: bucket?.dedupDroppedCount ?? 0,
          lateTradesBufferedWindow: bucket?.lateTradesBufferedCount ?? 0
        }
      }
    };
  }
}
