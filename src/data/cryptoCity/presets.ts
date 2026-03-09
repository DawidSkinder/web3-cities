import type { CryptoCityMode } from '../../lib/cityMode';

export type CryptoCityTheme = {
  primary: string;
  primaryHover: string;
  warm: string;
  pale: string;
  tracePrimary: string;
  traceWarm: string;
  tracePale: string;
  groundGlowCenter: string;
  groundGlowCenterHot: string;
  groundGlowRing: string;
  groundGlowRingHot: string;
  groundGridMajor: string;
  groundGridMinor: string;
  groundWindDiag: string;
  groundWindAxisPrimary: string;
  groundWindAxisSecondary: string;
  groundWindCross: string;
  groundArteryPrimary: string;
  groundArterySecondary: string;
  groundArteryTertiary: string;
  shockwavePositive: string;
  shockwaveNegative: string;
  districtBase: string;
  districtAccent: string;
  hudAccentRgb: string;
  labelTextPrimary: string;
  labelTextSecondary: string;
  labelTextMuted: string;
  mountainFarCore: string;
  mountainFarShoulder: string;
  mountainFarFoothill: string;
  mountainMidCore: string;
  mountainMidShoulder: string;
  mountainMidFoothill: string;
  mountainPeakCore: string;
  mountainPeakShoulder: string;
  mountainPeakFoothill: string;
  treeGlowLow: string;
  treeGlowHigh: string;
  beaconOuter: string;
  beaconInner: string;
};

export type CryptoCityMockProfile = {
  initialPrice: number;
  minPrice: number;
  baseQtyMin: number;
  baseQtyMax: number;
  blockPrintMin: number;
  blockPrintMax: number;
  quantityPrecision: number;
  pricePrecision: number;
};

export type CryptoCityPreset = {
  mode: CryptoCityMode;
  title: string;
  selectorLabel: string;
  description: string;
  metricTitle: string;
  metricMicrocopy: string;
  assetTicker: string;
  assetName: string;
  binanceSymbol: string;
  logoPath: string;
  theme: CryptoCityTheme;
  mock: CryptoCityMockProfile;
};

