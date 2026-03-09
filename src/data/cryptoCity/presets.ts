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
  engine: {
    windowMs: number;
    graceMs: number;
  };
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
    engine: {
      windowMs: 3000,
      graceMs: 0
    },
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
    engine: {
      windowMs: 3000,
      graceMs: 0
    },
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
    engine: {
      windowMs: 3000,
      graceMs: 0
    },
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
      mountainFarCore: '#1e6258',
      mountainFarShoulder: '#184d46',
      mountainFarFoothill: '#133d37',
      mountainMidCore: '#2d877a',
      mountainMidShoulder: '#236b61',
      mountainMidFoothill: '#1b564e',
      mountainPeakCore: '#45b4a1',
      mountainPeakShoulder: '#339182',
      mountainPeakFoothill: '#257067',
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
  },
  bnb: {
    mode: 'bnb',
    title: 'BNB City',
    selectorLabel: 'BNB City',
    description:
      'A bright, high-signal city generated from live BNB spot buy activity, where yellow energy maps demand into a sharply lit skyline.',
    metricTitle: 'BNB City Data',
    metricMicrocopy: 'Live BNB spot demand expressed as a luminous city accumulating in real time.',
    assetTicker: 'BNB',
    assetName: 'BNB',
    binanceSymbol: 'BNBUSDT',
    logoPath: '/data/logos/BNBUSDT.png',
    engine: {
      windowMs: 3000,
      graceMs: 0
    },
    theme: {
      primary: '#f3d01b',
      primaryHover: '#ffe96d',
      warm: '#fff9d7',
      pale: '#ffe47a',
      tracePrimary: '#f3d01b',
      traceWarm: '#fffdf0',
      tracePale: '#ffe066',
      groundGlowCenter: '#4f4208',
      groundGlowCenterHot: '#f3d01b',
      groundGlowRing: '#8a6a00',
      groundGlowRingHot: '#ffd83b',
      groundGridMajor: '#dbc24d',
      groundGridMinor: '#857135',
      groundWindDiag: '#fff0aa',
      groundWindAxisPrimary: '#ffe98f',
      groundWindAxisSecondary: '#f3d01b',
      groundWindCross: '#fff8d4',
      groundArteryPrimary: '#f3d01b',
      groundArterySecondary: '#f6edaf',
      groundArteryTertiary: '#ffe45f',
      shockwavePositive: '#ffe05c',
      shockwaveNegative: '#caa231',
      districtBase: '#fff1b1',
      districtAccent: '#ffd84a',
      hudAccentRgb: '243,208,27',
      labelTextPrimary: '#fffdf2',
      labelTextSecondary: '#fff0b9',
      labelTextMuted: '#f4e6aa',
      mountainFarCore: '#6e5108',
      mountainFarShoulder: '#5a4207',
      mountainFarFoothill: '#493605',
      mountainMidCore: '#9b730e',
      mountainMidShoulder: '#7e5e0c',
      mountainMidFoothill: '#654b09',
      mountainPeakCore: '#d3a61c',
      mountainPeakShoulder: '#b48814',
      mountainPeakFoothill: '#89680f',
      treeGlowLow: '#fff1a4',
      treeGlowHigh: '#f3d01b',
      beaconOuter: '#f3d01b',
      beaconInner: '#fff6c8'
    },
    mock: {
      initialPrice: 620,
      minPrice: 100,
      baseQtyMin: 0.02,
      baseQtyMax: 3.2,
      blockPrintMin: 5,
      blockPrintMax: 22,
      quantityPrecision: 3,
      pricePrecision: 2
    }
  },
  xrp: {
    mode: 'xrp',
    title: 'XRP City',
    selectorLabel: 'XRP City',
    description:
      'A minimal, high-contrast city generated from live XRP spot buy activity, where neutral whites and graphite tones reflect flow with precision.',
    metricTitle: 'XRP City Data',
    metricMicrocopy: 'Live XRP spot demand rendered as a clean monochrome city that builds in real time.',
    assetTicker: 'XRP',
    assetName: 'XRP',
    binanceSymbol: 'XRPUSDT',
    logoPath: '/data/logos/XRPUSDT.png',
    engine: {
      windowMs: 3000,
      graceMs: 0
    },
    theme: {
      primary: '#f4f6fb',
      primaryHover: '#ffffff',
      warm: '#f6f7fb',
      pale: '#d7dbe5',
      tracePrimary: '#f2f5fb',
      traceWarm: '#ffffff',
      tracePale: '#dfe3ec',
      groundGlowCenter: '#4a4f5c',
      groundGlowCenterHot: '#d9dde8',
      groundGlowRing: '#7e8596',
      groundGlowRingHot: '#f4f6fb',
      groundGridMajor: '#b7bdcb',
      groundGridMinor: '#6e7587',
      groundWindDiag: '#daddE5',
      groundWindAxisPrimary: '#e9edf5',
      groundWindAxisSecondary: '#f4f6fb',
      groundWindCross: '#ffffff',
      groundArteryPrimary: '#f4f6fb',
      groundArterySecondary: '#d7dce7',
      groundArteryTertiary: '#aeb6c6',
      shockwavePositive: '#ffffff',
      shockwaveNegative: '#c2c7d3',
      districtBase: '#edf1f7',
      districtAccent: '#c9cfdc',
      hudAccentRgb: '244,246,251',
      labelTextPrimary: '#ffffff',
      labelTextSecondary: '#e6eaf2',
      labelTextMuted: '#cfd5e1',
      mountainFarCore: '#4f5667',
      mountainFarShoulder: '#404755',
      mountainFarFoothill: '#323947',
      mountainMidCore: '#6c7487',
      mountainMidShoulder: '#586071',
      mountainMidFoothill: '#474e5e',
      mountainPeakCore: '#959fb6',
      mountainPeakShoulder: '#788197',
      mountainPeakFoothill: '#5f677a',
      treeGlowLow: '#f3f5fa',
      treeGlowHigh: '#d7dbe5',
      beaconOuter: '#f4f6fb',
      beaconInner: '#ffffff'
    },
    mock: {
      initialPrice: 2.4,
      minPrice: 0.1,
      baseQtyMin: 25,
      baseQtyMax: 1800,
      blockPrintMin: 2500,
      blockPrintMax: 14000,
      quantityPrecision: 2,
      pricePrecision: 4
    }
  },
  lunc: {
    mode: 'lunc',
    title: 'LUNC City',
    selectorLabel: 'LUNC City',
    description:
      'A vivid blue city generated from live Terra Classic spot buy activity, where brighter electric tones separate it clearly from ETH while preserving a fast, technical feel.',
    metricTitle: 'LUNC City Data',
    metricMicrocopy: 'Live Terra Classic spot demand translated into a bright blue city growing tick by tick.',
    assetTicker: 'LUNC',
    assetName: 'Terra Classic',
    binanceSymbol: 'LUNCUSDT',
    logoPath: '/data/logos/LUNCUSDT.svg?v=2',
    engine: {
      windowMs: 12000,
      graceMs: 1500
    },
    theme: {
      primary: '#37a3ff',
      primaryHover: '#86cbff',
      warm: '#eef7ff',
      pale: '#8ec8ff',
      tracePrimary: '#37a3ff',
      traceWarm: '#f4f9ff',
      tracePale: '#67b8ff',
      groundGlowCenter: '#0b3f72',
      groundGlowCenterHot: '#3db2ff',
      groundGlowRing: '#133a9a',
      groundGlowRingHot: '#67b8ff',
      groundGridMajor: '#75bfff',
      groundGridMinor: '#466fb3',
      groundWindDiag: '#b9e1ff',
      groundWindAxisPrimary: '#98d3ff',
      groundWindAxisSecondary: '#37a3ff',
      groundWindCross: '#eef8ff',
      groundArteryPrimary: '#37a3ff',
      groundArterySecondary: '#b0dfff',
      groundArteryTertiary: '#6cc4ff',
      shockwavePositive: '#5cc0ff',
      shockwaveNegative: '#4d74e8',
      districtBase: '#d9efff',
      districtAccent: '#78c4ff',
      hudAccentRgb: '55,163,255',
      labelTextPrimary: '#f7fbff',
      labelTextSecondary: '#d7ebff',
      labelTextMuted: '#cae1f7',
      mountainFarCore: '#224f8b',
      mountainFarShoulder: '#1a3f6f',
      mountainFarFoothill: '#14325a',
      mountainMidCore: '#2f6bb9',
      mountainMidShoulder: '#245694',
      mountainMidFoothill: '#1b4476',
      mountainPeakCore: '#4793ee',
      mountainPeakShoulder: '#3678cb',
      mountainPeakFoothill: '#275ca0',
      treeGlowLow: '#a9d8ff',
      treeGlowHigh: '#37a3ff',
      beaconOuter: '#37a3ff',
      beaconInner: '#dff2ff'
    },
    mock: {
      initialPrice: 0.00015,
      minPrice: 0.00001,
      baseQtyMin: 50000,
      baseQtyMax: 2000000,
      blockPrintMin: 4000000,
      blockPrintMax: 18000000,
      quantityPrecision: 0,
      pricePrecision: 6
    }
  }
};

export function getCryptoCityPreset(mode: CryptoCityMode): CryptoCityPreset {
  return CRYPTO_CITY_PRESETS[mode];
}
