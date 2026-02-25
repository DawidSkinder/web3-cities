export type TradeSide = 'buy' | 'sell';
export type TradeSource = 'binance' | 'mock';
export type TradeFeedMode = 'live' | 'mock' | 'auto';

export interface NormalizedTrade {
  timestamp: number;
  price: number;
  quantity: number;
  side: TradeSide;
  source: TradeSource;
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