export const CRYPTO_CITY_PRESETS: Record<CryptoCityMode, CryptoCityPreset> = {
  btc: {
    mode: 'btc',
    title: 'BTC City',
    selectorLabel: 'BTC City',
    description:
      'A living city generated from live Bitcoin spot buy activity, where each building reflects market demand as it happens.',
    metricTitle: 'BTC City Data',
    metricMicrocopy: 'Live Bitcoin spot demand expressed as a city accumulating in real time.',
    assetTicker: 'BTC',
    assetName: 'Bitcoin',
    binanceSymbol: 'BTCUSDT',
    logoPath: '/data/logos/BTCUSDT.png',
    theme: {
      primary: '#F7931A',
      primaryHover: '#ffb14f',
      warm: '#F5F2E9',
      pale: '#FFD8A2',
      tracePrimary: '#F7931A',
      traceWarm: '#F5F5F5',
      tracePale: '#FFD7A0',
      groundGlowCenter: '#F0D0A7',
      groundGlowCenterHot: '#FFD8A1',
      groundGlowRing: '#e1891a',
      groundGlowRingHot: '#f7931a',
      groundGridMajor: '#d2b788',
      groundGridMinor: '#bca173',
      groundWindDiag: '#d7c09a',
      groundWindAxisPrimary: '#F4D3A2',
      groundWindAxisSecondary: '#F7931A',
      groundWindCross: '#f6ead7',
      groundArteryPrimary: '#F7931A',
      groundArterySecondary: '#f4e8d6',
      groundArteryTertiary: '#ffe7c4',
      shockwavePositive: '#ffb566',
      shockwaveNegative: '#d29a62',
      districtBase: '#f4ead6',
      districtAccent: '#ffd4a0',
      hudAccentRgb: '247,147,26',
      labelTextPrimary: '#fff7ec',
      labelTextSecondary: '#f2d7b1',
      labelTextMuted: '#f4e3c8',
      mountainFarCore: '#6f4429',
      mountainFarShoulder: '#5a361f',
      mountainFarFoothill: '#40281a',
      mountainMidCore: '#815135',
      mountainMidShoulder: '#684128',
      mountainMidFoothill: '#4c301e',
      mountainPeakCore: '#98613c',
      mountainPeakShoulder: '#774b2d',
      mountainPeakFoothill: '#583822',
      treeGlowLow: '#ffd7a0',
      treeGlowHigh: '#f7931a',
      beaconOuter: '#f7931a',
      beaconInner: '#ffe5bf'
    },
    mock: {
      initialPrice: 64000,
      minPrice: 1000,
      baseQtyMin: 0.001,
      baseQtyMax: 0.09,
      blockPrintMin: 0.15,
      blockPrintMax: 0.65,
      quantityPrecision: 6,
      pricePrecision: 2
    }
  },
  eth: {
    mode: 'eth',
    title: 'ETH City',
    selectorLabel: 'ETH City',
    description:
      'A responsive city built from live Ethereum spot buy activity, with a cooler, crystalline skyline shaped by real-time demand.',
    metricTitle: 'ETH City Data',
    metricMicrocopy: 'Live Ethereum spot demand rendered as a lucid city that compounds in real time.',
    assetTicker: 'ETH',
    assetName: 'Ethereum',
    binanceSymbol: 'ETHUSDT',
    logoPath: '/data/logos/ETHUSDT.png',
    theme: {
      primary: '#8b94ff',
      primaryHover: '#b1b8ff',
      warm: '#eef3ff',
      pale: '#c7d4ff',
      tracePrimary: '#8b94ff',
      traceWarm: '#f5f7ff',
      tracePale: '#dbe4ff',
      groundGlowCenter: '#d7e0ff',
      groundGlowCenterHot: '#eef3ff',
      groundGlowRing: '#6e7df5',
      groundGlowRingHot: '#9ca6ff',
      groundGridMajor: '#b0bbec',
      groundGridMinor: '#8f9bcb',
      groundWindDiag: '#d5ddff',
      groundWindAxisPrimary: '#dbe4ff',
      groundWindAxisSecondary: '#8b94ff',
      groundWindCross: '#f1f5ff',
      groundArteryPrimary: '#8b94ff',
      groundArterySecondary: '#e7edff',
      groundArteryTertiary: '#d4dcff',
      shockwavePositive: '#aab5ff',
      shockwaveNegative: '#7f91d8',
      districtBase: '#e7edff',
      districtAccent: '#b8c6ff',
      hudAccentRgb: '139,148,255',
      labelTextPrimary: '#f7f9ff',
      labelTextSecondary: '#d6dfff',
      labelTextMuted: '#dfe6ff',
      mountainFarCore: '#2d3558',
      mountainFarShoulder: '#242b48',
      mountainFarFoothill: '#1c233c',
      mountainMidCore: '#3b4772',
      mountainMidShoulder: '#313b60',
      mountainMidFoothill: '#252d48',
      mountainPeakCore: '#556493',
      mountainPeakShoulder: '#414f79',
      mountainPeakFoothill: '#2d3657',
      treeGlowLow: '#dbe4ff',
      treeGlowHigh: '#8b94ff',
      beaconOuter: '#8b94ff',
      beaconInner: '#f0f4ff'
    },
    mock: {
      initialPrice: 3400,
      minPrice: 100,
      baseQtyMin: 0.02,
      baseQtyMax: 2.6,
      blockPrintMin: 4,
      blockPrintMax: 20,
      quantityPrecision: 4,
      pricePrecision: 2
    }
  },
  sol: {
    mode: 'sol',
    title: 'SOL City',
    selectorLabel: 'SOL City',
    description:
      'A neon city generated from live Solana spot buy activity, where mint and ultraviolet energy map directly onto market demand.',
    metricTitle: 'SOL City Data',
    metricMicrocopy: 'Live Solana spot demand translated into a fast, luminous city that grows tick by tick.',
    assetTicker: 'SOL',
    assetName: 'Solana',
    binanceSymbol: 'SOLUSDT',
    logoPath: '/data/logos/SOLUSDT.png',
    theme: {
      primary: '#14f195',
      primaryHover: '#7bffcf',
      warm: '#f0fffb',
      pale: '#86ffe3',
      tracePrimary: '#14f195',
      traceWarm: '#f2fffd',
      tracePale: '#70f7df',
      groundGlowCenter: '#0c5c4f',
      groundGlowCenterHot: '#43ffd4',
      groundGlowRing: '#281150',
      groundGlowRingHot: '#14f195',
      groundGridMajor: '#71f1d8',
      groundGridMinor: '#5e57c8',
      groundWindDiag: '#b8fff5',
      groundWindAxisPrimary: '#9bfbed',
      groundWindAxisSecondary: '#14f195',
      groundWindCross: '#effffb',
      groundArteryPrimary: '#14f195',
      groundArterySecondary: '#b189ff',
      groundArteryTertiary: '#7efbe5',
      shockwavePositive: '#4dffc0',
      shockwaveNegative: '#9f73ff',
      districtBase: '#d7fff1',
      districtAccent: '#7ee9ff',
      hudAccentRgb: '20,241,149',
      labelTextPrimary: '#f5fffd',
      labelTextSecondary: '#c8fff1',
      labelTextMuted: '#d9f7ff',
      mountainFarCore: '#0f2c28',
      mountainFarShoulder: '#0b211d',
      mountainFarFoothill: '#071713',
      mountainMidCore: '#15423b',
      mountainMidShoulder: '#10332d',
      mountainMidFoothill: '#0b2621',
      mountainPeakCore: '#1d5d53',
      mountainPeakShoulder: '#164941',
      mountainPeakFoothill: '#0f342e',
      treeGlowLow: '#a8fff0',
      treeGlowHigh: '#14f195',
      beaconOuter: '#14f195',
      beaconInner: '#d7fff4'
    },
    mock: {
      initialPrice: 145,
      minPrice: 10,
      baseQtyMin: 0.6,
      baseQtyMax: 42,
      blockPrintMin: 60,
      blockPrintMax: 250,
      quantityPrecision: 3,
      pricePrecision: 3
    }
  }
};

export function getCryptoCityPreset(mode: CryptoCityMode): CryptoCityPreset {
  return CRYPTO_CITY_PRESETS[mode];
}
