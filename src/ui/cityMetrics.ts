import type { CryptoCityPreset } from '../data/cryptoCity/presets';
import type { TopCoinsSnapshot } from '../data/topCoins/types';
import type { BlockEvent } from '../data/trades/types';

export type MetricTone = 'default' | 'positive' | 'negative' | 'accent';

export type UiMetric = {
  label: string;
  value: string;
  tone?: MetricTone;
};

export type UiMetricPanel = {
  title: string;
  microcopy: string;
  metrics: UiMetric[];
};

type CryptoTowerLike = {
  usdNotional: number;
  baseVolume: number;
};

const compactNumber = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2
});

function clampPercent(value: number) {
  return Math.min(999, Math.max(0, value));
}

function formatUsdCompact(value: number) {
  const abs = Math.abs(value);
  if (!Number.isFinite(value) || abs < 0.005) return '$0';
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(abs >= 100 ? 0 : 2)}`;
}

function formatSignedPercent(value: number) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

function formatCryptoBaseAmount(value: number, ticker: string) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.00000001) return `0 ${ticker}`;
  const abs = Math.abs(value);
  if (abs >= 10_000) return `${compactNumber.format(value)} ${ticker}`;
  const decimals = abs >= 100 ? 2 : abs >= 10 ? 2 : abs >= 1 ? 3 : 4;
  return `${value.toFixed(decimals)} ${ticker}`;
}

function sumBuyNotional(events: BlockEvent[], rangeStartMs: number, rangeEndMs: number) {
  let total = 0;
  for (const event of events) {
    const bucketTime = Number.isFinite(event.windowEnd) ? event.windowEnd : event.emittedAt;
    if (bucketTime >= rangeStartMs && bucketTime < rangeEndMs) {
      total += Math.max(0, event.metrics.buyNotionalQuote || 0);
    }
  }
  return total;
}

export function deriveCryptoCityMetrics({
  towers,
  events,
  preset,
  nowMs = Date.now()
}: {
  towers: CryptoTowerLike[];
  events: BlockEvent[];
  preset: CryptoCityPreset;
  nowMs?: number;
}): UiMetricPanel {
  const cityValue = towers.reduce((sum, tower) => sum + Math.max(0, tower.usdNotional || 0), 0);
  const largestBuyTower =
    towers.reduce<CryptoTowerLike | null>((largest, tower) => {
      if (!largest) return tower;
      return tower.usdNotional > largest.usdNotional ? tower : largest;
    }, null) ?? null;

  // Use event window boundaries instead of tower birth timestamps so the 1m flow reflects
  // market-time activity, not the scene's paced tower reveal timing.
  const currentWindowStart = nowMs - 60_000;
  const previousWindowStart = nowMs - 120_000;
  const currentFlow = sumBuyNotional(events, currentWindowStart, nowMs + 1);
  const previousFlow = sumBuyNotional(events, previousWindowStart, currentWindowStart);
  const delta = currentFlow - previousFlow;
  const baseline = Math.max(previousFlow, 1);
  const nearZeroDelta = Math.abs(delta) <= Math.max(25_000, baseline * 0.03);

  let flowTrend = 'Flat';
  let flowTrendTone: MetricTone = 'default';
  if (!nearZeroDelta) {
    const pct = clampPercent((Math.abs(delta) / baseline) * 100);
    if (delta > 0) {
      flowTrend = `Up ${pct.toFixed(0)}%`;
      flowTrendTone = 'positive';
    } else {
      flowTrend = `Down ${pct.toFixed(0)}%`;
      flowTrendTone = 'negative';
    }
  }

  return {
    title: preset.metricTitle,
    microcopy: preset.metricMicrocopy,
    metrics: [
      {
        label: 'City Value',
        value: `${formatUsdCompact(cityValue)} represented`,
        tone: 'accent'
      },
      {
        label: 'Largest Block',
        value: largestBuyTower
          ? `${formatUsdCompact(largestBuyTower.usdNotional)} · ${formatCryptoBaseAmount(
              largestBuyTower.baseVolume,
              preset.assetTicker
            )}`
          : `$0 · 0 ${preset.assetTicker}`
      },
      {
        label: 'Buy Flow (1m)',
        value: `${formatUsdCompact(currentFlow)} incoming`
      },
      {
        label: 'Flow Trend',
        value: flowTrend,
        tone: flowTrendTone
      }
    ]
  };
}

export function deriveBtcCityMetrics({
  towers,
  events,
  preset,
  nowMs = Date.now()
}: {
  towers: Array<{ usdNotional: number; btcVolume: number }>;
  events: BlockEvent[];
  preset: CryptoCityPreset;
  nowMs?: number;
}) {
  return deriveCryptoCityMetrics({
    towers: towers.map((tower) => ({
      usdNotional: tower.usdNotional,
      baseVolume: tower.btcVolume
    })),
    events,
    preset,
    nowMs
  });
}

export function deriveMarketCityMetrics(snapshot: TopCoinsSnapshot | null): UiMetricPanel {
  if (!snapshot || snapshot.items.length === 0) {
    return {
      title: 'Market City Data',
      microcopy: 'Waiting for the latest top-traded market snapshot to populate the skyline.',
      metrics: [
        { label: 'Top Gainer', value: 'Loading live data' },
        { label: 'Top Loser', value: 'Loading live data' },
        { label: 'Top Volume', value: 'Loading live data' },
        { label: 'Market Breadth', value: 'Loading live data' }
      ]
    };
  }

  let topGainer = snapshot.items[0]!;
  let topLoser = snapshot.items[0]!;
  let topVolume = snapshot.items[0]!;
  let positive = 0;
  let negative = 0;

  for (const item of snapshot.items) {
    if (item.priceChangePercent > topGainer.priceChangePercent) topGainer = item;
    if (item.priceChangePercent < topLoser.priceChangePercent) topLoser = item;
    if (item.quoteVolume > topVolume.quoteVolume) topVolume = item;

    // Neutral movers are omitted from the public breadth readout to keep the panel concise.
    if (item.priceChangePercent > 0) positive += 1;
    if (item.priceChangePercent < 0) negative += 1;
  }

  return {
    title: 'Market City Data',
    microcopy: 'A live read on winners, laggards, liquidity, and directional breadth across the current universe.',
    metrics: [
      {
        label: 'Top Gainer',
        value: `${topGainer.symbol} ${formatSignedPercent(topGainer.priceChangePercent)}`,
        tone: 'positive'
      },
      {
        label: 'Top Loser',
        value: `${topLoser.symbol} ${formatSignedPercent(topLoser.priceChangePercent)}`,
        tone: 'negative'
      },
      {
        label: 'Top Volume',
        value: `${topVolume.symbol} ${formatUsdCompact(topVolume.quoteVolume)}`,
        tone: 'accent'
      },
      {
        label: 'Market Breadth',
        value: `${positive} up · ${negative} down`
      }
    ]
  };
}
