export type TradeSide = 'buy' | 'sell';
export type TradeSource = 'binance' | 'mock';
export type TradeFeedMode = 'live' | 'mock' | 'auto';
export type TradeTransport = 'ws' | 'rest' | 'mock';
export type TradeIdKind = 'trade' | 'aggTrade' | 'mock';

export interface NormalizedTrade {
  id: number;
  idKind: TradeIdKind;
  timestamp: number;
  price: number;
  quantity: number;
  isBuyerMaker: boolean;
  aggressorSide: TradeSide;
  // Backward-compatible alias used by existing aggregation code.
  side: TradeSide;
  source: TradeSource;
  transport: TradeTransport;
  rawTradeIdStart?: number;
  rawTradeIdEnd?: number;
}

export type FeedState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'stopped'
  | 'mock-running';

export interface FeedStatusEvent {
  source: TradeSource;
  state: FeedState;
  timestamp: number;
  attempt?: number;
  delayMs?: number;
  code?: number;
  reason?: string;
  message?: string;
  channel?: 'ws' | 'rest' | 'mock';
  backfillPhase?: 'started' | 'completed' | 'failed';
  backfillTradesDelta?: number;
  backfillTradesTotal?: number;
  backfillUsedFromId?: boolean;
}

export interface FeedHandlers {
  onTrade: (trade: NormalizedTrade) => void;
  onStatus?: (event: FeedStatusEvent) => void;
}

export interface TradeFeed {
  readonly source: TradeSource;
  start(handlers: FeedHandlers): void;
  stop(): void;
}

export interface BlockEventMetrics {
  totalVolume: number;
  buyVolume: number;
  sellVolume: number;
  buyBaseQty: number;
  buyNotionalQuote: number;
  buyTradeCount: number;
  buyVwapPrice: number;
  imbalance: number;
  tradeCount: number;
  averageTradeSize: number;
  openPrice: number;
  closePrice: number;
  priceChange: number;
  priceChangePct: number;
  priceVariance: number;
  volatility: number;
  averagePrice: number;
  intensity: number;
  sessionMaxBuyNotional: number;
  sessionMaxBuyNotionalWindowStart: number;
  sessionMaxBuyNotionalSequence: number;
  integrity: BlockEventIntegrityMetrics;
}

export interface BlockEventIntegrityMetrics {
  dedupDroppedTotal: number;
  dedupDroppedWindow: number;
  backfillUsedRecently: boolean;
  backfillTradesIngested: number;
  lateTradesBufferedWindow: number;
  feed: 'live-ws' | 'live-ws+rest' | 'mock';
}

export interface BlockEvent {
  kind: 'city-block-event';
  sequence: number;
  emittedAt: number;
  windowStart: number;
  windowEnd: number;
  windowMs: number;
  source: TradeSource;
  feedMode: TradeFeedMode;
  hasTrades: boolean;
  metrics: BlockEventMetrics;
}
