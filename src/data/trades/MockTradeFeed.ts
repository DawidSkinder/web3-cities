import type { FeedHandlers, NormalizedTrade, TradeFeed } from './types';
import type { CryptoCityMockProfile } from '../cryptoCity/presets';

type MockRegime = 'calm' | 'balanced' | 'burst';

type RegimeConfig = {
  minIntervalMs: number;
  maxIntervalMs: number;
  volatilityBps: number;
  maxJumpBps: number;
  quantityScale: number;
};

const REGIME_CONFIG: Record<MockRegime, RegimeConfig> = {
  calm: {
    minIntervalMs: 120,
    maxIntervalMs: 420,
    volatilityBps: 0.35,
    maxJumpBps: 1.2,
    quantityScale: 0.5
  },
  balanced: {
    minIntervalMs: 40,
    maxIntervalMs: 180,
    volatilityBps: 0.7,
    maxJumpBps: 2.8,
    quantityScale: 1
  },
  burst: {
    minIntervalMs: 12,
    maxIntervalMs: 65,
    volatilityBps: 1.4,
    maxJumpBps: 6,
    quantityScale: 1.8
  }
};

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function gaussianRandom() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class MockTradeFeed implements TradeFeed {
  readonly source = 'mock' as const;
  private readonly profile: CryptoCityMockProfile;

  private handlers: FeedHandlers | null = null;
  private running = false;
  private timer: number | null = null;
  private price = 0;
  private driftBias = 0;
  private regime: MockRegime = 'balanced';
  private regimeUntil = 0;
  private tradeId = 0;

  constructor(profile: CryptoCityMockProfile) {
    this.profile = profile;
    this.price = profile.initialPrice * (0.96 + Math.random() * 0.08);
  }

  start(handlers: FeedHandlers) {
    this.stop();
    this.handlers = handlers;
    this.running = true;
    this.regimeUntil = 0;
    this.tradeId = 0;
    this.price = this.profile.initialPrice * (0.96 + Math.random() * 0.08);

    this.handlers.onStatus?.({
      source: this.source,
      state: 'mock-running',
      timestamp: Date.now(),
      message: 'mock feed started'
    });

    this.scheduleNextTrade(0);
  }

  stop() {
    this.running = false;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNextTrade(delayMs: number) {
    if (!this.running) {
      return;
    }

    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.emitMockTrade();
      this.scheduleNextTrade(this.nextInterval());
    }, delayMs);
  }

  private nextInterval() {
    this.rotateRegimeIfNeeded();
    const cfg = REGIME_CONFIG[this.regime];
    return Math.floor(randomBetween(cfg.minIntervalMs, cfg.maxIntervalMs));
  }

  private rotateRegimeIfNeeded() {
    const now = Date.now();
    if (now < this.regimeUntil) {
      return;
    }

    const roll = Math.random();
    if (roll < 0.18) {
      this.regime = 'calm';
      this.regimeUntil = now + randomBetween(7000, 18000);
    } else if (roll < 0.82) {
      this.regime = 'balanced';
      this.regimeUntil = now + randomBetween(9000, 22000);
    } else {
      this.regime = 'burst';
      this.regimeUntil = now + randomBetween(4000, 10000);
    }

    this.driftBias = this.driftBias * 0.5 + gaussianRandom() * 0.25;
  }

  private emitMockTrade() {
    if (!this.running) {
      return;
    }

    const cfg = REGIME_CONFIG[this.regime];
    const noiseBps = gaussianRandom() * cfg.volatilityBps;
    const jumpChance = Math.random();
    const jumpBps =
      jumpChance > 0.985 ? gaussianRandom() * cfg.maxJumpBps : 0;

    this.driftBias = this.driftBias * 0.985 + gaussianRandom() * 0.03;
    const deltaBps = noiseBps + jumpBps + this.driftBias * 0.2;
    this.price = Math.max(this.profile.minPrice, this.price * (1 + deltaBps / 10000));

    const sideScore = deltaBps + gaussianRandom() * cfg.volatilityBps * 0.35;
    const aggressorSide = sideScore >= 0 ? 'buy' : 'sell';
    const isBuyerMaker = aggressorSide === 'sell';

    const baseQty =
      this.profile.baseQtyMin +
      Math.pow(Math.random(), 2.2) * this.profile.baseQtyMax * cfg.quantityScale;
    const blockPrint = Math.random() > 0.992 ? randomBetween(this.profile.blockPrintMin, this.profile.blockPrintMax) : 0;
    const quantity = Math.max(0.0001, baseQty + blockPrint);

    const trade: NormalizedTrade = {
      id: ++this.tradeId,
      idKind: 'mock',
      timestamp: Date.now(),
      price: Number(this.price.toFixed(this.profile.pricePrecision)),
      quantity: Number(quantity.toFixed(this.profile.quantityPrecision)),
      isBuyerMaker,
      aggressorSide,
      side: aggressorSide,
      source: 'mock',
      transport: 'mock'
    };

    this.handlers?.onTrade(trade);
  }
}
