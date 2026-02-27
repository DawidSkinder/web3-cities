import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Group, InstancedMesh as ThreeInstancedMesh, Mesh, Texture } from 'three';
import {
  AdditiveBlending,
  ACESFilmicToneMapping,
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  EdgesGeometry,
  LinearFilter,
  LineBasicMaterial,
  Matrix4,
  MathUtils,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3
} from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { useTopCoinsStore } from '../data/topCoins/topCoinsStore';
import type { TopCoinsSnapshot } from '../data/topCoins/types';
import { useBlockEventStore } from '../data/trades/blockEventStore';
import type { BlockEvent } from '../data/trades/types';
import type { CityMode } from '../lib/cityMode';
import { RUNTIME_QUALITY_CONFIG } from './runtimeQuality';

type TowerArchetypeId = 0 | 1 | 2 | 3 | 4 | 5;

type TowerDatum = {
  sequence: number;
  x: number;
  z: number;
  height: number;
  archetypeId: TowerArchetypeId;
  baseW: number;
  baseD: number;
  footprintX: number;
  footprintZ: number;
  taper: number;
  podiumRatio: number;
  crownRatio: number;
  coreColor: string;
  glowColor: string;
  glowStrength: number;
  bandCount: 2 | 3 | 4;
  heightScore: number;
  isHero: boolean;
  heroMult: number;
  capGlowBoost: number;
  heroMode: 'none' | 'roll' | 'guarantee';
  intensity: number;
  imbalance: number;
  districtId: number;
  districtAccentColor: string;
  btcVolume: number;
  usdNotional: number;
  usdSource: string;
  logUsd: number;
  usdAnchorU: number;
  usdScoreDist: number;
  averagePrice: number;
  tradeCount: number;
  windowStart: number;
  windowEnd: number;
  emittedAt: number;
  mode?: CityMode;
  symbol?: string;
  baseAsset?: string;
  quoteAsset?: string;
  priceChangePercent?: number;
  quoteVolume24h?: number;
  lastPrice?: number;
  rank?: number;
  logoPath?: string | null;
  isTopGainer?: boolean;
  isTopLoser?: boolean;
  isTopVolume?: boolean;
};

type TraceDatum = {
  id: string;
  aSequence: number;
  bSequence: number;
  midX: number;
  midZ: number;
  length: number;
  yaw: number;
  y: number;
  width: number;
  glowWidth: number;
  coreColor: string;
  glowColor: string;
  isArtery?: boolean;
  scanSeed?: number;
};

type TrafficParticleDatum = {
  id: string;
  traceId: string;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  yaw: number;
  y: number;
  speed: number;
  phase: number;
  color: string;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  isArtery?: boolean;
};

type SandboxBounds = {
  radius: number;
  maxY: number;
};

type ParkDatum = {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  yaw: number;
  patchColor: string;
  edgeColor: string;
  seed: number;
  radius: number;
  fireflyCount: number;
  linkX: number | null;
  linkZ: number | null;
  emittedAt: number;
  treeStart: number;
  treeCount: number;
};

type ParkTreeDatum = {
  x: number;
  z: number;
  yaw: number;
  trunkH: number;
  crownH: number;
  crownR: number;
  tintMix: number;
};

type TowerSegmentSpec = {
  id: string;
  y: number;
  height: number;
  sx: number;
  sz: number;
  ox?: number;
  oz?: number;
  isTop: boolean;
};

type EmaStats = {
  initialized: boolean;
  meanLogUsd: number;
  varLogUsd: number;
  meanI: number;
  varI: number;
  meanAbsImb: number;
  varAbsImb: number;
};

type ShockwaveDatum = {
  serial: number;
  active: boolean;
  originX: number;
  originZ: number;
  startTimeMs: number;
  durationMs: number;
  startRadius: number;
  maxRadius: number;
  thickness: number;
  color: string;
  peakOpacity: number;
};

type DistrictDatum = {
  id: number;
  memberCount: number;
  centerX: number;
  centerZ: number;
  radiusEstimate: number;
  themeSeed: number;
  tintColor: string;
};

type RecordCeremonyDatum = {
  serial: number;
  active: boolean;
  towerSequence: number;
  x: number;
  z: number;
  towerHeight: number;
  startTimeMs: number;
  durationMs: number;
};

type HeightDebugSnapshot = {
  sequence: number;
  totalVolume: number;
  usdNotional: number;
  usdSource: string;
  logUsd: number;
  intensity: number;
  zUsd: number;
  anchorU: number;
  scoreUsdDist: number;
  scoreUsd: number;
  scoreI: number;
  score: number;
  height: number;
  isHero: boolean;
  heroMult: number;
  heroMode: 'none' | 'roll' | 'guarantee';
  baseW: number;
  baseD: number;
  meanLogUsd: number;
  stdLogUsd: number;
  meanI: number;
  stdI: number;
};

type CameraDebugSnapshot = {
  camDist: number;
  visCurve: number;
};

type HoverHudSnapshot = {
  visible: boolean;
  towerSequence: number | null;
  anchorX: number;
  anchorY: number;
  labelX: number;
  labelY: number;
};

type AccumState = {
  processedSequences: Set<number>;
  towers: TowerDatum[];
  traces: TraceDatum[];
  arterialTraces: TraceDatum[];
  trafficParticles: TrafficParticleDatum[];
  arterialTrafficParticles: TrafficParticleDatum[];
  parks: ParkDatum[];
  parkTrees: ParkTreeDatum[];
  districts: DistrictDatum[];
  shockwaves: ShockwaveDatum[];
  shockwaveCursor: number;
  shockwaveSerial: number;
  recordCeremonies: RecordCeremonyDatum[];
  recordCeremonyCursor: number;
  recordCeremonySerial: number;
  traceKeySet: Set<string>;
  arteryKeySet: Set<string>;
  lastSequence: number;
  bounds: SandboxBounds;
  ema: EmaStats;
  marketMoodTarget: number;
  marketMoodRaw: number;
  latestHeightDebug: HeightDebugSnapshot | null;
  nextParkAtCount: number;
  towersSinceHero: number;
  heroEligibleSinceLast: number;
  maxUsdSeen: number;
  maxHeightSeen: number;
  tallestTowerSequence: number | null;
  tallestTowerHeight: number;
  lastTallestCeremonySequence: number | null;
  lastTallestCeremonyHeight: number;
  parksAttempted: number;
  parksPlaced: number;
  lastParkSkipReason: string;
};

type CameraMode = 'auto' | 'user' | 'focus';

type CameraFocusTarget = {
  sequence: number;
  x: number;
  z: number;
  height: number;
};

type OrbitState = {
  angle: number;
  distance: number;
  elevation: number;
  lookY: number;
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SPIRAL_STEP = 3.55;
const MIN_HEIGHT = 4.5;
const TOWER_VISUAL_MIN_HEIGHT = 2.8;
const MAX_HEIGHT = 46;
const HERO_MAX_HEIGHT = 92;
const HEIGHT_GAMMA = 0.84;
const TOWER_FOOTPRINT = 1.1;
const BIRTH_RISE_MS = 900;
const BIRTH_GLOW_DELAY_MS = 150;
const BIRTH_GLOW_RAMP_MS = 700;
const BIRTH_OVERSHOOT = 1.18;
const GLOW_SHELL_SCALE = 1.022;
const GLOW_EDGE_SCALE = 1.034;
const GLOW_SHELL_OPACITY = 0.24;
const GLOW_EDGE_OPACITY = 0.62;
const BAND_OPACITY = 0.55;
const CROWN_OPACITY = 0.68;
const BTC_ORANGE = new Color('#F7931A');
const BTC_SELL_WARM = new Color('#F5F2E9');
const BTC_PALE_AMBER = new Color('#FFD8A2');
const CORE_GRAPHITE = new Color('#0c1016');
const CORE_GRAPHITE_HI = new Color('#171e27');
const TRACE_ORANGE = new Color('#F7931A');
const TRACE_WARM = new Color('#F5F5F5');
const TRACE_PALE = new Color('#FFD7A0');
const EMA_ALPHA_LOGUSD = 0.085;
const EMA_ALPHA_INT = 0.08;
const EMA_STD_EPS = 0.045;
const Z_USD_MIN = -3.25;
const Z_USD_MAX = 4.75;
const ZI_MIN = -2.5;
const ZI_MAX = 3.5;
const USD_SIGMOID_K = 0.95;
const USD_DIST_SCORE_GAMMA = 0.84;
const USD_ANCHOR_LOW = 10_000;
const USD_ANCHOR_HIGH = 1_000_000;
const USD_DISTRIBUTION_BLEND = 0.45;
const SCORE_WEIGHT_USD = 0.94;
const SCORE_WEIGHT_INT = 0.06;
const GEOMETRY_ANCHOR_PULL_LOW = 0.58;
const GEOMETRY_ANCHOR_PULL_HIGH = 0.14;
const GEOMETRY_ANCHOR_HEADROOM_MIN = 0.2;
const GEOMETRY_ANCHOR_HEADROOM_MAX = 0.48;
const RADIAL_GLOW_RADIUS_MULT = 1.6;
const RADIAL_GLOW_DAMP = 1.6;
const MIN_BASE = 0.95;
const MAX_BASE = 4.25;
const BASE_AREA_GAMMA = 0.6;
const ASPECT_MIN = 0.84;
const ASPECT_MAX = 1.2;
const TAPER_MAX = 0.18;
const HERO_SCORE_MIN = 0.92;
const HERO_PROB_BASE = 0.2;
const HERO_HEIGHT_MULT_MIN = 1.6;
const HERO_HEIGHT_MULT_MAX = 2.2;
const HERO_BASE_MULT_MIN = 1.25;
const HERO_BASE_MULT_MAX = 1.6;
const HERO_USD_SCALE_START = 350_000;
const HERO_USD_SCALE_FULL = 2_000_000;
const HERO_HEIGHT_SCALE_MIN = 0.2;
const HERO_BASE_SCALE_MIN = 0.25;
const HERO_USD_CAP_MIN = 64;
const HERO_GUARANTEE_GAP = 56;
const HERO_GUARANTEE_MIN_ELIGIBLE = 2;
const LANDMARK_Z_THRESHOLD = 2.6;
const LANDMARK_ANCHOR_THRESHOLD = 0.9;
const LANDMARK_MIN_USD = 120_000;
const LANDMARK_RECORD_MIN_USD = 180_000;
const HERO_MIN_USD = 250_000;
const MID_HEIGHT_ANCHOR_START = 0.14;
const MID_HEIGHT_ANCHOR_END = 0.8;
const MID_HEIGHT_SUPPRESS_MIN_MULT = 0.7;
const TOP_TAIL_BOOST_START_USD = 600_000;
const TOP_TAIL_BOOST_FULL_USD = 2_500_000;
const TOP_TAIL_HEIGHT_MULT_MAX = 1.42;
const TOP_TAIL_BASE_MULT_MAX = 1.18;
const TOP_TAIL_NORMAL_CAP_MAX = 72;
const TOP_MONO_FLOOR_START_USD = 900_000;
const TOP_MONO_FLOOR_FULL_USD = 3_500_000;
const TOP_MONO_FLOOR_MIN = 62;
const TOP_MONO_FLOOR_MAX = 90;
const TOP_MONO_CAP_START_USD = 700_000;
const TOP_MONO_CAP_FULL_USD = 3_500_000;
const TOP_MONO_CAP_MIN = 80;
const JUMBO_BASE_THRESHOLD = 4.6;
const JUMBO_RESERVE_PUSH_MAX = 4.2;
const JUMBO_CLEARANCE_PAD_MAX = 1.35;
const PLACEMENT_COLLISION_ENVELOPE_BASE = 1.12;
const PLACEMENT_COLLISION_ENVELOPE_JUMBO_EXTRA = 0.14;
const SMALL_HEIGHT_FULL_EFFECT_USD = 400;
const SMALL_HEIGHT_FADE_OUT_USD = 8_000;
const SMALL_HEIGHT_MULT_MIN = 0.34;
const SMALL_HEIGHT_CURVE = 1.15;
const VIS_NEAR_DIST = 34;
const VIS_FAR_DIST = 170;
const FOCUS_NON_HOVER_DIM = 0.22;
const FOCUS_GROUND_DIM = 0.64;
const FOCUS_TRACE_DIM = 0.22;
const FOCUS_TRAFFIC_DIM = 0.24;
const HOVER_ORANGE_BOOST = 1.22;
const HOVER_LABEL_WIDTH_PX = 220;
const HOVER_LABEL_HEIGHT_PX = 122;
const HOVER_LABEL_OFFSET_Y_PX = 28;
const HOVER_LABEL_EDGE_PAD_PX = 14;
const HOVER_LABEL_LERP = 0.22;
const HOVER_SWITCH_CONFIRM_FRAMES = 3;
const HOVER_CLEAR_GRACE_MS = 110;
const TALLEST_BADGE_SIZE_MIN = 0.9;
const TALLEST_BADGE_SIZE_MAX = 2.3;
const TALLEST_BADGE_SIZE_BASE_MULT = 0.9;
const TALLEST_BADGE_FACE_OPACITY = 0.82;
const TALLEST_BADGE_RIM_OPACITY = 0.34;
const PARK_CADENCE_BASE = 16;
const PARK_CADENCE_JITTER = 5;
const PARK_BASE_CLEARANCE = 1.2;
const DISTRICT_SIZE = 28;
const MAX_VISIBLE_DISTRICT_LOOPS = 12;
const MAX_PARKS_VISIBLE = 24;

const ENABLE_SPECTACLE_LAYER = true;
const ENABLE_MARKET_PULSE = true;
const ENABLE_SHOCKWAVES = true;
const ENABLE_ARTERIALS = true;
const ENABLE_DISTRICTS = true;
const ENABLE_PARKS_V2 = true;
const ENABLE_RECORD_CEREMONY = true;
const ENABLE_CINEMATIC_BACKDROP = true;
const ENABLE_FAKE_VIGNETTE = true;
const ENABLE_DATA_FORM_EXTRAS = true;
const ENABLE_TOWER_MICRO_BANDS = false;
const ENABLE_TOWER_TERRACES = false;
const ENABLE_PARK_HARDSCAPE_DETAILS = false;
const ENABLE_PARK_FOOTPATH_LINK = false;
const ENABLE_PARK_PAD = false;

const SHOCKWAVE_POOL_CAP = RUNTIME_QUALITY_CONFIG.reducedMotion ? 16 : 28;
const RECORD_CEREMONY_POOL_CAP = 8;
const SHOCKWAVE_DURATION_MIN_MS = RUNTIME_QUALITY_CONFIG.reducedMotion ? 900 : 1200;
const SHOCKWAVE_DURATION_MAX_MS = RUNTIME_QUALITY_CONFIG.reducedMotion ? 1400 : 1900;
const SHOCKWAVE_OPACITY_PEAK = RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.2 : 0.32;
const SHOCKWAVE_RADIUS_CITY_MULT = RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.18 : 0.25;

const MARKET_PULSE_DAMP = 1.9;
const MARKET_PULSE_TRACE_GLOW_GAIN = 0.15;
const MARKET_PULSE_TRACE_CORE_GAIN = 0.08;
const MARKET_PULSE_GROUND_OPACITY_BREATH = 0.1;
const MARKET_PULSE_TRAFFIC_SPEED_GAIN = 0.1;
const MARKET_PULSE_DEBUG_OVERLAY = true;

const ARTERY_SCORE_TRIGGER = 0.9;
const ARTERY_MAX_COUNT = 180;
const ARTERY_RECENT_LOOKBACK = 40;
const ARTERY_MAX_LINKS_PER_EVENT = 3;
const ARTERY_TRAFFIC_EXTRA_CAP = 1024;
const ARTERY_TRAFFIC_SPEED_MULT = 0.68;

const PARK_FORCE_FIRST_BY_TOWER_COUNT = 60;
const PARK_CANDIDATE_ATTEMPTS = 28;

const GROUND_GLOW_Y = -0.05;
const GROUND_SLAB_Y = -0.03;
const GROUND_DECK_Y = -0.02;
const GROUND_GRAPHIC_Y = GROUND_DECK_Y + 0.006;
const TRACE_BASE_Y = GROUND_DECK_Y + 0.012;
const TRACE_LAYER_STEP_Y = 0.00035;
const TRAFFIC_BASE_OFFSET_Y = 0.005;
const TRAFFIC_SOLID_BASE_Y = TRACE_BASE_Y + 0.02;
const TOWER_GROUND_LIFT_Y = 0.002;
const PARK_PATCH_Y = GROUND_DECK_Y + 0.0052;
const TREE_BASE_Y = GROUND_DECK_Y + 0.0108;
const SHOCKWAVE_Y = GROUND_GRAPHIC_Y + 0.0017;
const DISTRICT_LOOP_Y = GROUND_GRAPHIC_Y + 0.00135;
const ARTERY_TRACE_BASE_Y = TRACE_BASE_Y + TRACE_LAYER_STEP_Y * 6 + 0.0015;
const ARTERY_TRACE_STEP_Y = 0.00045;
const ARTERY_TRAFFIC_BASE_Y = ARTERY_TRACE_BASE_Y + 0.012;
const CEREMONY_RING_Y = GROUND_GRAPHIC_Y + 0.0023;
const TOWER_DETAIL_BAND_Y_EPS = 0.0006;
const DEBUG_FORCE_TRAFFIC_VIS = false;
const MAX_TRAFFIC_INSTANCES = 4096;
const TRAFFIC_PATH_TRIM = 0.9;

const RADIAL_GLOW_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RADIAL_GLOW_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uCenterColor;
uniform vec3 uRingColor;
uniform float uOpacity;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float center = pow(1.0 - smoothstep(0.02, 0.72, r), 2.2);
  float mid = 1.0 - smoothstep(0.18, 0.95, r);
  float ring = smoothstep(0.28, 0.45, r) * (1.0 - smoothstep(0.66, 0.9, r));
  vec3 col = uCenterColor * center + uRingColor * ring * 0.95 + uCenterColor * mid * 0.08;
  float alpha = center * 0.16 + ring * 0.1 + mid * 0.03;
  gl_FragColor = vec4(col, alpha * uOpacity);
}
`;

const SKY_GRADIENT_VERTEX = `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SKY_GRADIENT_FRAGMENT = `
varying vec3 vWorldPos;
uniform vec3 uTop;
uniform vec3 uHorizon;
void main() {
  float h = clamp((normalize(vWorldPos).y * 0.5) + 0.5, 0.0, 1.0);
  float t = smoothstep(0.02, 0.82, h);
  vec3 col = mix(uHorizon, uTop, t);
  float n = fract(sin(dot(vWorldPos.xz, vec2(12.9898, 78.233))) * 43758.5453);
  col += (n - 0.5) * 0.004;
  gl_FragColor = vec4(col, 1.0);
}
`;

const VIGNETTE_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const VIGNETTE_FRAGMENT = `
varying vec2 vUv;
uniform float uOpacity;
void main() {
  vec2 p = vUv - 0.5;
  p.x *= 1.18;
  float r = length(p) * 2.0;
  float vignette = smoothstep(0.62, 1.12, r);
  float alpha = vignette * uOpacity;
  gl_FragColor = vec4(vec3(0.02, 0.02, 0.025), alpha);
}
`;

const desiredPosition = new Vector3();
const desiredTarget = new Vector3();
const smoothPosition = new Vector3();
const smoothTarget = new Vector3();
const tempDir = new Vector3();
const tempColorA = new Color();
const tempColorB = new Color();
const tempColorC = new Color();
const hoverProjectWorld = new Vector3();
const hoverProjectNdc = new Vector3();
const HOVER_HUD_HIDDEN: HoverHudSnapshot = {
  visible: false,
  towerSequence: null,
  anchorX: 0,
  anchorY: 0,
  labelX: 0,
  labelY: 0
};

function clampFinite(value: number, fallback: number, min?: number, max?: number) {
  const safe = Number.isFinite(value) ? value : fallback;
  return MathUtils.clamp(safe, min ?? safe, max ?? safe);
}

function looseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function deriveUsdNotional(
  event: BlockEvent,
  totalVolumeBtc: number,
  averagePrice: number
): { usdNotional: number; source: string } {
  const eventAny = event as unknown as Record<string, unknown>;
  const metricsAny = event.metrics as unknown as Record<string, unknown>;
  const explicitUsdEvent = looseNumber(eventAny.usdNotional);
  const explicitUsdMetrics = looseNumber(metricsAny.usdNotional);
  const explicitNotionalUsdEvent = looseNumber(eventAny.notionalUsd);
  const explicitNotionalUsdMetrics = looseNumber(metricsAny.notionalUsd);
  const explicitUsd = explicitUsdEvent ?? explicitUsdMetrics ?? explicitNotionalUsdEvent ?? explicitNotionalUsdMetrics;
  if (explicitUsd != null && explicitUsd > 0) {
    return {
      usdNotional: explicitUsd,
      source: explicitUsdEvent != null || explicitUsdMetrics != null ? 'usdNotional' : 'notionalUsd'
    };
  }

  if (totalVolumeBtc > 0) {
    const eventVwap = looseNumber(eventAny.vwapPrice);
    const metricsVwap = looseNumber(metricsAny.vwapPrice);
    const metricsAvg = looseNumber(metricsAny.averagePrice);
    const vwapLike = eventVwap ?? metricsVwap ?? metricsAvg;
    if (vwapLike != null && vwapLike > 0) {
      return {
        usdNotional: vwapLike * totalVolumeBtc,
        source: eventVwap != null || metricsVwap != null ? 'vwap*btc' : 'avgP*btc'
      };
    }

    const eventLast = looseNumber(eventAny.lastPrice);
    const metricsLast = looseNumber(metricsAny.lastPrice);
    const metricsClose = looseNumber(metricsAny.closePrice);
    const lastLike = eventLast ?? metricsLast ?? metricsClose;
    if (lastLike != null && lastLike > 0) {
      return { usdNotional: lastLike * totalVolumeBtc, source: 'lastP*btc' };
    }
  }

  return { usdNotional: Math.max(0, totalVolumeBtc * Math.max(0, averagePrice)), source: 'legacy' };
}

const compactNumber = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2
});
const compactUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2
});

function fmtCompact(v: number) {
  if (!Number.isFinite(v)) return '0';
  return compactNumber.format(Math.max(0, v));
}

function fmtUsdCompact(v: number) {
  if (!Number.isFinite(v)) return '$0';
  return compactUsd.format(Math.max(0, v));
}

function fmtBtc(v: number) {
  if (!Number.isFinite(v)) return '0';
  if (v >= 10) return v.toFixed(2);
  if (v >= 1) return v.toFixed(3);
  if (v >= 0.1) return v.toFixed(4);
  return v.toFixed(5);
}

function fmtFixed(v: number, digits = 2) {
  if (!Number.isFinite(v)) return '0';
  return v.toFixed(digits);
}

function fmtSignedPct(v: number, digits = 2) {
  if (!Number.isFinite(v)) return '0.00%';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}%`;
}

function fmtTopCoinsError(error: string | null) {
  if (!error) return 'none';
  if (error.startsWith('snapshot-http-')) {
    const code = error.split('snapshot-http-')[1] ?? 'n/a';
    return `snapshot unavailable (${code})`;
  }
  if (error === 'snapshot-invalid-json') {
    return 'snapshot invalid json';
  }
  if (error === 'snapshot-invalid-payload' || error === 'snapshot-invalid-asof') {
    return 'snapshot invalid data';
  }
  return error;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function finalizeCanvasTexture(texture: CanvasTexture) {
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function easeOutCubic(t: number) {
  const x = MathUtils.clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

function easeOutBack(t: number, overshoot = 1.1) {
  const x = MathUtils.clamp(t, 0, 1);
  const c1 = overshoot;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function smoothstep01(v: number) {
  const x = MathUtils.clamp(v, 0, 1);
  return x * x * (3 - 2 * x);
}

function wrapAngleRad(value: number) {
  const twoPi = Math.PI * 2;
  let a = (value + Math.PI) % twoPi;
  if (a < 0) a += twoPi;
  return a - Math.PI;
}

function dampAngleRad(current: number, target: number, lambda: number, delta: number) {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * (1 - Math.exp(-lambda * delta));
}

function sigmoid01(v: number) {
  if (!Number.isFinite(v)) return 0.5;
  if (v <= -20) return 0;
  if (v >= 20) return 1;
  return 1 / (1 + Math.exp(-v));
}

function distanceVisibilityCurve(cameraDistance: number) {
  const t = MathUtils.clamp((cameraDistance - VIS_NEAR_DIST) / Math.max(1, VIS_FAR_DIST - VIS_NEAR_DIST), 0, 1);
  const s = smoothstep01(t);
  return MathUtils.clamp(Math.pow(s, 0.82), 0, 1);
}

function remapClamped(value: number, inMin: number, inMax: number) {
  if (inMax <= inMin) return 0;
  return MathUtils.clamp((value - inMin) / (inMax - inMin), 0, 1);
}

function emaStd(variance: number) {
  return Math.sqrt(Math.max(variance, EMA_STD_EPS * EMA_STD_EPS));
}

function updateEma(mean: number, variance: number, value: number, alpha: number) {
  const delta = value - mean;
  const nextMean = mean + alpha * delta;
  const nextVariance = (1 - alpha) * (variance + alpha * delta * delta);
  return {
    mean: nextMean,
    variance: Math.max(nextVariance, EMA_STD_EPS * EMA_STD_EPS)
  };
}

function hash01(...values: number[]) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < values.length; i++) {
    const v = Math.floor(values[i] * 1000) >>> 0;
    h ^= v + 0x9e3779b9 + (h << 6) + (h >>> 2);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}

function segmentFromPoints(ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.hypot(dx, dz);
  return {
    length,
    yaw: Math.atan2(dx, dz),
    midX: (ax + bx) * 0.5,
    midZ: (az + bz) * 0.5
  };
}

function buildTowerShapeParams(sequence: number, heightScore: number): {
  archetypeId: TowerArchetypeId;
  baseW: number;
  baseD: number;
  footprintX: number;
  footprintZ: number;
  taper: number;
  podiumRatio: number;
  crownRatio: number;
} {
  const archetypePick = hash01(sequence, 101);
  const archetypeId: TowerArchetypeId =
    archetypePick < 0.17
      ? 0
      : archetypePick < 0.34
        ? 1
        : archetypePick < 0.52
          ? 2
          : archetypePick < 0.7
            ? 3
            : archetypePick < 0.87
              ? 4
              : 5;

  const scoreLike = MathUtils.clamp(heightScore, 0, 1);
  const baseAreaScore = Math.pow(scoreLike, BASE_AREA_GAMMA);
  const base = MathUtils.clamp(
    MathUtils.lerp(MIN_BASE, MAX_BASE, baseAreaScore) * MathUtils.lerp(0.96, 1.04, hash01(sequence, 109)),
    MIN_BASE,
    MAX_BASE * 1.06
  );
  const aspect = MathUtils.lerp(ASPECT_MIN, ASPECT_MAX, hash01(sequence, 111));
  const sqrtAspect = Math.sqrt(aspect);
  const baseW = MathUtils.clamp(base * sqrtAspect, MIN_BASE * 0.95, MAX_BASE * 1.25);
  const baseD = MathUtils.clamp(base / sqrtAspect, MIN_BASE * 0.95, MAX_BASE * 1.25);
  const fx = baseW;
  const fz = baseD;
  const taper = Math.min(
    TAPER_MAX,
    MathUtils.lerp(0.02, TAPER_MAX, hash01(sequence, 127)) * (0.72 + heightScore * 0.42)
  );
  const podiumRatio = MathUtils.lerp(0.12, 0.25, hash01(sequence, 131));
  const crownRatio = MathUtils.lerp(0.07, 0.16, hash01(sequence, 137));

  return {
    archetypeId,
    baseW,
    baseD,
    footprintX: fx,
    footprintZ: fz,
    taper,
    podiumRatio,
    crownRatio
  };
}

function createEmptyAccum(): AccumState {
  const shockwaves = Array.from({ length: SHOCKWAVE_POOL_CAP }, () => ({
    serial: 0,
    active: false,
    originX: 0,
    originZ: 0,
    startTimeMs: 0,
    durationMs: 1200,
    startRadius: 0.4,
    maxRadius: 8,
    thickness: 0.05,
    color: '#f7931a',
    peakOpacity: 0.28
  })) as ShockwaveDatum[];
  const recordCeremonies = Array.from({ length: RECORD_CEREMONY_POOL_CAP }, () => ({
    serial: 0,
    active: false,
    towerSequence: 0,
    x: 0,
    z: 0,
    towerHeight: 0,
    startTimeMs: 0,
    durationMs: 1400
  })) as RecordCeremonyDatum[];
  return {
    processedSequences: new Set<number>(),
    towers: [],
    traces: [],
    arterialTraces: [],
    trafficParticles: [],
    arterialTrafficParticles: [],
    parks: [],
    parkTrees: [],
    districts: [],
    shockwaves,
    shockwaveCursor: 0,
    shockwaveSerial: 0,
    recordCeremonies,
    recordCeremonyCursor: 0,
    recordCeremonySerial: 0,
    traceKeySet: new Set<string>(),
    arteryKeySet: new Set<string>(),
    lastSequence: 0,
    bounds: {
      radius: 18,
      maxY: 10
    },
    ema: {
      initialized: false,
      meanLogUsd: 0,
      varLogUsd: 1,
      meanI: 0.4,
      varI: 0.08,
      meanAbsImb: 0.22,
      varAbsImb: 0.04
    },
    marketMoodTarget: 0.18,
    marketMoodRaw: 0.18,
    latestHeightDebug: null,
    nextParkAtCount: PARK_CADENCE_BASE + Math.round((hash01(1, 7009) * 2 - 1) * PARK_CADENCE_JITTER),
    towersSinceHero: 0,
    heroEligibleSinceLast: 0,
    maxUsdSeen: 0,
    maxHeightSeen: 0,
    tallestTowerSequence: null,
    tallestTowerHeight: 0,
    lastTallestCeremonySequence: null,
    lastTallestCeremonyHeight: 0,
    parksAttempted: 0,
    parksPlaced: 0,
    lastParkSkipReason: 'none'
  };
}

function pushShockwave(
  state: AccumState,
  tower: TowerDatum,
  colorHex: string
) {
  if (!ENABLE_SPECTACLE_LAYER || !ENABLE_SHOCKWAVES || state.shockwaves.length === 0) return;
  const i = state.shockwaveCursor % state.shockwaves.length;
  state.shockwaveCursor = (state.shockwaveCursor + 1) % state.shockwaves.length;
  state.shockwaveSerial += 1;
  const cityRadius = Math.max(18, state.bounds.radius);
  const slot = state.shockwaves[i];
  slot.serial = state.shockwaveSerial;
  slot.active = true;
  slot.originX = tower.x;
  slot.originZ = tower.z;
  slot.startTimeMs = performance.now();
  slot.durationMs = Math.round(
    MathUtils.lerp(SHOCKWAVE_DURATION_MIN_MS, SHOCKWAVE_DURATION_MAX_MS, hash01(tower.sequence, 8801))
  );
  slot.startRadius = Math.max(tower.footprintX, tower.footprintZ) * 0.72;
  slot.maxRadius = Math.min(cityRadius * SHOCKWAVE_RADIUS_CITY_MULT, Math.max(7.5, cityRadius * 0.34));
  slot.thickness = MathUtils.lerp(0.04, 0.075, hash01(tower.sequence, 8807));
  slot.color = colorHex;
  slot.peakOpacity = SHOCKWAVE_OPACITY_PEAK * MathUtils.lerp(0.82, 1.08, hash01(tower.sequence, 8813));
}

function pushRecordCeremony(state: AccumState, tower: TowerDatum) {
  if (!ENABLE_SPECTACLE_LAYER || !ENABLE_RECORD_CEREMONY || state.recordCeremonies.length === 0) return;
  if (
    state.lastTallestCeremonySequence === tower.sequence &&
    Math.abs(state.lastTallestCeremonyHeight - tower.height) < 0.0001
  ) {
    return;
  }
  state.lastTallestCeremonySequence = tower.sequence;
  state.lastTallestCeremonyHeight = tower.height;
  const i = state.recordCeremonyCursor % state.recordCeremonies.length;
  state.recordCeremonyCursor = (state.recordCeremonyCursor + 1) % state.recordCeremonies.length;
  state.recordCeremonySerial += 1;
  const slot = state.recordCeremonies[i];
  slot.serial = state.recordCeremonySerial;
  slot.active = true;
  slot.towerSequence = tower.sequence;
  slot.x = tower.x;
  slot.z = tower.z;
  slot.towerHeight = tower.height;
  slot.startTimeMs = performance.now();
  slot.durationMs = RUNTIME_QUALITY_CONFIG.reducedMotion ? 1000 : 1600;
}

function ensureDistrictForNextTower(state: AccumState, tower: TowerDatum) {
  if (!ENABLE_SPECTACLE_LAYER || !ENABLE_DISTRICTS) {
    tower.districtId = 0;
    tower.districtAccentColor = '#f2dec0';
    return;
  }
  const nextIndex = state.towers.length;
  const districtId = Math.floor(nextIndex / DISTRICT_SIZE);
  while (state.districts.length <= districtId) {
    const id = state.districts.length;
    const seed = hash01(id, 9101);
    const tint = new Color('#f4ead6').lerp(new Color('#ffd4a0'), seed * 0.28);
    state.districts.push({
      id,
      memberCount: 0,
      centerX: 0,
      centerZ: 0,
      radiusEstimate: 4.8,
      themeSeed: seed,
      tintColor: `#${tint.getHexString()}`
    });
  }
  const district = state.districts[districtId]!;
  district.memberCount += 1;
  const n = district.memberCount;
  district.centerX += (tower.x - district.centerX) / n;
  district.centerZ += (tower.z - district.centerZ) / n;
  const d = Math.hypot(tower.x - district.centerX, tower.z - district.centerZ) + Math.max(tower.baseW, tower.baseD) * 0.8;
  district.radiusEstimate = Math.max(district.radiusEstimate, d, 5.2);
  tower.districtId = districtId;
  tower.districtAccentColor = district.tintColor;
}

function appendArteriesForNewTower(state: AccumState, tower: TowerDatum) {
  if (!ENABLE_SPECTACLE_LAYER || !ENABLE_ARTERIALS) return;
  if (state.arterialTraces.length >= ARTERY_MAX_COUNT) return;
  const trigger = tower.isHero || tower.heightScore >= ARTERY_SCORE_TRIGGER;
  if (!trigger || state.towers.length < 4) return;

  const targets: TowerDatum[] = [];
  const pushUniqueTarget = (candidate: TowerDatum | null | undefined) => {
    if (!candidate) return;
    if (candidate.sequence === tower.sequence) return;
    if (targets.some((t) => t.sequence === candidate.sequence)) return;
    targets.push(candidate);
  };

  const tallest = state.towers.find((t) => t.sequence === state.tallestTowerSequence) ?? null;
  pushUniqueTarget(tallest);

  let highVolRecent: TowerDatum | null = null;
  let bestVol = -1;
  for (let i = Math.max(0, state.towers.length - 1 - ARTERY_RECENT_LOOKBACK); i < state.towers.length - 1; i++) {
    const t = state.towers[i];
    if (!t) continue;
    if (t.usdNotional > bestVol) {
      bestVol = t.usdNotional;
      highVolRecent = t;
    }
  }
  pushUniqueTarget(highVolRecent);

  if (state.districts.length > 1) {
    let farDistrictTower: TowerDatum | null = null;
    let farScore = -1;
    for (let i = 0; i < state.towers.length - 1; i++) {
      const t = state.towers[i];
      if (!t || t.districtId === tower.districtId) continue;
      const dist = Math.hypot(t.x - tower.x, t.z - tower.z);
      const score = dist + t.height * 0.12;
      if (score > farScore) {
        farScore = score;
        farDistrictTower = t;
      }
    }
    pushUniqueTarget(farDistrictTower);
  }

  const linkCount = Math.min(
    Math.max(1, Math.round(MathUtils.lerp(1, ARTERY_MAX_LINKS_PER_EVENT, tower.heightScore))),
    targets.length
  );
  for (let i = 0; i < linkCount; i++) {
    const target = targets[i];
    if (!target) continue;
    const aSeq = Math.min(tower.sequence, target.sequence);
    const bSeq = Math.max(tower.sequence, target.sequence);
    const key = `${aSeq}:${bSeq}`;
    if (state.arteryKeySet.has(key)) continue;
    const seg = segmentFromPoints(tower.x, tower.z, target.x, target.z);
    if (!Number.isFinite(seg.length) || seg.length < 8) continue;
    if (traceCrossesPark(state, tower.x, tower.z, target.x, target.z)) continue;

    state.arteryKeySet.add(key);
    const warm = hash01(aSeq, bSeq, 9901);
    const core = new Color('#f9c57b').lerp(new Color('#ffe9c9'), warm * 0.22);
    const glow = new Color('#f7931a').lerp(new Color('#ffd59a'), warm * 0.16);
    const y = ARTERY_TRACE_BASE_Y + i * ARTERY_TRACE_STEP_Y;
    const width = 0.14 + hash01(aSeq, bSeq, 9907) * 0.045;
    const glowWidth = width * 3.05;
    const traceId = `A-${key}`;
    state.arterialTraces.push({
      id: traceId,
      aSequence: aSeq,
      bSequence: bSeq,
      midX: seg.midX,
      midZ: seg.midZ,
      length: Math.max(1.1, seg.length - TOWER_FOOTPRINT * 0.55),
      yaw: seg.yaw,
      y,
      width,
      glowWidth,
      coreColor: `#${core.getHexString()}`,
      glowColor: `#${glow.getHexString()}`,
      isArtery: true,
      scanSeed: hash01(aSeq, bSeq, 9913)
    });

    const particleCount = Math.min(
      6,
      Math.max(1, Math.round((seg.length / 14) * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.55 : 1)))
    );
    const dirX = Math.sin(seg.yaw);
    const dirZ = Math.cos(seg.yaw);
    const travelLen = Math.max(0.6, seg.length - 0.24);
    const halfLen = travelLen * 0.5;
    const ax = seg.midX - dirX * halfLen;
    const az = seg.midZ - dirZ * halfLen;
    const bx = seg.midX + dirX * halfLen;
    const bz = seg.midZ + dirZ * halfLen;

    for (let p = 0; p < particleCount; p++) {
      if (state.arterialTrafficParticles.length >= ARTERY_TRAFFIC_EXTRA_CAP) break;
      const phase = hash01(aSeq, bSeq, p, 9923);
      const speedBase = (0.024 + hash01(aSeq, bSeq, p, 9929) * 0.028) * ARTERY_TRAFFIC_SPEED_MULT;
      const speed = speedBase * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.6 : 1);
      state.arterialTrafficParticles.push({
        id: `${traceId}-C-${p}`,
        traceId,
        ax,
        az,
        bx,
        bz,
        yaw: seg.yaw,
        y: ARTERY_TRAFFIC_BASE_Y + i * 0.00035,
        speed,
        phase,
        color: p % 2 === 0 ? '#ffe8c7' : '#f7b75d',
        sizeX: 0.11 + hash01(aSeq, bSeq, p, 9937) * 0.04,
        sizeY: 0.03,
        sizeZ: 0.26 + hash01(aSeq, bSeq, p, 9941) * 0.12,
        isArtery: true
      });
    }
  }
}

function nextParkInterval(seed: number) {
  return PARK_CADENCE_BASE + Math.round((hash01(seed, 7021) * 2 - 1) * PARK_CADENCE_JITTER);
}

type ParkTowerCollisionTarget = Pick<TowerDatum, 'x' | 'z' | 'baseW' | 'baseD' | 'footprintX' | 'footprintZ'>;

function parkConflictsTower(x: number, z: number, w: number, d: number, tower: ParkTowerCollisionTarget) {
  const dx = Math.abs(x - tower.x);
  const dz = Math.abs(z - tower.z);
  const towerHalfX = Math.max(tower.baseW, tower.footprintX) * 0.62;
  const towerHalfZ = Math.max(tower.baseD, tower.footprintZ) * 0.62;
  return dx < w * 0.5 + towerHalfX + PARK_BASE_CLEARANCE && dz < d * 0.5 + towerHalfZ + PARK_BASE_CLEARANCE;
}

function parkConflictsPark(x: number, z: number, w: number, d: number, park: ParkDatum) {
  const dx = Math.abs(x - park.x);
  const dz = Math.abs(z - park.z);
  return dx < w * 0.5 + park.w * 0.5 + 1.2 && dz < d * 0.5 + park.d * 0.5 + 1.2;
}

function pointSegmentDistanceXZ(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const abx = bx - ax;
  const abz = bz - az;
  const abLenSq = abx * abx + abz * abz;
  if (abLenSq <= 1e-6) return Math.hypot(px - ax, pz - az);
  const apx = px - ax;
  const apz = pz - az;
  const t = MathUtils.clamp((apx * abx + apz * abz) / abLenSq, 0, 1);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  return Math.hypot(px - cx, pz - cz);
}

function traceCrossesPark(state: AccumState, ax: number, az: number, bx: number, bz: number) {
  for (let i = 0; i < state.parks.length; i++) {
    const park = state.parks[i];
    if (!park) continue;
    const d = pointSegmentDistanceXZ(park.x, park.z, ax, az, bx, bz);
    if (d < park.radius + 0.25) return true;
  }
  return false;
}

function appendParkAtTowerSlot(state: AccumState, sourceTower: TowerDatum, seed: number) {
  state.parksAttempted += 1;
  if (state.parks.length >= MAX_PARKS_VISIBLE) {
    state.lastParkSkipReason = 'park-cap';
    return false;
  }
  const cityRadius = Math.max(18, state.bounds.radius);
  const radius = MathUtils.clamp(
    Math.max(sourceTower.footprintX, sourceTower.footprintZ) * MathUtils.lerp(1.4, 2.35, hash01(seed, 7311)),
    1.7,
    4.8
  );
  const w = radius * MathUtils.lerp(1.45, 1.85, hash01(seed, 7317));
  const d = radius * MathUtils.lerp(1.35, 1.78, hash01(seed, 7321));
  const yaw = hash01(seed, 7327) * Math.PI;
  const chosenX = sourceTower.x;
  const chosenZ = sourceTower.z;

  for (let i = 0; i < state.parks.length; i++) {
    const otherPark = state.parks[i];
    if (!otherPark) continue;
    if (Math.hypot(otherPark.x - chosenX, otherPark.z - chosenZ) < otherPark.radius + radius + 0.6) {
      state.lastParkSkipReason = 'park-overlap';
      return false;
    }
  }

  const patchColor = CORE_GRAPHITE.clone().lerp(CORE_GRAPHITE_HI, 0.52).lerp(BTC_ORANGE, 0.03);
  const edgeColor = BTC_SELL_WARM.clone().lerp(BTC_PALE_AMBER, 0.34).lerp(BTC_ORANGE, 0.18);

  const treeStart = state.parkTrees.length;
  const requestedTreeCount = Math.max(
    8,
    Math.round(MathUtils.lerp(12, 28, hash01(seed, 7331)) * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.75 : 1))
  );
  for (let i = 0; i < requestedTreeCount; i++) {
    const a = hash01(seed, i, 7337) * Math.PI * 2;
    const r = Math.sqrt(hash01(seed, i, 7341)) * (radius * 0.9);
    const localX = Math.cos(a) * r;
    const localZ = Math.sin(a) * r;
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const worldX = chosenX + localX * cs - localZ * sn;
    const worldZ = chosenZ + localX * sn + localZ * cs;
    if (Math.hypot(worldX, worldZ) > cityRadius * 1.08) continue;
    state.parkTrees.push({
      x: worldX,
      z: worldZ,
      yaw: hash01(seed, i, 7349) * Math.PI * 2,
      trunkH: (() => {
        const tallRoll = hash01(seed, i, 7343);
        const tallMul = tallRoll > 0.88 ? MathUtils.lerp(1.22, 1.58, hash01(seed, i, 7345)) : tallRoll > 0.68 ? 1.12 : 1;
        return MathUtils.lerp(0.22, 0.5, hash01(seed, i, 7351)) * tallMul;
      })(),
      crownH: (() => {
        const tallRoll = hash01(seed, i, 7343);
        const tallMul = tallRoll > 0.88 ? MathUtils.lerp(1.16, 1.4, hash01(seed, i, 7355)) : tallRoll > 0.68 ? 1.06 : 1;
        return MathUtils.lerp(0.32, 0.74, hash01(seed, i, 7357)) * tallMul;
      })(),
      crownR: MathUtils.lerp(0.12, 0.32, hash01(seed, i, 7361)) * MathUtils.lerp(0.9, 1.15, hash01(seed, i, 7363)),
      tintMix: hash01(seed, i, 7367)
    });
  }

  let linkX: number | null = null;
  let linkZ: number | null = null;
  let linkDistBest = Infinity;
  for (let i = 0; i < state.towers.length; i++) {
    const t = state.towers[i];
    if (!t) continue;
    const dToTower = Math.hypot(t.x - chosenX, t.z - chosenZ);
    if (dToTower < linkDistBest) {
      linkDistBest = dToTower;
      linkX = t.x;
      linkZ = t.z;
    }
  }

  const fireflyCount = Math.max(
    4,
    Math.min(state.parkTrees.length - treeStart, Math.round((state.parkTrees.length - treeStart) * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.4 : 0.7)))
  );

  state.parks.push({
    id: `park-slot-${sourceTower.sequence}`,
    x: chosenX,
    z: chosenZ,
    w,
    d,
    yaw,
    patchColor: `#${patchColor.getHexString()}`,
    edgeColor: `#${edgeColor.getHexString()}`,
    seed,
    radius,
    fireflyCount,
    linkX,
    linkZ,
    emittedAt: Date.now(),
    treeStart,
    treeCount: state.parkTrees.length - treeStart
  });
  state.parksPlaced += 1;
  state.lastParkSkipReason = 'placed-slot';
  return true;
}

function parkSpiralCandidate(seed: number, state: AccumState, attempt: number) {
  const frontierIdx =
    Math.max(0, state.towers.length - 1) +
    0.45 +
    hash01(seed, 7103) * 1.15 +
    attempt * (0.62 + hash01(seed, attempt, 7109) * 0.58);
  const angle = frontierIdx * GOLDEN_ANGLE + (hash01(seed, attempt, 7113) - 0.5) * 0.42;
  const radius = Math.sqrt(Math.max(0, frontierIdx)) * SPIRAL_STEP * MathUtils.lerp(0.98, 1.18, hash01(seed, attempt, 7119));
  return {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius
  };
}

function appendPark(state: AccumState, seed: number) {
  state.parksAttempted += 1;
  if (state.parks.length >= MAX_PARKS_VISIBLE) {
    state.lastParkSkipReason = 'park-cap';
    return false;
  }
  if (state.towers.length < 16) {
    state.lastParkSkipReason = 'too-early';
    return false;
  }

  const cityRadius = Math.max(18, state.bounds.radius);
  const sizeScale = MathUtils.lerp(0.95, 1.3, MathUtils.clamp(cityRadius / 160, 0, 1));
  const w = MathUtils.lerp(4.9, 8.3, hash01(seed, 7101)) * sizeScale;
  const d = MathUtils.lerp(4.5, 7.9, hash01(seed, 7109)) * sizeScale;
  const yaw = hash01(seed, 7117) * Math.PI;
  const thisParkRadius = Math.max(w, d) * 0.58;

  let chosenX = 0;
  let chosenZ = 0;
  let placed = false;
  let fallbackBest: { x: number; z: number; penalty: number } | null = null;
  for (let attempt = 0; attempt < PARK_CANDIDATE_ATTEMPTS; attempt++) {
    const spiral = parkSpiralCandidate(seed, state, attempt);
    let x = spiral.x;
    let z = spiral.z;
    const radialLen = Math.max(0.0001, Math.hypot(x, z));
    const dirX = x / radialLen;
    const dirZ = z / radialLen;

    // Parks should occupy "growth frontier" style slots, like where a new tower would normally land.
    // Use the same local push-out idea as towers to avoid immediate overlaps while keeping placement deterministic.
    const recentTowerSample = Math.min(26, state.towers.length);
    for (let i = 0; i < recentTowerSample; i++) {
      const other = state.towers[state.towers.length - 1 - i];
      if (!other) continue;
      const dx = x - other.x;
      const dz = z - other.z;
      const dist = Math.hypot(dx, dz);
      const otherR = Math.max(other.baseW, other.baseD) * 0.7;
      const minDist = otherR + thisParkRadius + PARK_BASE_CLEARANCE + 0.22;
      if (dist < minDist) {
        const push = minDist - dist + 0.06;
        x += dirX * push;
        z += dirZ * push;
      }
    }
    if (Math.hypot(x, z) > cityRadius * 1.35) {
      const clampR = cityRadius * 1.35;
      const len = Math.hypot(x, z) || 1;
      x = (x / len) * clampR;
      z = (z / len) * clampR;
    }
    let blocked = false;
    let penalty = 0;
    for (let i = 0; i < state.towers.length; i++) {
      const other = state.towers[i];
      if (!other) continue;
      if (parkConflictsTower(x, z, w, d, other)) {
        blocked = true;
        const dx = Math.abs(x - other.x);
        const dz = Math.abs(z - other.z);
        penalty += Math.max(0, (w + d) * 0.35 - Math.min(dx, dz));
      }
    }
    for (let i = 0; i < state.parks.length; i++) {
      const otherPark = state.parks[i];
      if (!otherPark) continue;
      if (parkConflictsPark(x, z, w, d, otherPark)) {
        blocked = true;
        penalty += 1.1;
      }
    }
    if (blocked) {
      if (!fallbackBest || penalty < fallbackBest.penalty) {
        fallbackBest = { x, z, penalty };
      }
      continue;
    }
    chosenX = x;
    chosenZ = z;
    placed = true;
    state.lastParkSkipReason = 'placed';
    break;
  }

  if (!placed && fallbackBest) {
    chosenX = fallbackBest.x;
    chosenZ = fallbackBest.z;
    placed = true;
    state.lastParkSkipReason = 'fallback-nearby';
  }

  if (!placed) {
    state.lastParkSkipReason = 'no-slot';
    return false;
  }

  const patchColor = CORE_GRAPHITE.clone()
    .lerp(CORE_GRAPHITE_HI, 0.4 + hash01(seed, 7201) * 0.35)
    .lerp(BTC_ORANGE, 0.04 + hash01(seed, 7207) * 0.05);
  const edgeColor = BTC_SELL_WARM.clone().lerp(BTC_ORANGE, 0.25 + hash01(seed, 7211) * 0.28);

  const treeStart = state.parkTrees.length;
  const requestedTreeCount = Math.floor(MathUtils.lerp(12, 40, hash01(seed, 7217)));
  for (let i = 0; i < requestedTreeCount; i++) {
    let localX = 0;
    let localZ = 0;
    let ok = false;
    for (let a = 0; a < 6; a++) {
      const px = (hash01(seed, i, a, 7229) - 0.5) * (w * 0.82);
      const pz = (hash01(seed, i, a, 7237) - 0.5) * (d * 0.82);
      // Reserve a subtle internal path/void so parks read as planned spaces.
      if (Math.abs(px) < w * 0.13 && hash01(seed, i, a, 7243) > 0.24) continue;
      if (Math.abs(pz) < d * 0.11 && hash01(seed, i, a, 7249) > 0.72) continue;
      localX = px;
      localZ = pz;
      ok = true;
      break;
    }
    if (!ok) continue;

    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const worldX = chosenX + localX * cs - localZ * sn;
    const worldZ = chosenZ + localX * sn + localZ * cs;
    if (Math.hypot(worldX, worldZ) > cityRadius * 1.05) continue;

    state.parkTrees.push({
      x: worldX,
      z: worldZ,
      yaw: hash01(seed, i, 7253) * Math.PI * 2,
      trunkH: (() => {
        const tallRoll = hash01(seed, i, 7259);
        const tallMul = tallRoll > 0.9 ? MathUtils.lerp(1.25, 1.6, hash01(seed, i, 7260)) : tallRoll > 0.72 ? 1.12 : 1;
        return MathUtils.lerp(0.24, 0.56, hash01(seed, i, 7261)) * tallMul;
      })(),
      crownH: (() => {
        const tallRoll = hash01(seed, i, 7259);
        const tallMul = tallRoll > 0.9 ? MathUtils.lerp(1.18, 1.45, hash01(seed, i, 7262)) : tallRoll > 0.72 ? 1.08 : 1;
        return MathUtils.lerp(0.46, 0.98, hash01(seed, i, 7267)) * tallMul;
      })(),
      crownR: MathUtils.lerp(0.18, 0.42, hash01(seed, i, 7273)) * MathUtils.lerp(0.9, 1.12, hash01(seed, i, 7277)),
      tintMix: hash01(seed, i, 7281)
    });
  }

  let linkX: number | null = null;
  let linkZ: number | null = null;
  let linkDistBest = Infinity;
  for (let i = 0; i < state.towers.length; i++) {
    const t = state.towers[i];
    if (!t) continue;
    const d = Math.hypot(t.x - chosenX, t.z - chosenZ);
    if (d < linkDistBest) {
      linkDistBest = d;
      linkX = t.x;
      linkZ = t.z;
    }
  }

  const fireflyCount = Math.max(
    4,
    Math.min(state.parkTrees.length - treeStart, Math.round((state.parkTrees.length - treeStart) * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.45 : 0.8)))
  );
  const radius = thisParkRadius;

  state.parks.push({
    id: `park-${state.towers.length}-${seed}`,
    x: chosenX,
    z: chosenZ,
    w,
    d,
    yaw,
    patchColor: `#${patchColor.getHexString()}`,
    edgeColor: `#${edgeColor.getHexString()}`,
    seed,
    radius,
    fireflyCount,
    linkX,
    linkZ,
    emittedAt: Date.now(),
    treeStart,
    treeCount: state.parkTrees.length - treeStart
  });
  state.parksPlaced += 1;

  return true;
}

function maybeAppendPark(state: AccumState, seed: number) {
  const towerCount = state.towers.length;
  if (ENABLE_PARKS_V2 && state.parks.length === 0 && towerCount >= PARK_FORCE_FIRST_BY_TOWER_COUNT) {
    for (let i = 0; i < 4 && state.parks.length === 0; i++) {
      appendPark(state, seed + i * 97);
    }
    if (state.parks.length > 0) {
      state.nextParkAtCount = towerCount + nextParkInterval(seed + towerCount);
      return;
    }
  }
  if (towerCount < state.nextParkAtCount) return;
  const placed = appendPark(state, seed);
  if (!placed && state.lastParkSkipReason === 'too-early') {
    state.nextParkAtCount = Math.max(state.nextParkAtCount, 24);
    return;
  }
  state.nextParkAtCount = towerCount + nextParkInterval(seed + towerCount);
}

function appendTracesForNewTower(state: AccumState, tower: TowerDatum) {
  if (state.towers.length <= 1) return;

  const existing = state.towers.slice(0, -1);
  const maxLinkDistance =
    RUNTIME_QUALITY_CONFIG.tier === 'low' ? 20 : RUNTIME_QUALITY_CONFIG.tier === 'medium' ? 24 : 28;
  const desiredLinks =
    RUNTIME_QUALITY_CONFIG.tier === 'low' ? 2 : RUNTIME_QUALITY_CONFIG.tier === 'medium' ? 3 : 4;

  const candidates = existing
    .map((other) => {
      const dist = Math.hypot(tower.x - other.x, tower.z - other.z);
      return { other, dist };
    })
    .filter((item) => item.dist > 0.001 && item.dist <= maxLinkDistance)
    .sort((a, b) => a.dist - b.dist);

  const picked = candidates.slice(0, Math.min(desiredLinks, candidates.length));
  for (let i = 0; i < picked.length; i++) {
    const neighbor = picked[i].other;
    const aSeq = Math.min(tower.sequence, neighbor.sequence);
    const bSeq = Math.max(tower.sequence, neighbor.sequence);
    const traceKey = `${aSeq}:${bSeq}`;
    if (state.traceKeySet.has(traceKey)) continue;

    const seg = segmentFromPoints(tower.x, tower.z, neighbor.x, neighbor.z);
    if (!Number.isFinite(seg.length) || seg.length < 0.8) continue;
    if (traceCrossesPark(state, tower.x, tower.z, neighbor.x, neighbor.z)) continue;

    state.traceKeySet.add(traceKey);
    const warmBias = hash01(aSeq, bSeq, seg.length);
    const imbalanceBias = hash01(tower.sequence, neighbor.sequence, 7);
    const core = TRACE_ORANGE.clone().lerp(TRACE_PALE, 0.22 + warmBias * 0.22).lerp(TRACE_WARM, imbalanceBias > 0.82 ? 0.24 : 0);
    const glow = TRACE_ORANGE.clone().lerp(TRACE_WARM, warmBias > 0.88 ? 0.35 : 0.12);
    const width = 0.08 + hash01(aSeq, bSeq, 3) * 0.03;
    const glowWidth = width * 2.6;
    const y = TRACE_BASE_Y + i * TRACE_LAYER_STEP_Y;

    const traceId = `T-${traceKey}`;
    const visibleTraceLen = Math.max(0.9, seg.length - TOWER_FOOTPRINT * 0.7);
    state.traces.push({
      id: traceId,
      aSequence: aSeq,
      bSequence: bSeq,
      midX: seg.midX,
      midZ: seg.midZ,
      length: visibleTraceLen,
      yaw: seg.yaw,
      y,
      width,
      glowWidth,
      coreColor: `#${core.getHexString()}`,
      glowColor: `#${glow.getHexString()}`
    });

    const densityScale =
      (RUNTIME_QUALITY_CONFIG.tier === 'low' ? 0.6 : RUNTIME_QUALITY_CONFIG.tier === 'medium' ? 1 : 1.35) *
      (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.55 : 1);
    const particleCount = Math.max(
      RUNTIME_QUALITY_CONFIG.reducedMotion ? 1 : 2,
      Math.round((1 + seg.length / 8) * densityScale)
    );
    // Traffic must follow the rendered (shortened) street strip, not the raw tower-center segment.
    // Cars should run on the same visible orange street strip, with only a tiny inset from the ends.
    // IMPORTANT: trace yaw is defined as atan2(dx, dz), so the world forward dir for the trace centerline is:
    // dir = (sin(yaw), cos(yaw)) in XZ. Using (cos,sin) was the bug that sent cars off-road / sideways.
    const trafficTravelLen = Math.max(0.45, visibleTraceLen - 0.14);
    const halfVisibleLen = Math.max(0.12, trafficTravelLen * 0.5);
    const dirX = Math.sin(seg.yaw);
    const dirZ = Math.cos(seg.yaw);
    const visAx = seg.midX - dirX * halfVisibleLen;
    const visAz = seg.midZ - dirZ * halfVisibleLen;
    const visBx = seg.midX + dirX * halfVisibleLen;
    const visBz = seg.midZ + dirZ * halfVisibleLen;

    for (let p = 0; p < particleCount; p++) {
      const phase = hash01(aSeq, bSeq, p, 11);
      const speedBase = 0.035 + hash01(aSeq, bSeq, p, 23) * 0.045;
      const speed = speedBase * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.45 : 1);
      const orangeBias = hash01(aSeq, bSeq, p, 31);
      const particleColor =
        orangeBias > 0.86
          ? TRACE_ORANGE.clone()
          : orangeBias > 0.52
            ? TRACE_WARM.clone()
            : TRACE_PALE.clone();

      state.trafficParticles.push({
        id: `${traceId}-P-${p}`,
        traceId,
        // Follow the visible shortened trace strip, not tower-center to tower-center.
        ax: visAx,
        az: visAz,
        bx: visBx,
        bz: visBz,
        yaw: seg.yaw,
        y: y + 0.0095,
        speed,
        phase,
        color: `#${particleColor.getHexString()}`,
        sizeX: 0.085 + hash01(aSeq, bSeq, p, 47) * 0.03,
        sizeY: 0.024,
        sizeZ: 0.18 + hash01(aSeq, bSeq, p, 59) * 0.08
      });
    }
  }
}

function mapEventToTower(event: BlockEvent, state: AccumState): TowerDatum {
  const idx = Math.max(0, Math.floor(event.sequence) - 1);
  const angle = idx * GOLDEN_ANGLE;
  const radius = Math.sqrt(idx) * SPIRAL_STEP;
  let x = Math.cos(angle) * radius;
  let z = Math.sin(angle) * radius;

  const intensity = MathUtils.clamp(clampFinite(event.metrics.intensity, 0), 0, 1);
  const totalVolume = Math.max(0, clampFinite(event.metrics.totalVolume, 0, 0, 10_000_000));
  const averagePrice = Math.max(0, clampFinite(event.metrics.averagePrice, event.metrics.closePrice ?? 0, 0, 10_000_000));
  const tradeCount = Math.max(0, Math.round(clampFinite(event.metrics.tradeCount, 0, 0, 10_000_000)));
  const usdDerived = deriveUsdNotional(event, totalVolume, averagePrice);
  const usdNotional = Math.max(1, clampFinite(usdDerived.usdNotional, 1, 1, 10_000_000_000_000));
  const logUsd = Math.log10(usdNotional);

  const ema = state.ema;
  if (!ema.initialized) {
    ema.initialized = true;
    ema.meanLogUsd = logUsd;
    ema.varLogUsd = Math.max(0.12, EMA_STD_EPS * EMA_STD_EPS);
    ema.meanI = intensity;
    ema.varI = Math.max(0.02, EMA_STD_EPS * EMA_STD_EPS);
    ema.meanAbsImb = Math.abs(clampFinite(event.metrics.imbalance, 0));
    ema.varAbsImb = Math.max(0.03, EMA_STD_EPS * EMA_STD_EPS);
  }

  const preMeanLogUsd = ema.meanLogUsd;
  const preStdLogUsd = emaStd(ema.varLogUsd);
  const seenCount = state.towers.length;
  const warmupT = MathUtils.clamp((seenCount - 12) / 48, 0, 1);
  const scoreStdFloor = MathUtils.lerp(0.95, 0.38, warmupT);
  const stdForUsdScore = Math.max(preStdLogUsd, scoreStdFloor);
  const preMeanI = ema.meanI;
  const preStdI = emaStd(ema.varI);
  const preMeanAbsImb = ema.meanAbsImb;
  const preStdAbsImb = emaStd(ema.varAbsImb);

  const zUsdRaw = (logUsd - preMeanLogUsd) / stdForUsdScore;
  const zUsd = MathUtils.clamp(zUsdRaw, Z_USD_MIN, Z_USD_MAX);
  const zI = MathUtils.clamp((intensity - preMeanI) / preStdI, ZI_MIN, ZI_MAX);
  const distSigmoid = sigmoid01(zUsd * USD_SIGMOID_K);
  const scoreUsdDist = Math.pow(smoothstep01(distSigmoid), USD_DIST_SCORE_GAMMA);
  const anchorU = remapClamped(logUsd, Math.log10(USD_ANCHOR_LOW), Math.log10(USD_ANCHOR_HIGH));
  const distBlend = MathUtils.lerp(0.12, USD_DISTRIBUTION_BLEND, warmupT);
  const scoreUsd = MathUtils.clamp(MathUtils.lerp(anchorU, scoreUsdDist, distBlend), 0, 1);
  const scoreI = smoothstep01(remapClamped(zI, ZI_MIN, ZI_MAX));

  // Geometry (height/footprint) must remain primarily USD-monotonic.
  // Pull low/mid events toward the anchored USD score so local EMA rarity cannot let $22k beat $41k.
  const geomAnchorPull = MathUtils.lerp(
    GEOMETRY_ANCHOR_PULL_LOW,
    GEOMETRY_ANCHOR_PULL_HIGH,
    smoothstep01(anchorU)
  );
  const geomAnchorHeadroom = MathUtils.lerp(
    GEOMETRY_ANCHOR_HEADROOM_MIN,
    GEOMETRY_ANCHOR_HEADROOM_MAX,
    Math.pow(anchorU, 0.75)
  );
  const scoreUsdGeom = MathUtils.clamp(
    Math.min(MathUtils.lerp(scoreUsd, anchorU, geomAnchorPull), anchorU + geomAnchorHeadroom),
    0,
    1
  );

  let score = scoreUsdGeom;
  if (scoreUsdGeom > 0.86) {
    score += 0.08 * ((scoreUsdGeom - 0.86) / 0.14);
  }
  score = MathUtils.clamp(score, 0, 1);

  let height = MathUtils.clamp(MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * Math.pow(score, HEIGHT_GAMMA), MIN_HEIGHT, MAX_HEIGHT);
  // Height-only suppression for low/mid anchor towers so ~$40k does not read too close to ~$600k+.
  // Width stays mapped to score; only vertical prominence is reduced for lower anchored USD ranges.
  const midHeightAnchorT = smoothstep01(remapClamped(anchorU, MID_HEIGHT_ANCHOR_START, MID_HEIGHT_ANCHOR_END));
  height *= MathUtils.lerp(MID_HEIGHT_SUPPRESS_MIN_MULT, 1, midHeightAnchorT);
  const topTailT = smoothstep01(
    remapClamped(
      Math.log10(Math.max(1, usdNotional)),
      Math.log10(TOP_TAIL_BOOST_START_USD),
      Math.log10(TOP_TAIL_BOOST_FULL_USD)
    )
  );
  if (topTailT > 0) {
    const tailCap = MathUtils.lerp(MAX_HEIGHT, TOP_TAIL_NORMAL_CAP_MAX, topTailT);
    height = Math.min(tailCap, height * MathUtils.lerp(1, TOP_TAIL_HEIGHT_MULT_MAX, topTailT));
  }
  const prevMaxUsdSeen = state.maxUsdSeen;
  const prevMaxHeightSeen = state.maxHeightSeen;
  const nearUsdRecord = prevMaxUsdSeen > 1 && usdNotional >= prevMaxUsdSeen * 0.92;
  const landmarkAbsEligible = usdNotional >= LANDMARK_MIN_USD;
  const landmarkRecordEligible = seenCount >= 18 && usdNotional >= LANDMARK_RECORD_MIN_USD && nearUsdRecord;
  const landmarkEligible =
    (landmarkAbsEligible && (zUsdRaw >= LANDMARK_Z_THRESHOLD || anchorU >= LANDMARK_ANCHOR_THRESHOLD)) || landmarkRecordEligible;
  if (landmarkEligible) {
    const landmarkT = Math.max(anchorU, MathUtils.clamp((zUsdRaw - 1.8) / 2.4, 0, 1), nearUsdRecord ? 0.7 : 0);
    const landmarkFloor = MathUtils.lerp(MAX_HEIGHT * 0.64, MAX_HEIGHT * 0.94, landmarkT);
    height = Math.max(height, landmarkFloor);
    if (nearUsdRecord && prevMaxHeightSeen > 0) {
      height = Math.max(height, Math.min(MAX_HEIGHT, Math.max(MAX_HEIGHT * 0.72, prevMaxHeightSeen * 0.82)));
    }
  }

  const dominance = MathUtils.clamp(clampFinite(event.metrics.imbalance, 0), -1, 1);
  const imbalance = Math.abs(dominance);
  const dominance01 = (dominance + 1) * 0.5;
  const glow = BTC_SELL_WARM.clone().lerp(BTC_PALE_AMBER, 0.38).lerp(BTC_ORANGE, dominance01);
  const core = CORE_GRAPHITE.clone().lerp(CORE_GRAPHITE_HI, 0.2 + imbalance * 0.22);
  let glowStrength = MathUtils.clamp(0.7 + intensity * 0.45 + imbalance * 0.55, 0.75, 1.55);
  let bandCount = (2 + Math.min(2, Math.floor(imbalance * 3))) as 2 | 3 | 4;
  let capGlowBoost = MathUtils.lerp(0.9, 1.35, Math.pow(score, 1.05));
  const heroRoll = hash01(event.sequence, 1901);
  const heroCandidate = scoreUsd > HERO_SCORE_MIN && usdNotional >= HERO_MIN_USD && anchorU > 0.6;
  const heroProb = HERO_PROB_BASE;
  const heroRollHit = heroCandidate && heroRoll < heroProb;
  const heroGuarantee =
    heroCandidate &&
    state.towersSinceHero >= HERO_GUARANTEE_GAP &&
    state.heroEligibleSinceLast >= HERO_GUARANTEE_MIN_ELIGIBLE;
  const isHero = heroRollHit || heroGuarantee;
  const heroMode: 'none' | 'roll' | 'guarantee' = heroRollHit ? 'roll' : heroGuarantee ? 'guarantee' : 'none';
  const heroUsdT = smoothstep01(
    remapClamped(
      logUsd,
      Math.log10(HERO_USD_SCALE_START),
      Math.log10(HERO_USD_SCALE_FULL)
    )
  );
  const heroHeightScale = MathUtils.lerp(HERO_HEIGHT_SCALE_MIN, 1, heroUsdT);
  const heroBaseScale = MathUtils.lerp(HERO_BASE_SCALE_MIN, 1, heroUsdT);
  const heroMultRaw = isHero
    ? MathUtils.lerp(HERO_HEIGHT_MULT_MIN, HERO_HEIGHT_MULT_MAX, hash01(event.sequence, 1907))
    : 1;
  const heroBaseMultRaw = isHero ? MathUtils.lerp(HERO_BASE_MULT_MIN, HERO_BASE_MULT_MAX, hash01(event.sequence, 1913)) : 1;
  const heroMult = isHero ? 1 + (heroMultRaw - 1) * heroHeightScale : 1;
  const heroBaseMult = isHero ? 1 + (heroBaseMultRaw - 1) * heroBaseScale : 1;
  const heroUsdCap = MathUtils.lerp(HERO_USD_CAP_MIN, HERO_MAX_HEIGHT, heroUsdT);
  height = MathUtils.clamp(height * heroMult, MIN_HEIGHT, isHero ? heroUsdCap : HERO_MAX_HEIGHT);

  // Keep million+ towers USD-monotonic despite hero randomness:
  // higher USD gets deterministic minimum prominence and lower USD cannot exceed its USD cap.
  const topMonoFloorT = smoothstep01(
    remapClamped(
      Math.log10(Math.max(1, usdNotional)),
      Math.log10(TOP_MONO_FLOOR_START_USD),
      Math.log10(TOP_MONO_FLOOR_FULL_USD)
    )
  );
  if (topMonoFloorT > 0) {
    const monoFloor = MathUtils.lerp(TOP_MONO_FLOOR_MIN, TOP_MONO_FLOOR_MAX, topMonoFloorT);
    height = Math.max(height, monoFloor);
  }
  const topMonoCapT = smoothstep01(
    remapClamped(
      Math.log10(Math.max(1, usdNotional)),
      Math.log10(TOP_MONO_CAP_START_USD),
      Math.log10(TOP_MONO_CAP_FULL_USD)
    )
  );
  if (topMonoCapT > 0) {
    const monoCap = MathUtils.lerp(TOP_MONO_CAP_MIN, HERO_MAX_HEIGHT, topMonoCapT);
    height = Math.min(height, monoCap);
  }

  // Height-only compression for very small USD events. Keep width/footprint intact,
  // but make tiny notionals read as clearly minor buildings while staying above tree scale.
  if (!isHero && usdNotional < SMALL_HEIGHT_FADE_OUT_USD) {
    const smallUsdT = remapClamped(
      Math.log10(Math.max(1, usdNotional)),
      Math.log10(SMALL_HEIGHT_FULL_EFFECT_USD),
      Math.log10(SMALL_HEIGHT_FADE_OUT_USD)
    );
    const heightMult = MathUtils.lerp(SMALL_HEIGHT_MULT_MIN, 1, Math.pow(smallUsdT, SMALL_HEIGHT_CURVE));
    height = Math.max(TOWER_VISUAL_MIN_HEIGHT, height * heightMult);
  }

  const shape = buildTowerShapeParams(event.sequence, score);
  if (topTailT > 0) {
    const tailBaseMult = MathUtils.lerp(1, TOP_TAIL_BASE_MULT_MAX, topTailT);
    shape.baseW = MathUtils.clamp(shape.baseW * tailBaseMult, MIN_BASE * 0.95, MAX_BASE * 2.35);
    shape.baseD = MathUtils.clamp(shape.baseD * tailBaseMult, MIN_BASE * 0.95, MAX_BASE * 2.35);
    shape.footprintX = MathUtils.clamp(shape.footprintX * tailBaseMult, MIN_BASE * 0.95, MAX_BASE * 2.2);
    shape.footprintZ = MathUtils.clamp(shape.footprintZ * tailBaseMult, MIN_BASE * 0.95, MAX_BASE * 2.2);
  }
  if (isHero) {
    shape.baseW = MathUtils.clamp(shape.baseW * heroBaseMult, MIN_BASE * 0.95, MAX_BASE * 2.35);
    shape.baseD = MathUtils.clamp(shape.baseD * heroBaseMult, MIN_BASE * 0.95, MAX_BASE * 2.35);
    shape.footprintX = MathUtils.clamp(shape.footprintX * heroBaseMult, MIN_BASE * 0.95, MAX_BASE * 2.2);
    shape.footprintZ = MathUtils.clamp(shape.footprintZ * heroBaseMult, MIN_BASE * 0.95, MAX_BASE * 2.2);
    shape.taper = MathUtils.clamp(shape.taper + 0.02 + hash01(event.sequence, 1931) * 0.05, 0, TAPER_MAX);
    shape.podiumRatio = MathUtils.clamp(shape.podiumRatio + 0.03, 0.1, 0.32);
    shape.crownRatio = MathUtils.clamp(shape.crownRatio + 0.02, 0.06, 0.2);
    glowStrength = MathUtils.clamp(glowStrength * 1.14, 0.75, 1.85);
    capGlowBoost *= 1.16;
    bandCount = (Math.min(4, bandCount + 1) as 2 | 3 | 4);
  }

  // Cheap deterministic local push-out to reduce overlap as footprints get wider.
  if (state.towers.length > 0) {
    const thisMaxBaseRaw = Math.max(shape.baseW, shape.baseD, shape.footprintX, shape.footprintZ);
    const baseJumboT = MathUtils.clamp((thisMaxBaseRaw - JUMBO_BASE_THRESHOLD) / 2.2, 0, 1);
    const tallJumboT = remapClamped(height, 30, 72);
    const jumboT = Math.max(baseJumboT, tallJumboT, isHero ? 1 : 0);
    const thisCollisionBase =
      thisMaxBaseRaw * (PLACEMENT_COLLISION_ENVELOPE_BASE + jumboT * PLACEMENT_COLLISION_ENVELOPE_JUMBO_EXTRA);
    const thisRBase = thisCollisionBase * MathUtils.lerp(0.72, 0.92, jumboT) + height * MathUtils.lerp(0, 0.016, jumboT);
    const reserveRadialPush =
      jumboT > 0
        ? (MathUtils.lerp(0.6, JUMBO_RESERVE_PUSH_MAX, jumboT) + height * 0.022 * jumboT) *
          MathUtils.lerp(0.8, 1.1, hash01(event.sequence, 1949))
        : 0;

    // Large landmarks effectively "take two spots": pre-push them outward before the collision solve.
    if (reserveRadialPush > 0) {
      const radialLen0 = Math.max(0.0001, Math.hypot(x, z));
      x += (x / radialLen0) * reserveRadialPush;
      z += (z / radialLen0) * reserveRadialPush;
    }

    const sampleCount = jumboT > 0.08 ? state.towers.length : Math.min(24, state.towers.length);
    const solvePasses = jumboT > 0.08 ? 5 : 2;
    for (let pass = 0; pass < solvePasses; pass++) {
      const radialLen = Math.max(0.0001, Math.hypot(x, z));
      const dirX = x / radialLen;
      const dirZ = z / radialLen;
      let pushX = 0;
      let pushZ = 0;

      for (let i = 0; i < sampleCount; i++) {
        const other = state.towers[state.towers.length - 1 - i];
        if (!other) continue;
        const dx = x - other.x;
        const dz = z - other.z;
        const dist = Math.hypot(dx, dz);
        const invDist = dist > 0.0001 ? 1 / dist : 0;
        const nX = invDist > 0 ? dx * invDist : dirX;
        const nZ = invDist > 0 ? dz * invDist : dirZ;

        const otherMaxBaseRaw = Math.max(other.baseW, other.baseD, other.footprintX, other.footprintZ);
        const otherTallT = remapClamped(other.height, 30, 72);
        const otherJumboT = Math.max(
          MathUtils.clamp((otherMaxBaseRaw - JUMBO_BASE_THRESHOLD) / 2.2, 0, 1),
          otherTallT,
          other.isHero ? 1 : 0
        );
        const otherCollisionBase =
          otherMaxBaseRaw * (PLACEMENT_COLLISION_ENVELOPE_BASE + otherJumboT * PLACEMENT_COLLISION_ENVELOPE_JUMBO_EXTRA);
        const otherR =
          otherCollisionBase * (other.isHero ? 0.78 : 0.68) +
          other.height * MathUtils.lerp(0, 0.014, Math.max(otherTallT, other.isHero ? 1 : 0));
        const pairJumboT = Math.max(
          jumboT,
          MathUtils.clamp((otherMaxBaseRaw - JUMBO_BASE_THRESHOLD) / 2.2, 0, 1),
          otherTallT,
          other.isHero ? 1 : 0
        );
        const pairTallT = Math.max(tallJumboT, otherTallT);
        const bothTallT = Math.min(tallJumboT, otherTallT);
        const dynamicPad = 0.38 + pairJumboT * JUMBO_CLEARANCE_PAD_MAX + pairTallT * 0.45 + bothTallT * 0.42;
        const minDist = otherR + thisRBase + dynamicPad;
        if (dist < minDist) {
          const overlap = minDist - dist + 0.07;
          // Hybrid push keeps spiral character (radial bias) while opening a real local pocket.
          const awayBias = 0.68 + pairJumboT * 0.18;
          const radialBias = 0.32 - pairJumboT * 0.12;
          pushX += (nX * awayBias + dirX * radialBias) * overlap;
          pushZ += (nZ * awayBias + dirZ * radialBias) * overlap;
        }
      }

      if (state.parks.length > 0) {
        const parkSample = jumboT > 0.08 ? state.parks.length : Math.min(12, state.parks.length);
        for (let i = 0; i < parkSample; i++) {
          const park = state.parks[state.parks.length - 1 - i];
          if (!park) continue;
          const dx = x - park.x;
          const dz = z - park.z;
          const dist = Math.hypot(dx, dz);
          const invDist = dist > 0.0001 ? 1 / dist : 0;
          const nX = invDist > 0 ? dx * invDist : dirX;
          const nZ = invDist > 0 ? dz * invDist : dirZ;
          const parkR = Math.max(park.w, park.d) * 0.6;
          const minDist = parkR + thisRBase + 0.54 + jumboT * 0.7;
          if (dist < minDist) {
            const overlap = minDist - dist + 0.09;
            pushX += (nX * 0.72 + dirX * 0.18) * overlap;
            pushZ += (nZ * 0.72 + dirZ * 0.18) * overlap;
          }
        }
      }

      const pushLen = Math.hypot(pushX, pushZ);
      if (pushLen < 0.0001) break;
      const maxStep = MathUtils.lerp(0.45, 3.6, jumboT);
      const stepScale = Math.min(1, maxStep / pushLen);
      x += pushX * stepScale;
      z += pushZ * stepScale;
    }

    // Final exact-ish separation pass also runs for normal towers if they end up too close to a jumbo neighbor.
    const hardSeparationPasses = jumboT > 0.12 ? 2 : 1;
    for (let pass = 0; pass < hardSeparationPasses; pass++) {
        let moved = false;
        const radialLen = Math.max(0.0001, Math.hypot(x, z));
        const dirX = x / radialLen;
        const dirZ = z / radialLen;
        for (let i = 0; i < state.towers.length; i++) {
          const other = state.towers[i];
          if (!other) continue;
          const dx = x - other.x;
          const dz = z - other.z;
          const dist = Math.hypot(dx, dz);
          const invDist = dist > 0.0001 ? 1 / dist : 0;
          const nX = invDist > 0 ? dx * invDist : dirX;
          const nZ = invDist > 0 ? dz * invDist : dirZ;
          const otherMaxBaseRaw = Math.max(other.baseW, other.baseD, other.footprintX, other.footprintZ);
          const otherTallT = remapClamped(other.height, 30, 72);
          const otherJumboT = Math.max(
            MathUtils.clamp((otherMaxBaseRaw - JUMBO_BASE_THRESHOLD) / 2.2, 0, 1),
            otherTallT,
            other.isHero ? 1 : 0
          );
          const pairJumboT = Math.max(jumboT, otherTallT, other.isHero ? 1 : 0, otherJumboT);
          if (pairJumboT < 0.18) continue;
          const otherCollisionBase =
            otherMaxBaseRaw * (PLACEMENT_COLLISION_ENVELOPE_BASE + otherJumboT * PLACEMENT_COLLISION_ENVELOPE_JUMBO_EXTRA);
          const otherR =
            otherCollisionBase * (other.isHero ? 0.78 : 0.68) +
            other.height * MathUtils.lerp(0, 0.014, Math.max(otherTallT, other.isHero ? 1 : 0));
          const pairTallT = Math.max(tallJumboT, otherTallT);
          const bothTallT = Math.min(tallJumboT, otherTallT);
          const hardMinDist =
            otherR + thisRBase + (0.46 + pairJumboT * (JUMBO_CLEARANCE_PAD_MAX + 0.12) + pairTallT * 0.5 + bothTallT * 0.48);
          if (dist < hardMinDist) {
            const overlap = hardMinDist - dist + 0.03;
            x += nX * overlap;
            z += nZ * overlap;
            moved = true;
          }
        }
        if (!moved) break;
    }
  }

  const nextLogUsd = updateEma(ema.meanLogUsd, ema.varLogUsd, logUsd, EMA_ALPHA_LOGUSD);
  ema.meanLogUsd = nextLogUsd.mean;
  ema.varLogUsd = nextLogUsd.variance;
  const nextI = updateEma(ema.meanI, ema.varI, intensity, EMA_ALPHA_INT);
  ema.meanI = nextI.mean;
  ema.varI = nextI.variance;
  const nextImb = updateEma(ema.meanAbsImb, ema.varAbsImb, imbalance, EMA_ALPHA_INT);
  ema.meanAbsImb = nextImb.mean;
  ema.varAbsImb = nextImb.variance;

  const zImb = MathUtils.clamp((imbalance - preMeanAbsImb) / preStdAbsImb, ZI_MIN, ZI_MAX);
  const scoreImb = smoothstep01(remapClamped(zImb, ZI_MIN, ZI_MAX));
  const moodRaw = MathUtils.clamp(scoreUsd * 0.48 + scoreI * 0.3 + scoreImb * 0.22, 0, 1);
  const moodShaped = smoothstep01(Math.pow(moodRaw, 0.92));
  state.marketMoodRaw = moodRaw;
  state.marketMoodTarget = MathUtils.clamp(MathUtils.lerp(state.marketMoodTarget, moodShaped, 0.42), 0, 1);

  state.latestHeightDebug = {
    sequence: event.sequence,
    totalVolume,
    usdNotional,
    usdSource: usdDerived.source,
    logUsd,
    intensity,
    zUsd: zUsdRaw,
    anchorU,
    scoreUsdDist,
    scoreUsd,
    scoreI,
    score,
    height,
    isHero,
    heroMult,
    heroMode,
    baseW: shape.baseW,
    baseD: shape.baseD,
    meanLogUsd: preMeanLogUsd,
    stdLogUsd: preStdLogUsd,
    meanI: ema.meanI,
    stdI: emaStd(ema.varI)
  };

  state.towersSinceHero += 1;
  if (heroCandidate) state.heroEligibleSinceLast += 1;
  if (isHero) {
    state.towersSinceHero = 0;
    state.heroEligibleSinceLast = 0;
  }
  state.maxUsdSeen = Math.max(state.maxUsdSeen, usdNotional);
  state.maxHeightSeen = Math.max(state.maxHeightSeen, height);

  return {
    sequence: event.sequence,
    x,
    z,
    height,
    archetypeId: shape.archetypeId,
    baseW: shape.baseW,
    baseD: shape.baseD,
    footprintX: shape.footprintX,
    footprintZ: shape.footprintZ,
    taper: shape.taper,
    podiumRatio: shape.podiumRatio,
    crownRatio: shape.crownRatio,
    coreColor: `#${core.getHexString()}`,
    glowColor: `#${glow.getHexString()}`,
    glowStrength,
    bandCount,
    heightScore: score,
    isHero,
    heroMult,
    capGlowBoost,
    heroMode,
    intensity,
    imbalance,
    districtId: 0,
    districtAccentColor: '#f4ead6',
    btcVolume: totalVolume,
    usdNotional,
    usdSource: usdDerived.source,
    logUsd,
    usdAnchorU: anchorU,
    usdScoreDist: scoreUsdDist,
    averagePrice,
    tradeCount,
    windowStart: event.windowStart,
    windowEnd: event.windowEnd,
    emittedAt: Math.max(0, clampFinite(event.emittedAt, Date.now()))
  };
}

function useAppendOnlyTowers(events: BlockEvent[]) {
  const accumRef = useRef<AccumState>(createEmptyAccum());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const state = accumRef.current;

    if (events.length === 0) {
      if (state.lastSequence > 0) {
        accumRef.current = createEmptyAccum();
        setVersion((v) => v + 1);
      }
      return;
    }

    const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
    let appended = false;

    if (state.lastSequence > 0 && ordered[ordered.length - 1]?.sequence < state.lastSequence && ordered.length < 8) {
      accumRef.current = createEmptyAccum();
    }

    const target = accumRef.current;
    for (const event of ordered) {
      if (target.processedSequences.has(event.sequence)) continue;
      const tower = mapEventToTower(event, target);
      const processedCount = target.processedSequences.size + 1;
      const parkEligible =
        ENABLE_PARKS_V2 &&
        target.parks.length < MAX_PARKS_VISIBLE &&
        processedCount >= Math.max(8, target.nextParkAtCount) &&
        !tower.isHero &&
        tower.height < target.tallestTowerHeight * 0.92;
      if (parkEligible) {
        const placedPark = appendParkAtTowerSlot(target, tower, tower.sequence);
        target.processedSequences.add(event.sequence);
        target.lastSequence = Math.max(target.lastSequence, event.sequence);
        target.bounds.radius = Math.max(target.bounds.radius, Math.hypot(tower.x, tower.z) + 8);
        target.nextParkAtCount = processedCount + nextParkInterval(event.sequence);
        if (placedPark) {
          appended = true;
          continue;
        }
      }
      ensureDistrictForNextTower(target, tower);
      target.towers.push(tower);
      appendTracesForNewTower(target, tower);
      if (ENABLE_SHOCKWAVES) {
        const dir = MathUtils.clamp(clampFinite(event.metrics.imbalance, 0), -1, 1);
        pushShockwave(target, tower, dir >= 0 ? '#ffb566' : '#d29a62');
      }
      target.processedSequences.add(event.sequence);
      target.lastSequence = Math.max(target.lastSequence, event.sequence);
      target.bounds.radius = Math.max(target.bounds.radius, Math.hypot(tower.x, tower.z) + 8);
      target.bounds.maxY = Math.max(target.bounds.maxY, tower.height + 2.5);
      let recordChanged = false;
      if (
        target.tallestTowerSequence == null ||
        tower.height > target.tallestTowerHeight ||
        (Math.abs(tower.height - target.tallestTowerHeight) < 0.0001 && tower.sequence > (target.tallestTowerSequence ?? 0))
      ) {
        target.tallestTowerSequence = tower.sequence;
        target.tallestTowerHeight = tower.height;
        recordChanged = true;
      }
      if (recordChanged) pushRecordCeremony(target, tower);
      appendArteriesForNewTower(target, tower);
      appended = true;
    }

    if (appended) {
      setVersion((v) => v + 1);
    }
  }, [events]);

  return {
    version,
    towers: accumRef.current.towers,
    traces: accumRef.current.traces,
    arterialTraces: accumRef.current.arterialTraces,
    trafficParticles: accumRef.current.trafficParticles,
    arterialTrafficParticles: accumRef.current.arterialTrafficParticles,
    parks: accumRef.current.parks,
    parkTrees: accumRef.current.parkTrees,
    districts: accumRef.current.districts,
    shockwaves: accumRef.current.shockwaves,
    recordCeremonies: accumRef.current.recordCeremonies,
    bounds: accumRef.current.bounds,
    marketMoodTarget: accumRef.current.marketMoodTarget,
    latestHeightDebug: accumRef.current.latestHeightDebug,
    tallestTowerSequence: accumRef.current.tallestTowerSequence,
    tallestTowerHeight: accumRef.current.tallestTowerHeight,
    parksAttempted: accumRef.current.parksAttempted,
    parksPlaced: accumRef.current.parksPlaced,
    lastParkSkipReason: accumRef.current.lastParkSkipReason
  };
}

type TopCoinsDebugOverlay = {
  asOfMs: number;
  asOfIso: string;
  symbols: number;
  fetchedAt: number;
  lastHash: string;
  refreshAgeSec: number;
  lastError: string | null;
  lastFetchOk: boolean;
  logosMissing: number;
  logosAttempted: number;
  logosDownloaded: number;
  layoutIters: number;
  minSeparation: number;
  overlapFix: 'ok' | 'iterating';
  topGainer: { symbol: string; pct: number };
  topLoser: { symbol: string; pct: number };
  topVolume: { symbol: string; quoteVolume: number };
};

type TopCoinSymbolState = {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  sequence: number;
  districtId: number;
  x: number;
  z: number;
  xTarget: number;
  zTarget: number;
  rank: number;
  emittedAt: number;
  active: boolean;
  height: number;
  heightTarget: number;
  base: number;
  baseTarget: number;
  pct: number;
  pctTarget: number;
  quoteVolume: number;
  quoteVolumeTarget: number;
  lastPrice: number;
  lastPriceTarget: number;
  glowStrength: number;
  glowStrengthTarget: number;
  opacity: number;
  opacityTarget: number;
  smoothAlpha: number;
  isTopGainer: boolean;
  isTopLoser: boolean;
  isTopVolume: boolean;
  logoPath: string | null;
};

const TOP_COINS_DISTRICT_COUNT = 10;
const TOP_COINS_DISTRICT_TINTS = [
  '#f2dfbf',
  '#efd8b8',
  '#ead1b2',
  '#e6c9ab',
  '#e2c2a5',
  '#dec3b0',
  '#d9bcaa',
  '#d4b7a4',
  '#cfb09d',
  '#caa997'
];
const TOP_HEIGHT_SEA_LEVEL = 14;
const TOP_HEIGHT_POSITIVE_RANGE = 42;
const TOP_HEIGHT_NEGATIVE_RANGE = 9.4;
const TOP_LAYOUT_PADDING = 1.4;
const TOP_LAYOUT_INITIAL_ITERS = 64;
const TOP_LAYOUT_REFRESH_ITERS = 20;
const TOP_LAYOUT_SLOT_RING = 3;
const TOP_LAYOUT_INNER_RADIUS = 22;
const TOP_LAYOUT_RING_STEP = 8.6;
const TOP_LAYOUT_EDGE_PAD = 5.2;

type TopCoinsLayoutNode = {
  symbol: string;
  districtId: number;
  radius: number;
  x: number;
  z: number;
};

type TopCoinsLayoutResult = {
  targets: Map<string, { districtId: number; x: number; z: number }>;
  layoutIters: number;
  minSeparation: number;
  overlapFix: 'ok' | 'iterating';
  cityRadius: number;
};

type TopCoinsParkTower = ParkTowerCollisionTarget & {
  sequence: number;
  height: number;
};

type TopCoinsParkResult = {
  parks: ParkDatum[];
  trees: ParkTreeDatum[];
};

function hashString32(value: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hashUnitString(value: string, salt: number) {
  const h = hashString32(`${value}:${salt}`);
  return (h % 1_000_000) / 1_000_000;
}

function normalizeAnglePositive(angle: number) {
  const twoPi = Math.PI * 2;
  let out = angle % twoPi;
  if (out < 0) out += twoPi;
  return out;
}

function districtAngles(districtId: number) {
  const wedge = (Math.PI * 2) / TOP_COINS_DISTRICT_COUNT;
  const start = districtId * wedge;
  const end = start + wedge;
  return { wedge, start, end, center: start + wedge * 0.5 };
}

function clampNodeToDistrict(node: TopCoinsLayoutNode, cityRadius: number) {
  const { wedge, start, end } = districtAngles(node.districtId);
  const inset = wedge * 0.08;
  const minA = start + inset;
  const maxA = end - inset;
  let angle = normalizeAnglePositive(Math.atan2(node.z, node.x));
  angle = MathUtils.clamp(angle, minA, maxA);
  const minRadius = TOP_LAYOUT_INNER_RADIUS * 0.68;
  const maxRadius = Math.max(minRadius + 2, cityRadius - TOP_LAYOUT_EDGE_PAD);
  const radius = MathUtils.clamp(Math.hypot(node.x, node.z), minRadius, maxRadius);
  node.x = Math.cos(angle) * radius;
  node.z = Math.sin(angle) * radius;
}

function estimateTopCoinFootprintRadius(symbol: string, baseTarget: number) {
  const baseAspect = MathUtils.lerp(0.82, 1.24, hashUnitString(symbol, 13));
  const sqrtAspect = Math.sqrt(baseAspect);
  const baseW = MathUtils.clamp(baseTarget * sqrtAspect, 0.82, 6.2);
  const baseD = MathUtils.clamp(baseTarget / sqrtAspect, 0.82, 6.2);
  return 0.5 * Math.hypot(baseW, baseD);
}

function buildTopCoinsLayoutTargets({
  items,
  states,
  baseBySymbol
}: {
  items: Array<{ symbol: string; rank: number }>;
  states: Map<string, TopCoinSymbolState>;
  baseBySymbol: Map<string, number>;
}): TopCoinsLayoutResult {
  const groups = new Map<number, Array<{ symbol: string; rank: number }>>();
  for (const item of items) {
    const districtId = hashString32(item.symbol) % TOP_COINS_DISTRICT_COUNT;
    const list = groups.get(districtId) ?? [];
    list.push(item);
    groups.set(districtId, list);
  }

  const nodes: TopCoinsLayoutNode[] = [];
  for (let districtId = 0; districtId < TOP_COINS_DISTRICT_COUNT; districtId++) {
    const list = (groups.get(districtId) ?? []).sort((a, b) => a.rank - b.rank || a.symbol.localeCompare(b.symbol));
    const { wedge, center } = districtAngles(districtId);
    for (let idx = 0; idx < list.length; idx++) {
      const item = list[idx];
      const ring = Math.floor(idx / TOP_LAYOUT_SLOT_RING);
      const slot = idx % TOP_LAYOUT_SLOT_RING;
      const laneSlots = Math.max(TOP_LAYOUT_SLOT_RING, TOP_LAYOUT_SLOT_RING + ring * 2);
      const localU = ((slot + 0.5) / laneSlots - 0.5) * 2;
      const angle = center + localU * (wedge * Math.max(0.36, 0.78 - ring * 0.03));
      const radius = TOP_LAYOUT_INNER_RADIUS + ring * TOP_LAYOUT_RING_STEP + (hashUnitString(item.symbol, 41) - 0.5) * 1.4;
      const xNominal = Math.cos(angle) * radius;
      const zNominal = Math.sin(angle) * radius;
      const baseTarget = baseBySymbol.get(item.symbol) ?? 1.2;
      const footprintRadius = estimateTopCoinFootprintRadius(item.symbol, baseTarget);
      const prev = states.get(item.symbol);
      nodes.push({
        symbol: item.symbol,
        districtId,
        radius: footprintRadius,
        x: prev?.xTarget ?? prev?.x ?? xNominal,
        z: prev?.zTarget ?? prev?.z ?? zNominal
      });
    }
  }

  const maxNominalRadius = nodes.reduce((acc, node) => Math.max(acc, Math.hypot(node.x, node.z) + node.radius), 0);
  let cityRadius = Math.max(72, maxNominalRadius + 16 + Math.sqrt(Math.max(1, nodes.length)) * 0.55);

  const dispX = new Array(nodes.length).fill(0);
  const dispZ = new Array(nodes.length).fill(0);
  const hasExisting = states.size > 0;
  const baseIterations = hasExisting ? TOP_LAYOUT_REFRESH_ITERS : TOP_LAYOUT_INITIAL_ITERS;
  let minSeparation = Number.POSITIVE_INFINITY;
  let overlapFix: 'ok' | 'iterating' = 'iterating';
  let layoutIters = 0;

  for (let attempt = 0; attempt < 6; attempt++) {
    for (const node of nodes) {
      clampNodeToDistrict(node, cityRadius);
    }

    const iterations = baseIterations + attempt * 8;
    for (let iter = 0; iter < iterations; iter++) {
      dispX.fill(0);
      dispZ.fill(0);
      let overlapCount = 0;
      let minSepIter = Number.POSITIVE_INFINITY;

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const dist = Math.hypot(dx, dz);
          const minDist = a.radius + b.radius + TOP_LAYOUT_PADDING;
          minSepIter = Math.min(minSepIter, dist - minDist);
          if (dist >= minDist) continue;

          overlapCount += 1;
          const push = (minDist - dist) * 0.5;
          let nx = 0;
          let nz = 0;
          if (dist > 0.0001) {
            nx = dx / dist;
            nz = dz / dist;
          } else {
            const aSeed = hashUnitString(`${a.symbol}|${b.symbol}`, 9071) * Math.PI * 2;
            nx = Math.cos(aSeed);
            nz = Math.sin(aSeed);
          }

          dispX[i] -= nx * push;
          dispZ[i] -= nz * push;
          dispX[j] += nx * push;
          dispZ[j] += nz * push;
        }
      }

      minSeparation = minSepIter;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        node.x += dispX[i] * 0.85;
        node.z += dispZ[i] * 0.85;
        clampNodeToDistrict(node, cityRadius);
      }

      layoutIters += 1;
      if (overlapCount === 0 && iter >= 2) {
        overlapFix = 'ok';
        break;
      }
    }

    if (minSeparation >= -0.01) {
      overlapFix = 'ok';
      break;
    }

    cityRadius *= 1.12;
  }

  if (!Number.isFinite(minSeparation)) minSeparation = 0;

  const targets = new Map<string, { districtId: number; x: number; z: number }>();
  for (const node of nodes) {
    targets.set(node.symbol, {
      districtId: node.districtId,
      x: node.x,
      z: node.z
    });
  }

  return {
    targets,
    layoutIters,
    minSeparation,
    overlapFix,
    cityRadius
  };
}

function buildTopCoinsDecorativeParks({
  towers,
  cityRadius
}: {
  towers: TopCoinsParkTower[];
  cityRadius: number;
}): TopCoinsParkResult {
  const parks: ParkDatum[] = [];
  const trees: ParkTreeDatum[] = [];
  if (!ENABLE_PARKS_V2 || towers.length < 20) {
    return { parks, trees };
  }

  const desiredParks = Math.min(MAX_PARKS_VISIBLE, Math.max(2, Math.round(towers.length / 44)));
  const attemptsMax = desiredParks * 40;
  const now = Date.now();

  for (let attempt = 0; attempt < attemptsMax && parks.length < desiredParks; attempt++) {
    const seed = 81_001 + attempt * 137;
    const angle = hash01(seed, 1) * Math.PI * 2;
    const radialN = MathUtils.lerp(0.34, 0.9, hash01(seed, 3));
    const radialJitter = (hash01(seed, 5) - 0.5) * MathUtils.lerp(6, 14, radialN);
    const radial = Math.max(9, cityRadius * radialN + radialJitter);
    const x = Math.cos(angle) * radial;
    const z = Math.sin(angle) * radial;
    const w = MathUtils.lerp(4.8, 8.6, hash01(seed, 7));
    const d = MathUtils.lerp(4.4, 7.8, hash01(seed, 9));
    const yaw = hash01(seed, 11) * Math.PI;
    const radius = Math.max(w, d) * 0.58;

    if (Math.hypot(x, z) > cityRadius * 1.02) continue;

    let blocked = false;
    for (let i = 0; i < towers.length; i++) {
      if (parkConflictsTower(x, z, w, d, towers[i])) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    for (let i = 0; i < parks.length; i++) {
      if (parkConflictsPark(x, z, w, d, parks[i])) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    const patchColor = CORE_GRAPHITE.clone().lerp(CORE_GRAPHITE_HI, 0.48).lerp(BTC_ORANGE, 0.04);
    const edgeColor = BTC_SELL_WARM.clone().lerp(BTC_PALE_AMBER, 0.3).lerp(BTC_ORANGE, 0.22);
    const treeStart = trees.length;
    const requestedTreeCount = Math.max(
      10,
      Math.round(MathUtils.lerp(14, 30, hash01(seed, 13)) * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.72 : 1))
    );

    for (let i = 0; i < requestedTreeCount; i++) {
      let localX = 0;
      let localZ = 0;
      let hasPoint = false;
      for (let a = 0; a < 6; a++) {
        const px = (hash01(seed, i, a, 17) - 0.5) * (w * 0.82);
        const pz = (hash01(seed, i, a, 19) - 0.5) * (d * 0.82);
        if (Math.abs(px) < w * 0.13 && hash01(seed, i, a, 23) > 0.24) continue;
        if (Math.abs(pz) < d * 0.11 && hash01(seed, i, a, 29) > 0.72) continue;
        localX = px;
        localZ = pz;
        hasPoint = true;
        break;
      }
      if (!hasPoint) continue;

      const cs = Math.cos(yaw);
      const sn = Math.sin(yaw);
      const worldX = x + localX * cs - localZ * sn;
      const worldZ = z + localX * sn + localZ * cs;
      if (Math.hypot(worldX, worldZ) > cityRadius * 1.06) continue;

      trees.push({
        x: worldX,
        z: worldZ,
        yaw: hash01(seed, i, 31) * Math.PI * 2,
        trunkH: (() => {
          const tallRoll = hash01(seed, i, 37);
          const tallMul = tallRoll > 0.9 ? MathUtils.lerp(1.22, 1.58, hash01(seed, i, 41)) : tallRoll > 0.72 ? 1.1 : 1;
          return MathUtils.lerp(0.24, 0.56, hash01(seed, i, 43)) * tallMul;
        })(),
        crownH: (() => {
          const tallRoll = hash01(seed, i, 37);
          const tallMul = tallRoll > 0.9 ? MathUtils.lerp(1.16, 1.4, hash01(seed, i, 47)) : tallRoll > 0.72 ? 1.06 : 1;
          return MathUtils.lerp(0.46, 0.98, hash01(seed, i, 53)) * tallMul;
        })(),
        crownR: MathUtils.lerp(0.18, 0.42, hash01(seed, i, 59)) * MathUtils.lerp(0.9, 1.12, hash01(seed, i, 61)),
        tintMix: hash01(seed, i, 67)
      });
    }

    if (trees.length <= treeStart) continue;

    let linkX: number | null = null;
    let linkZ: number | null = null;
    let linkDistBest = Infinity;
    for (let i = 0; i < towers.length; i++) {
      const t = towers[i];
      const dist = Math.hypot(t.x - x, t.z - z);
      if (dist < linkDistBest) {
        linkDistBest = dist;
        linkX = t.x;
        linkZ = t.z;
      }
    }

    const treeCount = trees.length - treeStart;
    const fireflyCount = Math.max(4, Math.min(treeCount, Math.round(treeCount * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.45 : 0.8))));
    parks.push({
      id: `top-park-${parks.length}-${seed}`,
      x,
      z,
      w,
      d,
      yaw,
      patchColor: `#${patchColor.getHexString()}`,
      edgeColor: `#${edgeColor.getHexString()}`,
      seed,
      radius,
      fireflyCount,
      linkX,
      linkZ,
      emittedAt: now,
      treeStart,
      treeCount
    });
  }

  return { parks, trees };
}

function easeTowards(current: number, target: number, lambda: number, dtSec: number) {
  const t = 1 - Math.exp(-Math.max(0.001, lambda) * Math.max(0.0001, dtSec));
  return current + (target - current) * t;
}

function mapPctToHeight(pct: number, isTopGainer: boolean, isTopLoser: boolean) {
  // Signed tanh keeps movers symmetric around a neutral skyline level while preventing outlier spikes.
  const signedCurve = Math.sign(pct) * Math.tanh(Math.abs(pct) / 12);
  let height =
    TOP_HEIGHT_SEA_LEVEL +
    (signedCurve >= 0 ? signedCurve * TOP_HEIGHT_POSITIVE_RANGE : signedCurve * TOP_HEIGHT_NEGATIVE_RANGE);
  if (isTopGainer) height *= 1.18;
  if (isTopLoser) height *= 0.9;
  return MathUtils.clamp(height, TOWER_VISUAL_MIN_HEIGHT, HERO_MAX_HEIGHT);
}

function useTopCoinsSkyline(snapshot: TopCoinsSnapshot | null) {
  const statesRef = useRef<Map<string, TopCoinSymbolState>>(new Map());
  const tracesRef = useRef<TraceDatum[]>([]);
  const arterialTracesRef = useRef<TraceDatum[]>([]);
  const trafficRef = useRef<TrafficParticleDatum[]>([]);
  const arterialTrafficRef = useRef<TrafficParticleDatum[]>([]);
  const parksRef = useRef<ParkDatum[]>([]);
  const parkTreesRef = useRef<ParkTreeDatum[]>([]);
  const districtsRef = useRef<DistrictDatum[]>([]);
  const boundsRef = useRef<SandboxBounds>({ radius: 36, maxY: 42 });
  const moodRef = useRef(0.5);
  const moodTargetRef = useRef(0.5);
  const volatilityRef = useRef(0.25);
  const debugRef = useRef<TopCoinsDebugOverlay>({
    asOfMs: 0,
    asOfIso: '',
    symbols: 0,
    fetchedAt: 0,
    lastHash: 'none',
    refreshAgeSec: 0,
    lastError: null,
    lastFetchOk: false,
    logosMissing: 0,
    logosAttempted: 0,
    logosDownloaded: 0,
    layoutIters: 0,
    minSeparation: 0,
    overlapFix: 'ok',
    topGainer: { symbol: 'N/A', pct: 0 },
    topLoser: { symbol: 'N/A', pct: 0 },
    topVolume: { symbol: 'N/A', quoteVolume: 0 }
  });
  const shockwavesRef = useRef<ShockwaveDatum[]>(
    Array.from({ length: SHOCKWAVE_POOL_CAP }, () => ({
      serial: 0,
      active: false,
      originX: 0,
      originZ: 0,
      startTimeMs: 0,
      durationMs: 1100,
      startRadius: 0.5,
      maxRadius: 10,
      thickness: 0.06,
      color: '#f7931a',
      peakOpacity: 0.24
    }))
  );
  const shockwaveCursorRef = useRef(0);
  const shockwaveSerialRef = useRef(0);
  const recordCeremoniesRef = useRef<RecordCeremonyDatum[]>(
    Array.from({ length: RECORD_CEREMONY_POOL_CAP }, () => ({
      serial: 0,
      active: false,
      towerSequence: 0,
      x: 0,
      z: 0,
      towerHeight: 0,
      startTimeMs: 0,
      durationMs: 1300
    }))
  );
  const recordCeremonyCursorRef = useRef(0);
  const recordCeremonySerialRef = useRef(0);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const states = statesRef.current;

    if (!snapshot) {
      if (states.size > 0) {
        states.clear();
        tracesRef.current = [];
        arterialTracesRef.current = [];
        trafficRef.current = [];
        arterialTrafficRef.current = [];
        parksRef.current = [];
        parkTreesRef.current = [];
        districtsRef.current = [];
        boundsRef.current = { radius: 36, maxY: 42 };
        setVersion((v) => v + 1);
      }
      return;
    }

    const nextSymbols = new Set<string>();
    const topGainerSymbol = snapshot.stats.topGainer.symbol;
    const topLoserSymbol = snapshot.stats.topLoser.symbol;
    const topVolumeSymbol = snapshot.stats.topVolume.symbol;
    const maxQuoteVolume = Math.max(snapshot.stats.sessionMaxQuoteVolume, 1);
    const now = snapshot.emittedAt;
    const baseBySymbol = new Map<string, number>();

    for (let i = 0; i < snapshot.items.length; i++) {
      const item = snapshot.items[i];
      if (!item) continue;
      const volumeNorm = MathUtils.clamp(Math.log10(item.quoteVolume + 1) / Math.log10(maxQuoteVolume + 1), 0, 1);
      let baseTarget = MathUtils.lerp(0.74, 2.7, Math.pow(volumeNorm, 0.58));
      if (item.symbol === topVolumeSymbol) {
        baseTarget *= 1.08;
      }
      baseBySymbol.set(item.symbol, MathUtils.clamp(baseTarget, 0.74, 3.4));
    }

    const layout = buildTopCoinsLayoutTargets({
      items: snapshot.items.map((item, index) => ({
        symbol: item.symbol,
        rank: item.rank || index + 1
      })),
      states,
      baseBySymbol
    });

    let absPctSum = 0;
    for (let i = 0; i < snapshot.items.length; i++) {
      const item = snapshot.items[i];
      if (!item) continue;
      nextSymbols.add(item.symbol);
      absPctSum += Math.abs(item.priceChangePercent);

      const rank = item.rank || i + 1;
      const isTopGainer = item.symbol === topGainerSymbol;
      const isTopLoser = item.symbol === topLoserSymbol;
      const isTopVolume = item.symbol === topVolumeSymbol;
      const placement = layout.targets.get(item.symbol);
      const sequence = (hashString32(item.symbol) % 1_000_000) + 1;
      const prev = states.get(item.symbol);

      const volumeNorm = MathUtils.clamp(Math.log10(item.quoteVolume + 1) / Math.log10(maxQuoteVolume + 1), 0, 1);
      const nextHeight = mapPctToHeight(item.priceChangePercent, isTopGainer, isTopLoser);
      const nextBase = baseBySymbol.get(item.symbol) ?? MathUtils.lerp(0.74, 2.7, Math.pow(volumeNorm, 0.58));
      let nextGlowStrength = MathUtils.clamp(
        0.72 + volumeNorm * 0.78 + Math.min(0.42, Math.abs(item.priceChangePercent) * 0.012),
        0.72,
        1.95
      );
      if (isTopGainer) nextGlowStrength *= 1.16;
      if (isTopLoser) nextGlowStrength *= 0.98;
      if (isTopVolume) nextGlowStrength *= 1.12;

      const targetX = placement?.x ?? prev?.xTarget ?? prev?.x ?? 0;
      const targetZ = placement?.z ?? prev?.zTarget ?? prev?.z ?? 0;
      const districtId = placement?.districtId ?? prev?.districtId ?? (hashString32(item.symbol) % TOP_COINS_DISTRICT_COUNT);

      if (!prev) {
        states.set(item.symbol, {
          symbol: item.symbol,
          baseAsset: item.baseAsset,
          quoteAsset: item.quoteAsset,
          sequence,
          districtId,
          x: targetX,
          z: targetZ,
          xTarget: targetX,
          zTarget: targetZ,
          rank,
          emittedAt: now,
          active: true,
          height: nextHeight,
          heightTarget: nextHeight,
          base: nextBase,
          baseTarget: nextBase,
          pct: item.priceChangePercent,
          pctTarget: item.priceChangePercent,
          quoteVolume: item.quoteVolume,
          quoteVolumeTarget: item.quoteVolume,
          lastPrice: item.lastPrice,
          lastPriceTarget: item.lastPrice,
          glowStrength: nextGlowStrength,
          glowStrengthTarget: nextGlowStrength,
          opacity: 1,
          opacityTarget: 1,
          smoothAlpha: MathUtils.lerp(2.8, 5.0, hashUnitString(item.symbol, 933)),
          isTopGainer,
          isTopLoser,
          isTopVolume,
          logoPath: item.logoPath ?? null
        });
        continue;
      }

      const prevRank = prev.rank;
      if ((prevRank > 10 && rank <= 10) || (Math.abs(prevRank - rank) >= 28 && rank <= 24)) {
        const slot = shockwavesRef.current[shockwaveCursorRef.current % shockwavesRef.current.length];
        shockwaveCursorRef.current += 1;
        shockwaveSerialRef.current += 1;
        slot.serial = shockwaveSerialRef.current;
        slot.active = true;
        slot.originX = prev.x;
        slot.originZ = prev.z;
        slot.startTimeMs = performance.now();
        slot.durationMs = 1100;
        slot.startRadius = 0.46;
        slot.maxRadius = 13;
        slot.thickness = 0.06;
        slot.color = item.priceChangePercent >= 0 ? '#f9b563' : '#7aa6d9';
        slot.peakOpacity = 0.26;
      }

      prev.baseAsset = item.baseAsset;
      prev.quoteAsset = item.quoteAsset;
      prev.rank = rank;
      prev.active = true;
      prev.districtId = districtId;
      prev.xTarget = targetX;
      prev.zTarget = targetZ;
      prev.pctTarget = item.priceChangePercent;
      prev.quoteVolumeTarget = item.quoteVolume;
      prev.lastPriceTarget = item.lastPrice;
      prev.heightTarget = nextHeight;
      prev.baseTarget = nextBase;
      prev.glowStrengthTarget = nextGlowStrength;
      prev.opacityTarget = 1;
      prev.isTopGainer = isTopGainer;
      prev.isTopLoser = isTopLoser;
      prev.isTopVolume = isTopVolume;
      prev.logoPath = item.logoPath ?? null;
    }

    volatilityRef.current =
      snapshot.items.length > 0
        ? MathUtils.clamp((absPctSum / snapshot.items.length) / 6, 0.15, 1.2)
        : 0.2;

    for (const [symbol, state] of states) {
      if (nextSymbols.has(symbol)) continue;
      state.active = false;
      state.opacityTarget = 0;
      state.rank = 999;
    }

    const topGainerState = states.get(topGainerSymbol);
    if (topGainerState) {
      const slot = recordCeremoniesRef.current[recordCeremonyCursorRef.current % recordCeremoniesRef.current.length];
      recordCeremonyCursorRef.current += 1;
      recordCeremonySerialRef.current += 1;
      slot.serial = recordCeremonySerialRef.current;
      slot.active = true;
      slot.towerSequence = topGainerState.sequence;
      slot.x = topGainerState.xTarget;
      slot.z = topGainerState.zTarget;
      slot.towerHeight = topGainerState.heightTarget;
      slot.startTimeMs = performance.now();
      slot.durationMs = 1400;
    }

    const districtMap = new Map<number, TopCoinSymbolState[]>();
    for (const item of snapshot.items) {
      const state = states.get(item.symbol);
      if (!state) continue;
      const list = districtMap.get(state.districtId) ?? [];
      list.push(state);
      districtMap.set(state.districtId, list);
    }

    const districts: DistrictDatum[] = [];
    for (let id = 0; id < TOP_COINS_DISTRICT_COUNT; id++) {
      const list = districtMap.get(id) ?? [];
      let cx = 0;
      let cz = 0;
      let radiusEstimate = 5.2;
      for (const state of list) {
        cx += state.xTarget;
        cz += state.zTarget;
      }
      if (list.length > 0) {
        cx /= list.length;
        cz /= list.length;
        for (const state of list) {
          radiusEstimate = Math.max(radiusEstimate, Math.hypot(state.xTarget - cx, state.zTarget - cz) + state.baseTarget);
        }
      }
      districts.push({
        id,
        memberCount: list.length,
        centerX: cx,
        centerZ: cz,
        radiusEstimate,
        themeSeed: hashUnitString(String(id), 77),
        tintColor: TOP_COINS_DISTRICT_TINTS[id % TOP_COINS_DISTRICT_TINTS.length] ?? '#ead6b7'
      });
    }
    districtsRef.current = districts;

    const traces: TraceDatum[] = [];
    const arterialTraces: TraceDatum[] = [];
    const trafficParticles: TrafficParticleDatum[] = [];
    const arterialTrafficParticles: TrafficParticleDatum[] = [];
    const dedupe = new Set<string>();

    const pushLink = (a: TopCoinSymbolState, b: TopCoinSymbolState, arterial: boolean, seed: number) => {
      const aSeq = Math.min(a.sequence, b.sequence);
      const bSeq = Math.max(a.sequence, b.sequence);
      const key = `${aSeq}:${bSeq}:${arterial ? 'A' : 'T'}`;
      if (dedupe.has(key)) return;
      dedupe.add(key);

      const segment = segmentFromPoints(a.xTarget, a.zTarget, b.xTarget, b.zTarget);
      if (segment.length < 1.2) return;

      const avgPct = (a.pctTarget + b.pctTarget) * 0.5;
      const avgVolNorm = MathUtils.clamp(
        (Math.log10(a.quoteVolumeTarget + 1) + Math.log10(b.quoteVolumeTarget + 1)) / (2 * Math.log10(maxQuoteVolume + 1)),
        0,
        1
      );

      const baseWarm = new Color('#f4d8af');
      const accent = avgPct >= 0 ? new Color('#8dc78b') : new Color('#cc7f77');
      const glow = avgPct >= 0 ? new Color('#f0bf79') : new Color('#a46f8a');
      const widthBase = arterial ? 0.12 : 0.08;
      const width = widthBase + avgVolNorm * (arterial ? 0.08 : 0.05);
      const trace: TraceDatum = {
        id: `${arterial ? 'A' : 'T'}-${key}`,
        aSequence: aSeq,
        bSequence: bSeq,
        midX: segment.midX,
        midZ: segment.midZ,
        length: Math.max(0.9, segment.length - 0.42),
        yaw: segment.yaw,
        y: arterial ? ARTERY_TRACE_BASE_Y + seed * 0.00045 : TRACE_BASE_Y + seed * TRACE_LAYER_STEP_Y,
        width,
        glowWidth: width * (arterial ? 3.2 : 2.6),
        coreColor: `#${baseWarm.clone().lerp(accent, arterial ? 0.42 : 0.3).getHexString()}`,
        glowColor: `#${TRACE_ORANGE.clone().lerp(glow, arterial ? 0.58 : 0.44).getHexString()}`,
        isArtery: arterial,
        scanSeed: hashUnitString(`${a.symbol}:${b.symbol}`, 17)
      };

      if (arterial) {
        arterialTraces.push(trace);
      } else {
        traces.push(trace);
      }

      const particleCount = Math.min(arterial ? 7 : 5, Math.max(arterial ? 2 : 1, Math.round((1.2 + segment.length / 10) * (0.9 + avgVolNorm * 1.4))));
      const dirX = Math.sin(segment.yaw);
      const dirZ = Math.cos(segment.yaw);
      const travelLen = Math.max(0.5, trace.length - 0.14);
      const halfLen = travelLen * 0.5;
      const ax = segment.midX - dirX * halfLen;
      const az = segment.midZ - dirZ * halfLen;
      const bx = segment.midX + dirX * halfLen;
      const bz = segment.midZ + dirZ * halfLen;

      for (let i = 0; i < particleCount; i++) {
        const phase = hashUnitString(`${trace.id}:${i}`, 61);
        const speedMood = MathUtils.lerp(0.86, 1.24, volatilityRef.current);
        const speed = (0.018 + avgVolNorm * 0.05) * (arterial ? 1.16 : 1) * speedMood;
        const c = avgPct >= 0 ? '#f0d8aa' : '#d8b8b2';
        const entry: TrafficParticleDatum = {
          id: `${trace.id}-P-${i}`,
          traceId: trace.id,
          ax,
          az,
          bx,
          bz,
          yaw: segment.yaw,
          y: (arterial ? ARTERY_TRAFFIC_BASE_Y : TRAFFIC_SOLID_BASE_Y) + seed * 0.00025,
          speed,
          phase,
          color: c,
          sizeX: arterial ? 0.12 : 0.09,
          sizeY: 0.027,
          sizeZ: arterial ? 0.31 : 0.22,
          isArtery: arterial
        };
        if (arterial) {
          arterialTrafficParticles.push(entry);
        } else {
          trafficParticles.push(entry);
        }
      }
    };

    for (let districtId = 0; districtId < TOP_COINS_DISTRICT_COUNT; districtId++) {
      const districtStates = (districtMap.get(districtId) ?? []).sort((a, b) => a.rank - b.rank);
      if (districtStates.length < 2) continue;
      const leader = districtStates[0];
      const localLimit = Math.min(districtStates.length, 7);
      for (let i = 1; i < localLimit; i++) {
        const target = districtStates[i];
        if (!target) continue;
        pushLink(leader, target, false, i);
      }
      for (let i = 0; i < Math.min(localLimit - 1, 4); i++) {
        const a = districtStates[i];
        const b = districtStates[i + 1];
        if (!a || !b) continue;
        pushLink(a, b, false, i + 8);
      }
    }

    const globalLeader = snapshot.items[0] ? states.get(snapshot.items[0].symbol) : null;
    if (globalLeader) {
      for (let districtId = 0; districtId < TOP_COINS_DISTRICT_COUNT; districtId++) {
        const districtStates = (districtMap.get(districtId) ?? []).sort((a, b) => a.rank - b.rank);
        const leader = districtStates[0];
        if (!leader || leader.symbol === globalLeader.symbol) continue;
        pushLink(globalLeader, leader, true, districtId);
      }
    }

    tracesRef.current = traces;
    arterialTracesRef.current = arterialTraces;
    trafficRef.current = trafficParticles;
    arterialTrafficRef.current = arterialTrafficParticles;

    const maxRadius = Math.max(
      layout.cityRadius,
      ...snapshot.items
        .map((item) => states.get(item.symbol))
        .filter((state): state is TopCoinSymbolState => Boolean(state))
        .map((state) => Math.hypot(state.xTarget, state.zTarget) + state.baseTarget * 2.8)
    );
    const maxHeight = Math.max(
      24,
      ...snapshot.items
        .map((item) => states.get(item.symbol))
        .filter((state): state is TopCoinSymbolState => Boolean(state))
        .map((state) => state.heightTarget + 4.5)
    );
    boundsRef.current = {
      radius: maxRadius,
      maxY: maxHeight
    };

    const parkTowerTargets: TopCoinsParkTower[] = [];
    for (const item of snapshot.items) {
      const state = states.get(item.symbol);
      if (!state) continue;
      const baseAspect = MathUtils.lerp(0.82, 1.24, hashUnitString(state.symbol, 13));
      const sqrtAspect = Math.sqrt(baseAspect);
      const topVolumeBoost = state.isTopVolume ? 1.08 : 1;
      const baseW = MathUtils.clamp(state.baseTarget * sqrtAspect * topVolumeBoost, 0.72, 4.35);
      const baseD = MathUtils.clamp(state.baseTarget / sqrtAspect * topVolumeBoost, 0.72, 4.35);
      parkTowerTargets.push({
        sequence: state.sequence,
        x: state.xTarget,
        z: state.zTarget,
        height: state.heightTarget,
        baseW,
        baseD,
        footprintX: MathUtils.clamp(baseW * 0.98, 0.7, 3.95),
        footprintZ: MathUtils.clamp(baseD * 0.98, 0.7, 3.95)
      });
    }
    const decorativeParks = buildTopCoinsDecorativeParks({
      towers: parkTowerTargets,
      cityRadius: boundsRef.current.radius
    });
    parksRef.current = decorativeParks.parks;
    parkTreesRef.current = decorativeParks.trees;

    const totalBreadth = snapshot.stats.marketBreadth.positive + snapshot.stats.marketBreadth.negative;
    moodTargetRef.current = totalBreadth > 0 ? snapshot.stats.marketBreadth.positive / totalBreadth : 0.5;

    debugRef.current = {
      asOfMs: snapshot.asOf,
      asOfIso: snapshot.asOf > 0 ? new Date(snapshot.asOf).toISOString() : '',
      symbols: snapshot.debug.symbols,
      fetchedAt: snapshot.debug.fetchedAt,
      lastHash: snapshot.debug.lastHash,
      refreshAgeSec: snapshot.debug.refreshAgeSec,
      lastError: snapshot.debug.lastError,
      lastFetchOk: snapshot.debug.lastFetchOk,
      logosMissing: snapshot.debug.logosMissing,
      logosAttempted: snapshot.debug.logosAttempted,
      logosDownloaded: snapshot.debug.logosDownloaded,
      layoutIters: layout.layoutIters,
      minSeparation: layout.minSeparation,
      overlapFix: layout.overlapFix,
      topGainer: snapshot.stats.topGainer,
      topLoser: snapshot.stats.topLoser,
      topVolume: snapshot.stats.topVolume
    };
    setVersion((v) => v + 1);
  }, [snapshot]);

  useEffect(() => {
    let raf = 0;
    let prevTime = performance.now();
    let mounted = true;

    const tick = (now: number) => {
      if (!mounted) return;
      const dt = Math.max(0.001, (now - prevTime) / 1000);
      prevTime = now;
      let dirty = false;

      moodRef.current = easeTowards(moodRef.current, moodTargetRef.current, 2.8, dt);

      for (const [symbol, state] of statesRef.current) {
        const prevX = state.x;
        const prevZ = state.z;
        const prevHeight = state.height;
        const prevBase = state.base;
        const prevPct = state.pct;
        const prevVolume = state.quoteVolume;
        const prevPrice = state.lastPrice;
        const prevGlow = state.glowStrength;
        const prevOpacity = state.opacity;

        const smoothAlpha = Number.isFinite(state.smoothAlpha) ? state.smoothAlpha : 3.8;
        state.x = easeTowards(state.x, state.xTarget, smoothAlpha, dt);
        state.z = easeTowards(state.z, state.zTarget, smoothAlpha, dt);
        state.height = easeTowards(state.height, state.heightTarget, 4.2, dt);
        state.base = easeTowards(state.base, state.baseTarget, 3.6, dt);
        state.pct = easeTowards(state.pct, state.pctTarget, 3.4, dt);
        state.quoteVolume = easeTowards(state.quoteVolume, state.quoteVolumeTarget, 3.2, dt);
        state.lastPrice = easeTowards(state.lastPrice, state.lastPriceTarget, 3.2, dt);
        state.glowStrength = easeTowards(state.glowStrength, state.glowStrengthTarget, 3.8, dt);
        state.opacity = easeTowards(state.opacity, state.opacityTarget, 4.8, dt);

        if (state.opacityTarget <= 0.001 && state.opacity < 0.02) {
          statesRef.current.delete(symbol);
          dirty = true;
          continue;
        }

        if (
          Math.abs(state.x - prevX) > 0.001 ||
          Math.abs(state.z - prevZ) > 0.001 ||
          Math.abs(state.height - prevHeight) > 0.001 ||
          Math.abs(state.base - prevBase) > 0.001 ||
          Math.abs(state.pct - prevPct) > 0.001 ||
          Math.abs(state.quoteVolume - prevVolume) > 0.001 ||
          Math.abs(state.lastPrice - prevPrice) > 0.001 ||
          Math.abs(state.glowStrength - prevGlow) > 0.001 ||
          Math.abs(state.opacity - prevOpacity) > 0.001
        ) {
          dirty = true;
        }
      }

      if (dirty) {
        setVersion((v) => v + 1);
      }
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => {
      mounted = false;
      window.cancelAnimationFrame(raf);
    };
  }, []);

  const towers = useMemo(() => {
    const list = Array.from(statesRef.current.values())
      .filter((state) => state.opacity > 0.02)
      .sort((a, b) => a.rank - b.rank || a.symbol.localeCompare(b.symbol));

    const out: TowerDatum[] = [];
    for (const state of list) {
      const pctMagnitude = MathUtils.clamp(Math.abs(state.pct) / Math.max(1, Math.abs(debugRef.current.topGainer.pct) || 1), 0, 1);
      const isPositive = state.pct >= 0;
      const accent = isPositive ? new Color('#91c88f') : new Color('#c67d73');
      const glow = TRACE_ORANGE.clone().lerp(accent, 0.32 + pctMagnitude * 0.4);
      if (state.isTopLoser) {
        glow.lerp(new Color('#7aa6d9'), 0.58);
      }
      if (state.isTopGainer) {
        glow.lerp(new Color('#ffd98f'), 0.34);
      }
      const core = CORE_GRAPHITE.clone().lerp(CORE_GRAPHITE_HI, 0.26 + pctMagnitude * 0.28);
      if (state.isTopLoser) {
        core.lerp(new Color('#8da5bb'), 0.18);
      }
      const districtTint = TOP_COINS_DISTRICT_TINTS[state.districtId % TOP_COINS_DISTRICT_TINTS.length] ?? '#ead8bb';
      const baseAspect = MathUtils.lerp(0.82, 1.24, hashUnitString(state.symbol, 13));
      const sqrtAspect = Math.sqrt(baseAspect);
      const topVolumeBoost = state.isTopVolume ? 1.08 : 1;
      const baseW = MathUtils.clamp(state.base * sqrtAspect * topVolumeBoost, 0.72, 4.35);
      const baseD = MathUtils.clamp(state.base / sqrtAspect * topVolumeBoost, 0.72, 4.35);
      out.push({
        sequence: state.sequence,
        x: state.x,
        z: state.z,
        height: state.height,
        archetypeId: (state.sequence % 6) as TowerArchetypeId,
        baseW,
        baseD,
        footprintX: MathUtils.clamp(baseW * 0.98, 0.7, 3.95),
        footprintZ: MathUtils.clamp(baseD * 0.98, 0.7, 3.95),
        taper: MathUtils.lerp(0.03, 0.16, hashUnitString(state.symbol, 29)),
        podiumRatio: MathUtils.lerp(0.12, 0.24, hashUnitString(state.symbol, 37)),
        crownRatio: MathUtils.lerp(0.08, 0.16, hashUnitString(state.symbol, 41)),
        coreColor: `#${core.getHexString()}`,
        glowColor: `#${glow.getHexString()}`,
        glowStrength: state.glowStrength * MathUtils.clamp(state.opacity, 0, 1),
        bandCount: state.isTopGainer || state.isTopVolume || state.rank <= 3 ? 4 : state.rank <= 16 ? 3 : 2,
        heightScore: MathUtils.clamp(Math.abs(state.pct) / Math.max(1, Math.abs(debugRef.current.topGainer.pct) || 1), 0, 1),
        isHero: state.isTopGainer || state.isTopLoser || state.isTopVolume || state.rank <= 3,
        heroMult: state.isTopGainer ? 1.24 : state.isTopLoser ? 1.1 : state.isTopVolume ? 1.14 : state.rank <= 3 ? 1.08 : 1,
        capGlowBoost: state.isTopGainer ? 1.58 : state.isTopLoser ? 1.28 : state.isTopVolume ? 1.34 : 1.06,
        heroMode: state.isTopGainer ? 'guarantee' : state.rank <= 3 ? 'roll' : 'none',
        intensity: MathUtils.clamp(Math.abs(state.pct) / 12, 0, 1),
        imbalance: MathUtils.clamp(state.pct / 12, -1, 1),
        districtId: state.districtId,
        districtAccentColor: districtTint,
        btcVolume: state.quoteVolume,
        usdNotional: state.quoteVolume,
        usdSource: 'top-coins',
        logUsd: Math.log10(Math.max(1, state.quoteVolume)),
        usdAnchorU: MathUtils.clamp(state.rank / 200, 0, 1),
        usdScoreDist: MathUtils.clamp(Math.abs(state.pct) / 20, 0, 1),
        averagePrice: state.lastPrice,
        tradeCount: 0,
        windowStart: snapshot?.asOf ?? Date.now(),
        windowEnd: snapshot?.asOf ?? Date.now(),
        emittedAt: state.emittedAt,
        mode: 'top200',
        symbol: state.symbol,
        baseAsset: state.baseAsset,
        quoteAsset: state.quoteAsset,
        priceChangePercent: state.pct,
        quoteVolume24h: state.quoteVolume,
        lastPrice: state.lastPrice,
        rank: state.rank,
        logoPath: state.logoPath,
        isTopGainer: state.isTopGainer,
        isTopLoser: state.isTopLoser,
        isTopVolume: state.isTopVolume
      });
    }

    return out;
  }, [snapshot, version]);

  const tallestTowerSequence = useMemo(() => {
    const topGainer = towers.find((tower) => tower.symbol === debugRef.current.topGainer.symbol);
    if (topGainer) return topGainer.sequence;
    let best: TowerDatum | null = null;
    for (const tower of towers) {
      if (!best || tower.height > best.height) {
        best = tower;
      }
    }
    return best?.sequence ?? null;
  }, [towers]);

  const tallestTowerHeight = useMemo(() => {
    const tower = towers.find((item) => item.sequence === tallestTowerSequence);
    return tower?.height ?? 0;
  }, [tallestTowerSequence, towers]);

  return {
    version,
    towers,
    traces: tracesRef.current,
    arterialTraces: arterialTracesRef.current,
    trafficParticles: trafficRef.current,
    arterialTrafficParticles: arterialTrafficRef.current,
    parks: parksRef.current,
    parkTrees: parkTreesRef.current,
    districts: districtsRef.current,
    shockwaves: shockwavesRef.current,
    recordCeremonies: recordCeremoniesRef.current,
    bounds: boundsRef.current,
    marketMoodTarget: moodRef.current,
    latestHeightDebug: null as HeightDebugSnapshot | null,
    tallestTowerSequence,
    tallestTowerHeight,
    parksAttempted: parksRef.current.length,
    parksPlaced: parksRef.current.length,
    lastParkSkipReason: parksRef.current.length > 0 ? 'placed' : 'no-slot',
    topCoinsDebug: debugRef.current
  };
}

function MinimalOrbitRig({
  bounds,
  focusTarget,
  onClearFocusTarget,
  onCameraDebug
}: {
  bounds: SandboxBounds;
  focusTarget?: CameraFocusTarget | null;
  onClearFocusTarget?: () => void;
  onCameraDebug?: (snapshot: CameraDebugSnapshot) => void;
}) {
  const { camera, gl } = useThree();
  const initializedRef = useRef(false);
  const modeRef = useRef<CameraMode>('auto');

  const actualRef = useRef<OrbitState>({ angle: 0, distance: 28, elevation: 12, lookY: 4 });
  const controlRef = useRef<OrbitState>({ angle: 0, distance: 28, elevation: 12, lookY: 4 });
  const autoRef = useRef<OrbitState>({ angle: 0, distance: 28, elevation: 12, lookY: 4 });

  const centerActualRef = useRef({ x: 0, z: 0 });
  const centerTargetRef = useRef({ x: 0, z: 0 });
  const focusOrbitRef = useRef({
    sequence: null as number | null,
    centerX: 0,
    centerZ: 0,
    topY: 0,
    radius: 14,
    elevation: 16,
    lookY: 6,
    angularSpeed: 0.18
  });
  const keysRef = useRef<Record<string, boolean>>({});
  const dragRef = useRef({ dragging: false, pointerId: -1, lastX: 0, lastY: 0 });
  const debugEmitAtRef = useRef(0);

  useEffect(() => {
    const canvas = gl.domElement;

    const syncControlFromCurrentView = () => {
      const control = controlRef.current;
      const px = smoothPosition.lengthSq() > 0 ? smoothPosition.x : camera.position.x;
      const pz = smoothPosition.lengthSq() > 0 ? smoothPosition.z : camera.position.z;
      control.angle = Math.atan2(px, pz);
      control.distance = Math.max(0.001, Math.hypot(px, pz));
      control.elevation = smoothPosition.lengthSq() > 0 ? smoothPosition.y : camera.position.y;
      control.lookY = smoothTarget.lengthSq() > 0 ? smoothTarget.y : 4;
    };

    const markUserInteraction = () => {
      if (modeRef.current === 'focus') {
        onClearFocusTarget?.();
        syncControlFromCurrentView();
      }
      modeRef.current = 'user';
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dragRef.current.dragging = true;
      dragRef.current.pointerId = event.pointerId;
      dragRef.current.lastX = event.clientX;
      dragRef.current.lastY = event.clientY;
      canvas.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag.dragging || drag.pointerId !== event.pointerId) return;
      if (modeRef.current === 'focus') {
        markUserInteraction();
      }
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      const control = controlRef.current;
      const precision = keysRef.current.ShiftLeft || keysRef.current.ShiftRight ? 0.45 : 1;
      control.angle = control.angle - dx * 0.0042 * precision;
      control.elevation += dy * -0.035 * precision;
      control.lookY += dy * -0.016 * precision;
      markUserInteraction();
      event.preventDefault();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (dragRef.current.pointerId !== event.pointerId) return;
      dragRef.current.dragging = false;
      dragRef.current.pointerId = -1;
      canvas.releasePointerCapture?.(event.pointerId);
    };

    const onWheel = (event: WheelEvent) => {
      if (modeRef.current === 'focus') {
        markUserInteraction();
      }
      const control = controlRef.current;
      const precision = keysRef.current.ShiftLeft || keysRef.current.ShiftRight ? 0.55 : 1;
      control.distance += event.deltaY * 0.016 * precision;
      markUserInteraction();
      event.preventDefault();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      keysRef.current[event.code] = true;
      if (event.code === 'KeyR') {
        modeRef.current = 'auto';
        onClearFocusTarget?.();
        event.preventDefault();
        return;
      }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(event.code)) {
        markUserInteraction();
        event.preventDefault();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keysRef.current[event.code] = false;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [camera, gl, onClearFocusTarget]);

  useEffect(() => {
    if (!focusTarget) return;
    const focus = focusOrbitRef.current;
    focus.sequence = focusTarget.sequence;
    focus.centerX = focusTarget.x;
    focus.centerZ = focusTarget.z;
    focus.topY = focusTarget.height;
    focus.radius = MathUtils.clamp(6.5 + focusTarget.height * 0.34 + bounds.radius * 0.018, 7.5, 42);
    focus.elevation = MathUtils.clamp(focusTarget.height + Math.max(6, focusTarget.height * 0.38), 9, 86);
    focus.lookY = Math.max(1.2, focusTarget.height * 0.5 + 0.2);
    focus.angularSpeed =
      (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.11 : 0.18) * Math.max(0.65, RUNTIME_QUALITY_CONFIG.cameraOrbitSpeedScale);

    const px = smoothPosition.lengthSq() > 0 ? smoothPosition.x : camera.position.x;
    const pz = smoothPosition.lengthSq() > 0 ? smoothPosition.z : camera.position.z;
    const dx = px - focus.centerX;
    const dz = pz - focus.centerZ;

    const control = controlRef.current;
    control.angle = Math.atan2(dx, dz);
    control.distance = Math.max(8, Math.hypot(dx, dz));
    control.elevation = smoothPosition.lengthSq() > 0 ? smoothPosition.y : camera.position.y;
    control.lookY = smoothTarget.lengthSq() > 0 ? smoothTarget.y : focus.lookY;

    centerTargetRef.current.x = focus.centerX;
    centerTargetRef.current.z = focus.centerZ;
    modeRef.current = 'focus';
  }, [bounds.radius, camera, focusTarget]);

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    const radius = Math.max(18, bounds.radius);
    const maxY = Math.max(8, bounds.maxY);
    const orbitScale = RUNTIME_QUALITY_CONFIG.cameraOrbitSpeedScale;
    const driftScale = RUNTIME_QUALITY_CONFIG.cameraDriftScale;

    const auto = autoRef.current;
    auto.angle = wrapAngleRad(t * 0.18 * orbitScale + Math.sin(t * 0.1 * orbitScale) * (0.06 * driftScale));
    auto.distance = MathUtils.clamp(18 + radius * 1.65 + maxY * 0.55, 24, 170);
    auto.elevation = MathUtils.clamp(8 + maxY * 0.9 + radius * 0.22, 10, 72);
    auto.lookY = MathUtils.clamp(1.5 + maxY * 0.45, 2, 30);

    const keys = keysRef.current;
    const anyMovementKey = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD || keys.KeyQ || keys.KeyE;
    if (anyMovementKey) {
      modeRef.current = 'user';
      if (focusTarget) onClearFocusTarget?.();
    }

    const control = controlRef.current;
    const actual = actualRef.current;
    if (!initializedRef.current) {
      initializedRef.current = true;
      control.angle = auto.angle;
      control.distance = auto.distance;
      control.elevation = auto.elevation;
      control.lookY = auto.lookY;
      actual.angle = auto.angle;
      actual.distance = auto.distance;
      actual.elevation = auto.elevation;
      actual.lookY = auto.lookY;
      smoothPosition.set(0, 0, 0);
      smoothTarget.set(0, 0, 0);
    }

    if (modeRef.current === 'auto') {
      centerTargetRef.current.x = 0;
      centerTargetRef.current.z = 0;
      control.angle = auto.angle;
      control.distance = auto.distance;
      control.elevation = auto.elevation;
      control.lookY = auto.lookY;
    }

    if (modeRef.current === 'focus') {
      const focus = focusOrbitRef.current;
      centerTargetRef.current.x = focus.centerX;
      centerTargetRef.current.z = focus.centerZ;
      control.angle += delta * focus.angularSpeed;
      control.distance = MathUtils.damp(control.distance, focus.radius, 2.2, delta);
      control.elevation = MathUtils.damp(control.elevation, focus.elevation, 2.3, delta);
      control.lookY = MathUtils.damp(control.lookY, focus.lookY, 2.3, delta);
    }

    if (modeRef.current === 'user') {
      centerTargetRef.current.x = 0;
      centerTargetRef.current.z = 0;
      const precision = keys.ShiftLeft || keys.ShiftRight ? 0.45 : 1;
      const orbitSpeed = 0.95 * precision * Math.max(0.7, orbitScale);
      const tiltSpeed = 7 * precision;
      const zoomSpeed = 12 * precision;
      if (keys.KeyA) control.angle += delta * orbitSpeed;
      if (keys.KeyD) control.angle -= delta * orbitSpeed;
      if (keys.KeyW) {
        control.elevation += delta * tiltSpeed;
        control.lookY += delta * tiltSpeed * 0.68;
      }
      if (keys.KeyS) {
        control.elevation -= delta * tiltSpeed;
        control.lookY -= delta * tiltSpeed * 0.68;
      }
      if (keys.KeyQ) control.distance -= delta * zoomSpeed;
      if (keys.KeyE) control.distance += delta * zoomSpeed;
    }

    control.angle = wrapAngleRad(control.angle);

    if (modeRef.current === 'focus') {
      const focus = focusOrbitRef.current;
      control.distance = MathUtils.clamp(control.distance, 6, 72);
      control.elevation = MathUtils.clamp(control.elevation, focus.topY + 3.5, focus.topY + 96);
      control.lookY = MathUtils.clamp(control.lookY, Math.max(1, focus.topY * 0.25), focus.topY + 26);
    } else {
      control.distance = MathUtils.clamp(control.distance, 8, Math.max(34, radius * 3 + 24));
      control.elevation = MathUtils.clamp(control.elevation, 4, Math.max(18, maxY + radius * 0.45 + 10));
      control.lookY = MathUtils.clamp(control.lookY, 0.8, Math.max(26, maxY + 8));
    }

    const orbitDamp = modeRef.current === 'auto' ? 1.6 : modeRef.current === 'focus' ? 2.4 : 2.2;
    const radiusDamp = modeRef.current === 'auto' ? 1.5 : modeRef.current === 'focus' ? 2.3 : 2.1;
    const verticalDamp = modeRef.current === 'auto' ? 1.45 : modeRef.current === 'focus' ? 2.2 : 2.0;
    const lookDamp = modeRef.current === 'auto' ? 1.4 : modeRef.current === 'focus' ? 2.25 : 1.9;
    actual.angle = dampAngleRad(actual.angle, control.angle, orbitDamp, delta);
    actual.distance = MathUtils.damp(actual.distance, control.distance, radiusDamp, delta);
    actual.elevation = MathUtils.damp(actual.elevation, control.elevation, verticalDamp, delta);
    actual.lookY = MathUtils.damp(actual.lookY, control.lookY, lookDamp, delta);
    actual.angle = wrapAngleRad(actual.angle);

    centerActualRef.current.x = MathUtils.damp(centerActualRef.current.x, centerTargetRef.current.x, 2.4, delta);
    centerActualRef.current.z = MathUtils.damp(centerActualRef.current.z, centerTargetRef.current.z, 2.4, delta);

    tempDir.set(Math.sin(actual.angle), 0, Math.cos(actual.angle));
    desiredPosition.copy(tempDir).multiplyScalar(actual.distance);
    desiredPosition.x += centerActualRef.current.x;
    desiredPosition.z += centerActualRef.current.z;
    desiredPosition.y = actual.elevation;
    desiredTarget.set(centerActualRef.current.x, actual.lookY, centerActualRef.current.z);

    if (smoothPosition.lengthSq() === 0 && smoothTarget.lengthSq() === 0) {
      smoothPosition.copy(desiredPosition);
      smoothTarget.copy(desiredTarget);
    }

    smoothPosition.x = MathUtils.damp(smoothPosition.x, desiredPosition.x, modeRef.current === 'auto' ? 1.8 : 2.4, delta);
    smoothPosition.y = MathUtils.damp(smoothPosition.y, desiredPosition.y, modeRef.current === 'auto' ? 1.8 : 2.4, delta);
    smoothPosition.z = MathUtils.damp(smoothPosition.z, desiredPosition.z, modeRef.current === 'auto' ? 1.8 : 2.4, delta);

    smoothTarget.x = MathUtils.damp(smoothTarget.x, desiredTarget.x, modeRef.current === 'auto' ? 1.75 : 2.2, delta);
    smoothTarget.y = MathUtils.damp(smoothTarget.y, desiredTarget.y, modeRef.current === 'auto' ? 1.75 : 2.2, delta);
    smoothTarget.z = MathUtils.damp(smoothTarget.z, desiredTarget.z, modeRef.current === 'auto' ? 1.75 : 2.2, delta);

    camera.position.copy(smoothPosition);
    camera.lookAt(smoothTarget);

    if (onCameraDebug) {
      const nowMs = performance.now();
      if (nowMs - debugEmitAtRef.current > 160) {
        debugEmitAtRef.current = nowMs;
        const camDist = camera.position.length();
        onCameraDebug({
          camDist,
          visCurve: distanceVisibilityCurve(camDist)
        });
      }
    }
  });

  return null;
}

function buildTowerSegments(tower: TowerDatum): TowerSegmentSpec[] {
  const h = Math.max(TOWER_VISUAL_MIN_HEIGHT, tower.height);
  const fx = tower.footprintX;
  const fz = tower.footprintZ;
  const taperAmt = MathUtils.clamp(tower.taper, 0, 0.22);
  const segments: TowerSegmentSpec[] = [];
  let cursor = 0;

  const pushSegment = (id: string, segH: number, sx: number, sz: number) => {
    const height = Math.max(0.12, segH);
    segments.push({
      id,
      y: cursor + height * 0.5,
      height,
      sx: Math.max(0.14, sx),
      sz: Math.max(0.14, sz),
      isTop: false
    });
    cursor += height;
  };

  if (tower.archetypeId === 0) {
    pushSegment('shaft', h, fx, fz);
  } else if (tower.archetypeId === 1) {
    const podiumH = MathUtils.clamp(h * tower.podiumRatio, 0.35, h * 0.28);
    const shaftH = Math.max(0.4, h - podiumH);
    pushSegment('podium', podiumH, fx * 1.18, fz * 1.18);
    pushSegment('shaft', shaftH, fx * (0.84 - taperAmt * 0.25), fz * (0.84 - taperAmt * 0.25));
  } else if (tower.archetypeId === 2) {
    const h1 = h * 0.42;
    const h2 = h * 0.34;
    const h3 = Math.max(0.35, h - h1 - h2);
    pushSegment('taper-a', h1, fx, fz);
    pushSegment('taper-b', h2, fx * (1 - taperAmt * 0.55), fz * (1 - taperAmt * 0.55));
    pushSegment('taper-c', h3, fx * (1 - taperAmt), fz * (1 - taperAmt));
  } else if (tower.archetypeId === 3) {
    const h1 = Math.max(0.34, h * 0.26);
    const h2 = Math.max(0.34, h * 0.28);
    const h3 = Math.max(0.34, h * 0.24);
    const h4 = Math.max(0.34, h - h1 - h2 - h3);
    pushSegment('setback-base', h1, fx * 1.16, fz * 1.16);
    pushSegment('setback-low', h2, fx * 0.98, fz * 0.98);
    pushSegment('setback-mid', h3, fx * (0.84 - taperAmt * 0.28), fz * (0.84 - taperAmt * 0.28));
    pushSegment('setback-top', h4, fx * (0.72 - taperAmt * 0.45), fz * (0.72 - taperAmt * 0.45));
  } else if (tower.archetypeId === 4) {
    const crownH = MathUtils.clamp(h * tower.crownRatio, 0.35, h * 0.18);
    const shaftH = Math.max(0.6, h - crownH);
    const lowerH = shaftH * 0.62;
    const upperH = Math.max(0.4, shaftH - lowerH);
    pushSegment('crown-lower', lowerH, fx * 1.02, fz * 1.02);
    pushSegment('crown-upper', upperH, fx * (0.86 - taperAmt * 0.35), fz * (0.86 - taperAmt * 0.35));
    pushSegment('crown-cap', crownH * 0.74, fx * (0.68 - taperAmt * 0.16), fz * (0.68 - taperAmt * 0.16));
    pushSegment('crown-lantern', Math.max(0.18, crownH * 0.26), fx * 0.36, fz * 0.36);
  } else {
    const podiumH = MathUtils.clamp(h * (tower.podiumRatio * 0.8), 0.28, h * 0.16);
    const shaftH = Math.max(0.8, h * 0.74);
    const spireBaseH = Math.max(0.26, h * 0.08);
    const spireH = Math.max(0.24, h - podiumH - shaftH - spireBaseH);
    pushSegment('spire-podium', podiumH, fx * 1.12, fz * 1.12);
    pushSegment('spire-shaft', shaftH, fx * (0.78 - taperAmt * 0.24), fz * (0.78 - taperAmt * 0.24));
    pushSegment('spire-base', spireBaseH, fx * 0.46, fz * 0.46);
    pushSegment('spire-tip', spireH, fx * 0.18, fz * 0.18);
  }

  if (segments.length > 0) {
    segments[segments.length - 1].isTop = true;
  }

  return segments;
}

function TallestBtcDecals({
  tower,
  focusMode,
  isHovered
}: {
  tower: TowerDatum;
  focusMode: boolean;
  isHovered: boolean;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    drawRoundedRect(ctx, -86, -96, 172, 192, 20);
    ctx.fillStyle = 'rgba(9,12,17,0.72)';
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(247,147,26,0.82)';
    ctx.stroke();

    ctx.font = '700 142px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(247,147,26,0.42)';
    ctx.strokeStyle = 'rgba(22,28,35,0.88)';
    ctx.lineWidth = 6;
    ctx.strokeText('₿', 0, 8);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    ctx.fillText('₿', 0, 8);
    ctx.restore();

    return finalizeCanvasTexture(new CanvasTexture(canvas));
  }, []);

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  if (!texture) return null;

  const focusScale = focusMode ? (isHovered ? 1 : FOCUS_NON_HOVER_DIM) : 1;
  const rimOpacity = (isHovered ? TALLEST_BADGE_RIM_OPACITY * 1.35 : TALLEST_BADGE_RIM_OPACITY) * focusScale;
  const faceOpacity = (isHovered ? TALLEST_BADGE_FACE_OPACITY : TALLEST_BADGE_FACE_OPACITY * 0.82) * focusScale;
  const badgeSize = MathUtils.clamp(
    Math.max(tower.baseW, tower.baseD) * TALLEST_BADGE_SIZE_BASE_MULT,
    TALLEST_BADGE_SIZE_MIN,
    TALLEST_BADGE_SIZE_MAX
  );
  const y = Math.max(badgeSize * 0.62 + 0.6, Math.min(tower.height * 0.66, tower.height - badgeSize * 0.6 - 0.2));
  const zInset = Math.max(tower.footprintZ * 0.5 + 0.012, 0.12);
  const xInset = Math.max(tower.footprintX * 0.5 + 0.012, 0.12);

  const faces = [
    { key: 'front', pos: [0, y, zInset] as [number, number, number], rot: [0, 0, 0] as [number, number, number] },
    { key: 'back', pos: [0, y, -zInset] as [number, number, number], rot: [0, Math.PI, 0] as [number, number, number] },
    { key: 'right', pos: [xInset, y, 0] as [number, number, number], rot: [0, Math.PI / 2, 0] as [number, number, number] },
    { key: 'left', pos: [-xInset, y, 0] as [number, number, number], rot: [0, -Math.PI / 2, 0] as [number, number, number] }
  ];

  return (
    <group renderOrder={6.45}>
      {faces.map((face) => (
        <group key={face.key} position={face.pos} rotation={face.rot}>
          <mesh position={[0, 0, 0]} renderOrder={6.45}>
            <planeGeometry args={[badgeSize, badgeSize]} />
            <meshBasicMaterial
              map={texture}
              alphaMap={texture}
              transparent
              opacity={faceOpacity}
              color="#ffffff"
              toneMapped={false}
              depthTest
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-2}
            />
          </mesh>
          <mesh position={[0, 0, 0.004]} renderOrder={6.46}>
            <planeGeometry args={[badgeSize * 1.04, badgeSize * 1.04]} />
            <meshBasicMaterial
              map={texture}
              alphaMap={texture}
              transparent
              opacity={rimOpacity}
              color={isHovered ? '#ffb14f' : '#f7931a'}
              toneMapped={false}
              depthTest
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-3}
              polygonOffsetUnits={-3}
              blending={AdditiveBlending}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function TallestBeacon({
  tower,
  sceneMaxY,
  focusMode,
  isHovered
}: {
  tower: TowerDatum;
  sceneMaxY: number;
  focusMode: boolean;
  isHovered: boolean;
}) {
  const beamOuterRef = useRef<Mesh>(null);
  const beamInnerRef = useRef<Mesh>(null);
  const topHaloRef = useRef<Mesh>(null);
  const hoverMixRef = useRef(0);

  const beamLength = Math.max(12, Math.min(52, sceneMaxY * 0.78 + 6));
  const beamCenterY = tower.height + 0.9 + beamLength * 0.5;

  useFrame(({ clock }, delta) => {
    hoverMixRef.current = MathUtils.damp(hoverMixRef.current, isHovered ? 1 : 0, 9, delta);
    const pulse = 0.85 + Math.sin(clock.getElapsedTime() * 1.8 + tower.sequence * 0.07) * 0.05;
    const dimScale = MathUtils.lerp(1, FOCUS_NON_HOVER_DIM, focusMode && !isHovered ? 1 : 0);
    const hoverBoost = MathUtils.lerp(1, 1.35, hoverMixRef.current);

    const outerMat = beamOuterRef.current?.material as { opacity?: number } | undefined;
    if (outerMat) outerMat.opacity = MathUtils.damp(outerMat.opacity ?? 0.16, 0.16 * pulse * dimScale * hoverBoost, 9, delta);
    const innerMat = beamInnerRef.current?.material as { opacity?: number } | undefined;
    if (innerMat) innerMat.opacity = MathUtils.damp(innerMat.opacity ?? 0.28, 0.28 * pulse * dimScale * hoverBoost, 9, delta);
    const haloMat = topHaloRef.current?.material as { opacity?: number } | undefined;
    if (haloMat) haloMat.opacity = MathUtils.damp(haloMat.opacity ?? 0.34, 0.34 * dimScale * hoverBoost, 9, delta);

    if (topHaloRef.current) {
      const s = MathUtils.lerp(1.0, 1.16, 0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 1.35 + tower.sequence * 0.11));
      topHaloRef.current.scale.set(s, 1, s);
    }
  });

  return (
    <group position={[tower.x, 0, tower.z]} renderOrder={6.7}>
      <mesh ref={beamOuterRef} position={[0, beamCenterY, 0]} renderOrder={6.71}>
        <cylinderGeometry args={[0.62, 0.22, beamLength, 18, 1, true]} />
        <meshBasicMaterial
          color="#f7931a"
          transparent
          opacity={0.16}
          toneMapped={false}
          depthTest
          depthWrite={false}
          side={DoubleSide}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh ref={beamInnerRef} position={[0, beamCenterY, 0]} renderOrder={6.72}>
        <cylinderGeometry args={[0.22, 0.08, beamLength, 14, 1, true]} />
        <meshBasicMaterial
          color="#ffe2b7"
          transparent
          opacity={0.28}
          toneMapped={false}
          depthTest
          depthWrite={false}
          side={DoubleSide}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh position={[0, tower.height + 0.2, 0]} renderOrder={6.73}>
        <cylinderGeometry args={[0.56, 0.56, 0.04, 24]} />
        <meshBasicMaterial
          color="#f7931a"
          transparent
          opacity={0.22}
          toneMapped={false}
          depthTest
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh ref={topHaloRef} position={[0, tower.height + 0.32, 0]} renderOrder={6.74}>
        <cylinderGeometry args={[0.42, 0.42, 0.05, 20]} />
        <meshBasicMaterial
          color="#fff3df"
          transparent
          opacity={0.34}
          toneMapped={false}
          depthTest
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

function HoverTowerLabel({ tower }: { tower: TowerDatum }) {
  const { camera } = useThree();
  const groupRef = useRef<Group>(null);
  const cardRef = useRef<Mesh>(null);
  const glowRef = useRef<Mesh>(null);
  const alphaRef = useRef(0);

  const usdText = useMemo(() => fmtUsdCompact(tower.usdNotional), [tower.usdNotional]);
  const btcText = useMemo(() => `${fmtBtc(tower.btcVolume)} BTC`, [tower.btcVolume]);

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, 'rgba(13,17,23,0.96)');
    grad.addColorStop(1, 'rgba(7,9,12,0.92)');
    drawRoundedRect(ctx, 18, 18, canvas.width - 36, canvas.height - 36, 28);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(247,147,26,0.72)';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(48, 114);
    ctx.lineTo(canvas.width - 48, 114);
    ctx.strokeStyle = 'rgba(247,147,26,0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.shadowColor = 'rgba(247,147,26,0.35)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#fff7ec';
    ctx.font = '700 76px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(usdText, 52, 100);

    ctx.shadowBlur = 8;
    ctx.fillStyle = '#f2d7b1';
    ctx.font = '600 48px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(btcText, 52, 182);

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(247,147,26,0.92)';
    ctx.font = '700 34px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`#${tower.sequence}`, 52, 250);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(244,227,200,0.82)';
    ctx.font = '500 28px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`trades ${tower.tradeCount}`, canvas.width - 52, 250);

    return finalizeCanvasTexture(new CanvasTexture(canvas));
  }, [btcText, tower.sequence, tower.tradeCount, usdText]);

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group) return;
    alphaRef.current = MathUtils.damp(alphaRef.current, 1, 10, delta);
    const bob = Math.sin(clock.getElapsedTime() * 2.1 + tower.sequence * 0.17) * 0.08;
    group.position.set(tower.x, tower.height + 1.8 + bob, tower.z);
    group.quaternion.copy(camera.quaternion);
    const s = MathUtils.lerp(0.9, 1, alphaRef.current);
    group.scale.setScalar(s);

    const cardMat = cardRef.current?.material as { opacity?: number } | undefined;
    if (cardMat) cardMat.opacity = alphaRef.current * 0.98;
    const glowMat = glowRef.current?.material as { opacity?: number } | undefined;
    if (glowMat) glowMat.opacity = alphaRef.current * 0.38;
  });

  if (!texture) return null;

  return (
    <group ref={groupRef} position={[tower.x, tower.height + 1.8, tower.z]} renderOrder={8.2}>
      <mesh ref={glowRef} position={[0, 0, -0.02]} renderOrder={8.2}>
        <planeGeometry args={[4.7, 1.95]} />
        <meshBasicMaterial
          color="#f7931a"
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
          depthTest
          side={DoubleSide}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh ref={cardRef} renderOrder={8.25}>
        <planeGeometry args={[4.25, 1.75]} />
        <meshBasicMaterial
          map={texture}
          alphaMap={texture}
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
          depthTest
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}

const topCoinLogoTextureCache = new Map<string, Texture | null>();
const topCoinLogoTextureInflight = new Map<string, Promise<Texture | null>>();
const topCoinTickerTextureCache = new Map<string, CanvasTexture>();
const topCoinLogoLoader = new TextureLoader();

function resolveTopCoinLogoUrl(logoPath: string) {
  if (/^https?:\/\//i.test(logoPath)) return null;
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  if (logoPath.startsWith('/')) {
    return `${normalizedBase}${logoPath}`;
  }
  return `${normalizedBase}/${logoPath}`;
}

function getTopCoinTickerTexture(symbol: string) {
  const key = symbol.trim().toUpperCase() || 'N/A';
  const existing = topCoinTickerTextureCache.get(key);
  if (existing) return existing;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const fallback = finalizeCanvasTexture(new CanvasTexture(canvas));
    topCoinTickerTextureCache.set(key, fallback);
    return fallback;
  }

  const center = canvas.width * 0.5;
  const radius = canvas.width * 0.45;
  const ring = canvas.width * 0.49;
  const grad = ctx.createRadialGradient(center, center, canvas.width * 0.12, center, center, ring);
  grad.addColorStop(0, 'rgba(28,32,40,0.98)');
  grad.addColorStop(1, 'rgba(9,11,14,0.96)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.beginPath();
  ctx.arc(center, center, ring, 0, Math.PI * 2);
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(247,147,26,0.82)';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(247,147,26,0.16)';
  ctx.fill();

  ctx.fillStyle = '#fff7ea';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = key.length > 7 ? `${key.slice(0, 6)}…` : key;
  ctx.font = `700 ${Math.max(34, Math.floor(86 - Math.max(0, label.length - 3) * 6))}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText(label, center, center);

  const texture = finalizeCanvasTexture(new CanvasTexture(canvas));
  topCoinTickerTextureCache.set(key, texture);
  return texture;
}

function loadTopCoinLogoTexture(logoPath: string) {
  const cached = topCoinLogoTextureCache.get(logoPath);
  if (cached !== undefined) return Promise.resolve(cached);
  const inFlight = topCoinLogoTextureInflight.get(logoPath);
  if (inFlight) return inFlight;

  const promise = new Promise<Texture | null>((resolve) => {
    const url = resolveTopCoinLogoUrl(logoPath);
    if (!url) {
      topCoinLogoTextureCache.set(logoPath, null);
      topCoinLogoTextureInflight.delete(logoPath);
      resolve(null);
      return;
    }
    topCoinLogoLoader.load(
      url,
      (texture) => {
        texture.colorSpace = SRGBColorSpace;
        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;
        texture.needsUpdate = true;
        topCoinLogoTextureCache.set(logoPath, texture);
        topCoinLogoTextureInflight.delete(logoPath);
        resolve(texture);
      },
      undefined,
      () => {
        topCoinLogoTextureCache.set(logoPath, null);
        topCoinLogoTextureInflight.delete(logoPath);
        resolve(null);
      }
    );
  });

  topCoinLogoTextureInflight.set(logoPath, promise);
  return promise;
}

function useTopCoinDiscTexture(logoPath: string | null | undefined, symbol: string | undefined) {
  const fallback = useMemo(() => getTopCoinTickerTexture(symbol ?? 'N/A'), [symbol]);
  const [texture, setTexture] = useState<Texture>(fallback);

  useEffect(() => {
    let mounted = true;
    if (!logoPath) {
      setTexture(fallback);
      return () => {
        mounted = false;
      };
    }

    const cached = topCoinLogoTextureCache.get(logoPath);
    if (cached !== undefined) {
      setTexture(cached ?? fallback);
      return () => {
        mounted = false;
      };
    }

    loadTopCoinLogoTexture(logoPath).then((loaded) => {
      if (!mounted) return;
      setTexture(loaded ?? fallback);
    });

    return () => {
      mounted = false;
    };
  }, [fallback, logoPath]);

  return texture;
}

function TopCoinLogoDisc({
  tower,
  focusMode,
  isHovered
}: {
  tower: TowerDatum;
  focusMode: boolean;
  isHovered: boolean;
}) {
  const { camera } = useThree();
  const groupRef = useRef<Group>(null);
  const discRef = useRef<Mesh>(null);
  const ringRef = useRef<Mesh>(null);
  const bodyRef = useRef<Mesh>(null);
  const worldPosRef = useRef(new Vector3());
  const texture = useTopCoinDiscTexture(tower.logoPath, tower.symbol);

  useFrame(({ clock }, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const t = clock.getElapsedTime() + tower.sequence * 0.015;
    const bob = Math.sin(t * 1.14) * 0.11;
    // Local coordinates: parent tower group is already at [tower.x, *, tower.z].
    g.position.set(0, tower.height + 1.24 + bob, 0);
    g.quaternion.copy(camera.quaternion);

    g.getWorldPosition(worldPosRef.current);
    const distance = camera.position.distanceTo(worldPosRef.current);
    const rankScale = tower.rank ? MathUtils.clamp(1.08 - tower.rank / 360, 0.78, 1.1) : 1;
    const scale = MathUtils.clamp((0.95 + distance * 0.0084) * rankScale, 0.92, 4.2);
    g.scale.set(scale, scale, scale);

    const dimFactor = focusMode && !isHovered ? FOCUS_NON_HOVER_DIM : 1;
    const hoverBoost = isHovered ? 1.2 : 1;
    const bodyMat = bodyRef.current?.material as { opacity?: number } | undefined;
    if (bodyMat) bodyMat.opacity = MathUtils.damp(bodyMat.opacity ?? 0.72, 0.72 * dimFactor * hoverBoost, 8, delta);
    const discMat = discRef.current?.material as { opacity?: number } | undefined;
    if (discMat) discMat.opacity = MathUtils.damp(discMat.opacity ?? 0.96, 0.96 * dimFactor * hoverBoost, 9, delta);
    const ringMat = ringRef.current?.material as { opacity?: number } | undefined;
    if (ringMat) ringMat.opacity = MathUtils.damp(ringMat.opacity ?? 0.34, 0.34 * dimFactor * hoverBoost, 8, delta);
  });

  if (tower.mode !== 'top200') return null;

  return (
    <group ref={groupRef} position={[0, tower.height + 1.24, 0]} renderOrder={6.95}>
      <mesh ref={bodyRef} position={[0, 0, -0.016]} renderOrder={6.951}>
        <circleGeometry args={[0.62, 32]} />
        <meshBasicMaterial
          color={tower.isTopLoser ? '#6f8fb5' : tower.isTopGainer ? '#f3bf74' : '#d8b07c'}
          transparent
          opacity={0.72}
          toneMapped={false}
          depthTest
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh ref={discRef} position={[0, 0, -0.008]} renderOrder={6.952}>
        <circleGeometry args={[0.48, 32]} />
        <meshBasicMaterial
          map={texture}
          transparent
          opacity={0.96}
          toneMapped={false}
          depthTest
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ringRef} position={[0, 0, -0.004]} renderOrder={6.953}>
        <torusGeometry args={[0.56, 0.03, 8, 42]} />
        <meshBasicMaterial
          color={tower.isTopGainer ? '#f9c786' : tower.isTopLoser ? '#7ca5d8' : '#f1d2a4'}
          transparent
          opacity={0.34}
          toneMapped={false}
          depthTest
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

function HoverProjectionTracker({
  tower,
  onHudUpdate
}: {
  tower: TowerDatum | null;
  onHudUpdate?: (snapshot: HoverHudSnapshot) => void;
}) {
  const { camera, size } = useThree();
  const smoothedAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const smoothedLabelRef = useRef<{ x: number; y: number } | null>(null);
  const lastSentRef = useRef<HoverHudSnapshot>(HOVER_HUD_HIDDEN);

  useEffect(() => {
    if (!tower) {
      smoothedAnchorRef.current = null;
      smoothedLabelRef.current = null;
      if (lastSentRef.current.visible) {
        lastSentRef.current = HOVER_HUD_HIDDEN;
        onHudUpdate?.(HOVER_HUD_HIDDEN);
      }
    }
  }, [tower, onHudUpdate]);

  useEffect(() => {
    return () => {
      onHudUpdate?.(HOVER_HUD_HIDDEN);
    };
  }, [onHudUpdate]);

  useFrame(() => {
    if (!tower || !onHudUpdate) return;

    hoverProjectWorld.set(tower.x, tower.height + 0.4, tower.z);
    hoverProjectNdc.copy(hoverProjectWorld).project(camera);
    if (!Number.isFinite(hoverProjectNdc.x) || !Number.isFinite(hoverProjectNdc.y) || hoverProjectNdc.z > 1.1) {
      if (lastSentRef.current.visible) {
        lastSentRef.current = HOVER_HUD_HIDDEN;
        onHudUpdate(HOVER_HUD_HIDDEN);
      }
      return;
    }

    const rawAnchorX = (hoverProjectNdc.x * 0.5 + 0.5) * size.width;
    const rawAnchorY = (-hoverProjectNdc.y * 0.5 + 0.5) * size.height;
    const anchorX = MathUtils.clamp(rawAnchorX, 0, size.width);
    const anchorY = MathUtils.clamp(rawAnchorY, 0, size.height);

    let targetLabelX = anchorX - HOVER_LABEL_WIDTH_PX * 0.5;
    let targetLabelY = anchorY - HOVER_LABEL_HEIGHT_PX - HOVER_LABEL_OFFSET_Y_PX;
    if (targetLabelY < HOVER_LABEL_EDGE_PAD_PX) {
      targetLabelY = Math.min(
        size.height - HOVER_LABEL_HEIGHT_PX - HOVER_LABEL_EDGE_PAD_PX,
        anchorY + HOVER_LABEL_OFFSET_Y_PX * 0.65
      );
    }
    targetLabelX = MathUtils.clamp(
      targetLabelX,
      HOVER_LABEL_EDGE_PAD_PX,
      Math.max(HOVER_LABEL_EDGE_PAD_PX, size.width - HOVER_LABEL_WIDTH_PX - HOVER_LABEL_EDGE_PAD_PX)
    );
    targetLabelY = MathUtils.clamp(
      targetLabelY,
      HOVER_LABEL_EDGE_PAD_PX,
      Math.max(HOVER_LABEL_EDGE_PAD_PX, size.height - HOVER_LABEL_HEIGHT_PX - HOVER_LABEL_EDGE_PAD_PX)
    );

    const sa = smoothedAnchorRef.current ?? { x: anchorX, y: anchorY };
    const sl = smoothedLabelRef.current ?? { x: targetLabelX, y: targetLabelY };
    sa.x = MathUtils.lerp(sa.x, anchorX, HOVER_LABEL_LERP);
    sa.y = MathUtils.lerp(sa.y, anchorY, HOVER_LABEL_LERP);
    sl.x = MathUtils.lerp(sl.x, targetLabelX, HOVER_LABEL_LERP);
    sl.y = MathUtils.lerp(sl.y, targetLabelY, HOVER_LABEL_LERP);
    smoothedAnchorRef.current = sa;
    smoothedLabelRef.current = sl;

    const next: HoverHudSnapshot = {
      visible: true,
      towerSequence: tower.sequence,
      anchorX: sa.x,
      anchorY: sa.y,
      labelX: sl.x,
      labelY: sl.y
    };
    const prev = lastSentRef.current;
    const changed =
      !prev.visible ||
      prev.towerSequence !== next.towerSequence ||
      Math.abs(prev.anchorX - next.anchorX) > 0.25 ||
      Math.abs(prev.anchorY - next.anchorY) > 0.25 ||
      Math.abs(prev.labelX - next.labelX) > 0.25 ||
      Math.abs(prev.labelY - next.labelY) > 0.25;
    if (changed) {
      lastSentRef.current = next;
      onHudUpdate(next);
    }
  });

  return null;
}

function HoverHudOverlay({
  tower,
  hud
}: {
  tower: TowerDatum | null;
  hud: HoverHudSnapshot;
}) {
  if (!tower || !hud.visible || hud.towerSequence !== tower.sequence) return null;
  const isTopCoins = tower.mode === 'top200';

  const lineStartX = hud.labelX + HOVER_LABEL_WIDTH_PX * 0.5;
  const labelBelowAnchor = hud.labelY > hud.anchorY;
  const lineStartY = labelBelowAnchor ? hud.labelY : hud.labelY + HOVER_LABEL_HEIGHT_PX;
  const dx = hud.anchorX - lineStartX;
  const dy = hud.anchorY - lineStartY;
  const lineLen = Math.max(6, Math.hypot(dx, dy));
  const lineAngle = Math.atan2(dy, dx);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 5
      }}
      aria-hidden="true"
    >
      <div
        style={{
          position: 'absolute',
          left: hud.labelX,
          top: hud.labelY,
          width: HOVER_LABEL_WIDTH_PX,
          height: HOVER_LABEL_HEIGHT_PX,
          borderRadius: 12,
          border: '1px solid rgba(247,147,26,0.55)',
          background: 'linear-gradient(180deg, rgba(12,15,20,0.96), rgba(8,10,14,0.92))',
          boxShadow: '0 0 0 1px rgba(247,147,26,0.08) inset, 0 8px 22px rgba(0,0,0,0.35)',
          color: '#fff7ec',
          padding: '10px 12px',
          backdropFilter: 'blur(2px)'
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 8,
            top: 8,
            width: 16,
            height: 16,
            borderLeft: '2px solid rgba(247,147,26,0.95)',
            borderTop: '2px solid rgba(247,147,26,0.95)'
          }}
        />
        <div
          style={{
            fontSize: isTopCoins ? 20 : 22,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: '0.01em'
          }}
        >
          {isTopCoins ? tower.symbol ?? 'N/A' : fmtUsdCompact(tower.usdNotional)}
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(246,226,197,0.92)',
            letterSpacing: '0.03em'
          }}
        >
          {isTopCoins
            ? `${fmtSignedPct(tower.priceChangePercent ?? 0)} · ${fmtUsdCompact(tower.quoteVolume24h ?? 0)}`
            : `${fmtBtc(tower.btcVolume)} BTC`}
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 11,
            fontWeight: 600,
            color: 'rgba(240,222,196,0.82)',
            letterSpacing: '0.03em'
          }}
        >
          {isTopCoins
            ? `${tower.baseAsset ?? tower.symbol ?? 'N/A'} · px ${fmtFixed(tower.lastPrice ?? 0, 4)}`
            : `logU ${fmtFixed(tower.logUsd, 2)} · S ${fmtFixed(tower.heightScore, 2)} · H ${fmtFixed(tower.height, 1)}`}
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: 10,
            fontWeight: 600,
            color: 'rgba(240,222,196,0.68)',
            letterSpacing: '0.04em'
          }}
        >
          {isTopCoins
            ? `rank ${tower.rank ?? '-'} · base ${fmtFixed(tower.baseW, 2)}×${fmtFixed(tower.baseD, 2)}`
            : `base ${fmtFixed(tower.baseW, 2)}×${fmtFixed(tower.baseD, 2)}`}
        </div>
        {ENABLE_DISTRICTS ? (
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              fontWeight: 600,
              color: 'rgba(240,222,196,0.72)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase'
            }}
          >
            District {tower.districtId + 1}
          </div>
        ) : null}
      </div>

      <div
        style={{
          position: 'absolute',
          left: lineStartX,
          top: lineStartY,
          width: lineLen,
          height: 2,
          background: 'linear-gradient(90deg, rgba(247,147,26,0.65), rgba(247,147,26,0.9))',
          transformOrigin: '0 50%',
          transform: `rotate(${lineAngle}rad)`,
          boxShadow: '0 0 8px rgba(247,147,26,0.35)'
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: hud.anchorX - 3,
          top: hud.anchorY - 3,
          width: 6,
          height: 6,
          borderRadius: 999,
          background: '#f7931a',
          boxShadow: '0 0 10px rgba(247,147,26,0.75)'
        }}
      />
    </div>
  );
}

function AnimatedHoloTower({
  tower,
  hoveredTowerSequence,
  isTallest,
  onHoverTower,
  onSelectTower
}: {
  tower: TowerDatum;
  hoveredTowerSequence: number | null;
  isTallest: boolean;
  onHoverTower?: (sequence: number | null) => void;
  onSelectTower?: (sequence: number) => void;
}) {
  const groupRef = useRef<Group>(null);
  const coreRefs = useRef<Array<Mesh | null>>([]);
  const shellRefs = useRef<Array<Mesh | null>>([]);
  const edgeRefs = useRef<Array<Mesh | null>>([]);
  const crownRef = useRef<Mesh>(null);
  const topLoserHazeRef = useRef<Mesh>(null);
  const topVolumeBandRef = useRef<Mesh>(null);
  const bandRefs = useRef<Array<Mesh | null>>([]);
  const microBandRefs = useRef<Array<Mesh | null>>([]);
  const antennaTipRefs = useRef<Array<Mesh | null>>([]);
  const settledRef = useRef(false);
  const focusMixRef = useRef(0);
  const hoverMixRef = useRef(0);

  const glowColor = useMemo(() => new Color(tower.glowColor), [tower.glowColor]);
  const coreColor = useMemo(() => new Color(tower.coreColor), [tower.coreColor]);
  const districtAccentColor = useMemo(() => new Color(tower.districtAccentColor), [tower.districtAccentColor]);
  const strokeColor = BTC_SELL_WARM;
  const segments = useMemo(() => buildTowerSegments(tower), [tower]);
  const outlineGeometries = useMemo(
    () => segments.map((seg) => new EdgesGeometry(new BoxGeometry(seg.sx, seg.height, seg.sz))),
    [segments]
  );
  const outlineMaterial = useMemo(() => {
    const m = new LineBasicMaterial({
      color: strokeColor,
      transparent: true,
      opacity: 0.72,
      depthTest: true,
      depthWrite: false
    });
    m.toneMapped = false;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -3;
    m.polygonOffsetUnits = -3;
    return m;
  }, [strokeColor]);
  const topSegment = segments[segments.length - 1] ?? null;
  const bandFractions = useMemo(() => {
    const base = [0.2, 0.42, 0.66, 0.86];
    const wobble = ((tower.sequence % 17) - 8) * 0.0025;
    return base.map((v, i) => MathUtils.clamp(v + wobble * (i + 1), 0.12, 0.92));
  }, [tower.sequence]);
  const microPanelFractions = useMemo(() => {
    if (!ENABLE_TOWER_MICRO_BANDS) return [] as number[];
    const base = tower.height > 12 ? [0.31, 0.58] : [0.44];
    return base.map((v, i) => MathUtils.clamp(v + (hash01(tower.sequence, i, 5401) - 0.5) * 0.06, 0.2, 0.92));
  }, [tower.height, tower.sequence]);
  const terraceEnabled =
    ENABLE_DATA_FORM_EXTRAS && ENABLE_TOWER_TERRACES && Math.max(tower.baseW, tower.baseD) > 1.42 && tower.height > 8;
  const terraceY = MathUtils.clamp(tower.height * MathUtils.lerp(0.34, 0.62, hash01(tower.sequence, 5411)), 2.2, tower.height - 0.9);
  const antennaCount =
    ENABLE_DATA_FORM_EXTRAS && (tower.intensity > 0.82 || tower.heightScore > 0.9) ? (hash01(tower.sequence, 5423) > 0.55 ? 2 : 1) : 0;
  const antennaOffsets = useMemo(() => {
    const offsets: Array<[number, number]> = [];
    const rx = Math.max(0.12, tower.footprintX * 0.22);
    const rz = Math.max(0.12, tower.footprintZ * 0.22);
    for (let i = 0; i < antennaCount; i++) {
      const sx = i === 0 ? -1 : 1;
      offsets.push([sx * rx * MathUtils.lerp(0.6, 1.0, hash01(tower.sequence, i, 5431)), rz * (hash01(tower.sequence, i, 5437) - 0.5)]);
    }
    return offsets;
  }, [antennaCount, tower.footprintX, tower.footprintZ, tower.sequence]);

  useEffect(() => {
    coreRefs.current.length = segments.length;
    shellRefs.current.length = segments.length;
    edgeRefs.current.length = segments.length;
    bandRefs.current.length = bandFractions.length;
    microBandRefs.current.length = microPanelFractions.length;
    antennaTipRefs.current.length = antennaCount;
  }, [segments.length, bandFractions.length, microPanelFractions.length, antennaCount]);

  useEffect(() => {
    return () => {
      for (let i = 0; i < outlineGeometries.length; i++) {
        outlineGeometries[i]?.dispose();
      }
      outlineMaterial.dispose();
    };
  }, [outlineGeometries, outlineMaterial]);

  const isHovered = hoveredTowerSequence === tower.sequence;
  const focusMode = hoveredTowerSequence != null;

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    focusMixRef.current = MathUtils.damp(focusMixRef.current, focusMode ? 1 : 0, 8.5, delta);
    hoverMixRef.current = MathUtils.damp(hoverMixRef.current, isHovered ? 1 : 0, 11, delta);

    const now = Date.now();
    const elapsed = now - tower.emittedAt;
    const riseT = MathUtils.clamp(elapsed / BIRTH_RISE_MS, 0, 1);
    const riseScaleY = Math.max(0.0001, easeOutBack(riseT, BIRTH_OVERSHOOT));
    const glowT = MathUtils.clamp((elapsed - BIRTH_GLOW_DELAY_MS) / BIRTH_GLOW_RAMP_MS, 0, 1);
    const glowAlphaBirth = easeOutCubic(glowT);

    if (!settledRef.current) {
      group.scale.y = riseScaleY;
      if (riseT >= 1 && glowT >= 1) {
        group.scale.y = 1;
        settledRef.current = true;
      }
    } else if (group.scale.y !== 1) {
      group.scale.y = 1;
    }

    const birthGlowAlpha = settledRef.current ? 1 : glowAlphaBirth;
    const nonHoverFocusFactor = focusMode && !isHovered ? focusMixRef.current : 0;
    const focusDim = MathUtils.lerp(1, FOCUS_NON_HOVER_DIM, nonHoverFocusFactor);
    const hoverBoost = MathUtils.lerp(1, HOVER_ORANGE_BOOST, hoverMixRef.current);

    outlineMaterial.opacity = MathUtils.damp(
      outlineMaterial.opacity,
      MathUtils.clamp(0.72 * focusDim * MathUtils.lerp(1, 1.25, hoverMixRef.current), 0, 1),
      10,
      delta
    );
    outlineMaterial.color.copy(
      tempColorA.copy(BTC_SELL_WARM).lerp(BTC_ORANGE, hoverMixRef.current * 0.92 + (tower.isHero ? 0.08 : 0))
    );

    const crownMat = crownRef.current?.material as { opacity?: number; color?: Color } | undefined;
    if (crownMat?.color) {
      crownMat.color.copy(
        tempColorA
          .copy(glowColor)
          .lerp(districtAccentColor, 0.14)
          .lerp(BTC_ORANGE, hoverMixRef.current * 0.72)
      );
    }
    if (crownMat) {
      const crownTarget =
        CROWN_OPACITY * tower.glowStrength * tower.capGlowBoost * birthGlowAlpha * focusDim * hoverBoost * (isTallest ? 1.06 : 1);
      crownMat.opacity = MathUtils.damp(crownMat.opacity ?? 0, MathUtils.clamp(crownTarget, 0, 1), 10, delta);
    }
    const loserHazeMat = topLoserHazeRef.current?.material as { opacity?: number; color?: Color } | undefined;
    if (loserHazeMat?.color) {
      loserHazeMat.color.copy(tempColorA.set('#6f95c8').lerp(tempColorB.set('#9ec1e9'), hoverMixRef.current * 0.42));
    }
    if (loserHazeMat) {
      const loserTarget =
        tower.mode === 'top200' && tower.isTopLoser
          ? 0.22 * birthGlowAlpha * focusDim * MathUtils.lerp(1, 1.14, hoverMixRef.current)
          : 0;
      loserHazeMat.opacity = MathUtils.damp(loserHazeMat.opacity ?? 0, loserTarget, 9, delta);
    }
    const volumeBandMat = topVolumeBandRef.current?.material as { opacity?: number; color?: Color } | undefined;
    if (volumeBandMat?.color) {
      volumeBandMat.color.copy(tempColorA.set('#f9d39c').lerp(BTC_ORANGE, 0.2 + hoverMixRef.current * 0.5));
    }
    if (volumeBandMat) {
      const volumeTarget =
        tower.mode === 'top200' && tower.isTopVolume
          ? 0.3 * birthGlowAlpha * focusDim * MathUtils.lerp(1, 1.1, hoverMixRef.current)
          : 0;
      volumeBandMat.opacity = MathUtils.damp(volumeBandMat.opacity ?? 0, volumeTarget, 9, delta);
    }

    for (let i = 0; i < segments.length; i++) {
      const core = coreRefs.current[i];
      const shell = shellRefs.current[i];
      const edge = edgeRefs.current[i];
      const segBoost = segments[i]?.isTop ? 1.08 : 1;
      const coreMat = core?.material as
        | { color?: Color; emissive?: Color; emissiveIntensity?: number }
        | undefined;
      const shellMat = shell?.material as { opacity?: number; color?: Color } | undefined;
      const edgeMat = edge?.material as { opacity?: number; color?: Color } | undefined;

      if (coreMat?.color) {
        const colorTarget = tempColorA.copy(coreColor);
        if (focusMode && !isHovered) colorTarget.lerp(tempColorB.set('#11161d'), 0.68);
        if (tower.isHero && !isHovered) colorTarget.lerp(BTC_ORANGE, 0.04);
        if (isHovered) colorTarget.lerp(BTC_ORANGE, 0.54 * hoverMixRef.current);
        coreMat.color.copy(colorTarget);
      }
      if (coreMat?.emissive) {
        const emissiveTarget = tempColorB.copy(coreColor).lerp(glowColor, 0.18 + tower.heightScore * 0.12);
        if (focusMode && !isHovered) emissiveTarget.multiplyScalar(0.44);
        if (isHovered) emissiveTarget.lerp(BTC_ORANGE, 0.74 * hoverMixRef.current);
        coreMat.emissive.copy(emissiveTarget);
      }
      if (typeof coreMat?.emissiveIntensity === 'number') {
        const baseEi = (segments[i]?.isTop ? 0.055 : 0.045) * (tower.isHero ? 1.08 : 1);
        coreMat.emissiveIntensity = MathUtils.damp(
          coreMat.emissiveIntensity,
          baseEi * focusDim * MathUtils.lerp(1, 1.6, hoverMixRef.current),
          10,
          delta
        );
      }

      if (shellMat?.color) {
        shellMat.color.copy(tempColorA.copy(glowColor).lerp(BTC_ORANGE, hoverMixRef.current * 0.85));
      }
      if (shellMat) {
        const shellTarget = GLOW_SHELL_OPACITY * tower.glowStrength * segBoost * birthGlowAlpha * focusDim * hoverBoost;
        shellMat.opacity = MathUtils.damp(shellMat.opacity ?? 0, MathUtils.clamp(shellTarget, 0, 1), 10, delta);
      }

      if (edgeMat?.color) {
        edgeMat.color.copy(tempColorA.copy(BTC_SELL_WARM).lerp(BTC_ORANGE, hoverMixRef.current * 0.95));
      }
      if (edgeMat) {
        const edgeTarget = GLOW_EDGE_OPACITY * tower.glowStrength * segBoost * birthGlowAlpha * focusDim * hoverBoost;
        edgeMat.opacity = MathUtils.damp(edgeMat.opacity ?? 0, MathUtils.clamp(edgeTarget, 0, 1), 10, delta);
      }
    }

    for (let i = 0; i < bandRefs.current.length; i++) {
      const band = bandRefs.current[i];
      if (!band) continue;
      band.visible = i < tower.bandCount;
      const mat = band.material as { opacity?: number; color?: Color } | undefined;
      if (mat) {
        const localFade = 0.9 - i * 0.08;
        if (mat.color) {
          mat.color.copy(
            tempColorA
              .copy(glowColor)
              .lerp(districtAccentColor, 0.1 + i * 0.02)
              .lerp(BTC_ORANGE, hoverMixRef.current * 0.75)
          );
        }
        const bandTarget = BAND_OPACITY * tower.glowStrength * birthGlowAlpha * localFade * focusDim * hoverBoost;
        mat.opacity = MathUtils.damp(mat.opacity ?? 0, MathUtils.clamp(bandTarget, 0, 1), 10, delta);
      }
    }

    for (let i = 0; i < microBandRefs.current.length; i++) {
      const band = microBandRefs.current[i];
      if (!band) continue;
      const mat = band.material as { opacity?: number; color?: Color } | undefined;
      const phase = Date.now() * 0.00045 + tower.sequence * 0.13 + i * 0.8;
      const scan = 0.5 + 0.5 * Math.sin(phase);
      band.position.y = tower.height * microPanelFractions[i] + (scan - 0.5) * 0.03;
      if (mat?.color) {
        mat.color.copy(tempColorA.copy(districtAccentColor).lerp(glowColor, 0.55).lerp(BTC_ORANGE, hoverMixRef.current * 0.3));
      }
      if (mat) {
        const base = (i === 0 ? 0.08 : 0.06) * (ENABLE_DATA_FORM_EXTRAS ? 1 : 0);
        mat.opacity = MathUtils.damp(mat.opacity ?? 0, base * (0.65 + scan * 0.35) * focusDim, 8, delta);
      }
    }

    for (let i = 0; i < antennaTipRefs.current.length; i++) {
      const tip = antennaTipRefs.current[i];
      if (!tip) continue;
      const mat = tip.material as { opacity?: number; color?: Color } | undefined;
      const blink = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(Date.now() * 0.0012 + tower.sequence * 0.21 + i * 1.3));
      if (mat?.color) {
        mat.color.copy(tempColorA.copy(BTC_PALE_AMBER).lerp(BTC_ORANGE, 0.35 + hoverMixRef.current * 0.45));
      }
      if (mat) {
        mat.opacity = MathUtils.damp(mat.opacity ?? 0, 0.24 * blink * focusDim, 7.5, delta);
      }
    }
  });

  return (
    <group ref={groupRef} position={[tower.x, TOWER_GROUND_LIFT_Y, tower.z]} scale={[1, 0.0001, 1]}>
      <mesh
        position={[0, Math.max(0.25, tower.height * 0.5), 0]}
        renderOrder={6.01}
        userData={{ towerSequence: tower.sequence }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverTower?.(tower.sequence);
        }}
        onPointerMove={(e) => {
          e.stopPropagation();
          onHoverTower?.(tower.sequence);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          const stillSameTower =
            e.intersections?.some(
              (hit) =>
                (hit.object as { userData?: { towerSequence?: number } }).userData?.towerSequence === tower.sequence
            ) ?? false;
          if (!stillSameTower) onHoverTower?.(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelectTower?.(tower.sequence);
        }}
      >
        <boxGeometry
          args={[
            Math.max(tower.baseW, tower.footprintX) * 1.22,
            Math.max(0.4, tower.height + 0.25),
            Math.max(tower.baseD, tower.footprintZ) * 1.22
          ]}
        />
        <meshBasicMaterial transparent opacity={0} colorWrite={false} depthTest={false} depthWrite={false} />
      </mesh>

      {segments.map((seg, i) => (
        <group key={`${tower.sequence}-seg-${seg.id}-${i}`} position={[seg.ox ?? 0, seg.y, seg.oz ?? 0]}>
          <mesh
            castShadow={RUNTIME_QUALITY_CONFIG.shadows}
            receiveShadow={RUNTIME_QUALITY_CONFIG.shadows}
            ref={(el) => {
              coreRefs.current[i] = el;
            }}
          >
            <boxGeometry args={[seg.sx, seg.height, seg.sz]} />
            <meshStandardMaterial
              color={coreColor}
              transparent={false}
              roughness={0.38}
              metalness={0.16}
              emissive={coreColor}
              emissiveIntensity={seg.isTop ? 0.055 : 0.045}
              depthTest
              depthWrite
            />
          </mesh>
          <lineSegments
            scale={[1.004, 1.004, 1.004]}
            geometry={outlineGeometries[i]}
            material={outlineMaterial}
            renderOrder={6.08}
            frustumCulled={false}
          />
          <mesh
            ref={(el) => {
              shellRefs.current[i] = el;
            }}
            scale={[GLOW_SHELL_SCALE, 1.002, GLOW_SHELL_SCALE]}
            renderOrder={6.12}
          >
            <boxGeometry args={[seg.sx, seg.height, seg.sz]} />
            <meshBasicMaterial
              color={glowColor}
              transparent
              opacity={0}
              toneMapped={false}
              depthTest
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
              blending={AdditiveBlending}
            />
          </mesh>
          <mesh
            ref={(el) => {
              edgeRefs.current[i] = el;
            }}
            scale={[GLOW_EDGE_SCALE, 1.006, GLOW_EDGE_SCALE]}
            renderOrder={6.14}
          >
            <boxGeometry args={[seg.sx, seg.height, seg.sz]} />
            <meshBasicMaterial
              color={strokeColor}
              wireframe
              transparent
              opacity={0}
              toneMapped={false}
              depthTest
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
              blending={AdditiveBlending}
            />
          </mesh>
        </group>
      ))}

      {bandFractions.map((f, i) => (
        <mesh
          key={`${tower.sequence}-band-${i}`}
          ref={(el) => {
            bandRefs.current[i] = el;
          }}
          position={[0, tower.height * f, 0]}
          renderOrder={6.18}
          visible={i < tower.bandCount}
        >
          <boxGeometry
            args={[
              Math.max(0.18, tower.footprintX * (i % 2 === 0 ? 1.04 : 0.92)),
              0.05,
              Math.max(0.18, tower.footprintZ * (i % 2 === 0 ? 1.04 : 0.92))
            ]}
          />
          <meshBasicMaterial
            color={glowColor}
            transparent
            opacity={0}
            toneMapped={false}
            depthTest
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      ))}

      {terraceEnabled ? (
        <>
          <mesh position={[0, terraceY, 0]} renderOrder={6.165}>
            <boxGeometry args={[tower.footprintX * 0.9, 0.07, tower.footprintZ * 0.9]} />
            <meshStandardMaterial
              color={coreColor}
              roughness={0.44}
              metalness={0.14}
              emissive={coreColor}
              emissiveIntensity={0.03}
              depthTest
              depthWrite
            />
          </mesh>
          <mesh position={[0, terraceY + TOWER_DETAIL_BAND_Y_EPS, 0]} renderOrder={6.168}>
            <boxGeometry args={[tower.footprintX * 0.96, 0.03, tower.footprintZ * 0.96]} />
            <meshBasicMaterial
              color={tower.districtAccentColor}
              transparent
              opacity={0.09}
              toneMapped={false}
              depthTest
              depthWrite={false}
              blending={AdditiveBlending}
            />
          </mesh>
        </>
      ) : null}

      {ENABLE_DATA_FORM_EXTRAS
        ? microPanelFractions.map((f, i) => (
            <mesh
              key={`${tower.sequence}-micro-${i}`}
              ref={(el) => {
                microBandRefs.current[i] = el;
              }}
              position={[0, tower.height * f, 0]}
              renderOrder={6.182}
            >
              <boxGeometry
                args={[
                  Math.max(0.16, tower.footprintX * (0.86 - i * 0.06)),
                  0.018,
                  Math.max(0.16, tower.footprintZ * (0.86 - i * 0.06))
                ]}
              />
              <meshBasicMaterial
                color={tower.districtAccentColor}
                transparent
                opacity={0}
                toneMapped={false}
                depthTest
                depthWrite={false}
                blending={AdditiveBlending}
              />
            </mesh>
          ))
        : null}

      {ENABLE_DATA_FORM_EXTRAS && antennaOffsets.length > 0
        ? antennaOffsets.map((offset, i) => {
            const antennaH = MathUtils.lerp(0.55, 1.35, hash01(tower.sequence, i, 5441)) * (tower.isHero ? 1.15 : 1);
            return (
              <group key={`${tower.sequence}-ant-${i}`} position={[offset[0], tower.height + 0.12, offset[1]]}>
                <mesh renderOrder={6.205}>
                  <boxGeometry args={[0.035, antennaH, 0.035]} />
                  <meshStandardMaterial
                    color="#1f252d"
                    roughness={0.34}
                    metalness={0.28}
                    emissive="#2a313a"
                    emissiveIntensity={0.04}
                    depthTest
                    depthWrite
                  />
                </mesh>
                <mesh position={[0, 0, 0]} scale={[1.35, 1.02, 1.35]} renderOrder={6.208}>
                  <boxGeometry args={[0.035, antennaH, 0.035]} />
                  <meshBasicMaterial
                    color={tower.districtAccentColor}
                    transparent
                    opacity={0.08}
                    toneMapped={false}
                    depthTest
                    depthWrite={false}
                    blending={AdditiveBlending}
                    polygonOffset
                    polygonOffsetFactor={-1}
                    polygonOffsetUnits={-2}
                  />
                </mesh>
                <mesh
                  ref={(el) => {
                    antennaTipRefs.current[i] = el;
                  }}
                  position={[0, antennaH * 0.5 + 0.04, 0]}
                  renderOrder={6.21}
                >
                  <boxGeometry args={[0.055, 0.055, 0.055]} />
                  <meshBasicMaterial
                    color="#ffe8c8"
                    transparent
                    opacity={0}
                    toneMapped={false}
                    depthTest
                    depthWrite={false}
                    blending={AdditiveBlending}
                  />
                </mesh>
              </group>
            );
          })
        : null}

      {tower.mode === 'top200' ? <TopCoinLogoDisc tower={tower} focusMode={focusMode} isHovered={isHovered} /> : null}
      {isTallest && tower.mode !== 'top200' ? <TallestBtcDecals tower={tower} focusMode={focusMode} isHovered={isHovered} /> : null}
      <mesh
        ref={topLoserHazeRef}
        position={[0, 0.12, 0]}
        rotation={[Math.PI, 0, 0]}
        renderOrder={6.11}
        visible={tower.mode === 'top200' && Boolean(tower.isTopLoser)}
      >
        <coneGeometry args={[Math.max(0.35, Math.max(tower.baseW, tower.baseD) * 0.46), 1.1, 28, 1, true]} />
        <meshBasicMaterial
          color="#6f95c8"
          transparent
          opacity={0}
          toneMapped={false}
          depthTest
          depthWrite={false}
          side={DoubleSide}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh
        ref={topVolumeBandRef}
        position={[0, 0.16, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        renderOrder={6.19}
        visible={tower.mode === 'top200' && Boolean(tower.isTopVolume)}
      >
        <torusGeometry
          args={[
            Math.max(0.38, Math.max(tower.baseW, tower.baseD) * 0.58),
            Math.max(0.03, Math.max(tower.baseW, tower.baseD) * 0.045),
            12,
            56
          ]}
        />
        <meshBasicMaterial
          color="#f9d39c"
          transparent
          opacity={0}
          toneMapped={false}
          depthTest
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>

      <mesh ref={crownRef} position={[0, tower.height + 0.08, 0]} renderOrder={6.2}>
        <boxGeometry
          args={[
            Math.max(0.16, (topSegment?.sx ?? tower.footprintX) * 0.9),
            0.09,
            Math.max(0.16, (topSegment?.sz ?? tower.footprintZ) * 0.9)
          ]}
        />
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={0}
          toneMapped={false}
          depthTest
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

type LineSegment = [number, number, number, number, number, number];
type LinePoints = [number, number, number][];

function buildGridSegments(extent: number, step: number) {
  const segments: LineSegment[] = [];
  const half = extent * 0.5;
  for (let v = -half; v <= half + 0.001; v += step) {
    segments.push([-half, 0, v, half, 0, v]);
    segments.push([v, 0, -half, v, 0, half]);
  }
  return segments;
}

function buildWindRoseSegments(radius: number) {
  const segments: LineSegment[] = [];
  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [Math.SQRT1_2, Math.SQRT1_2],
    [-Math.SQRT1_2, Math.SQRT1_2],
    [-Math.SQRT1_2, -Math.SQRT1_2],
    [Math.SQRT1_2, -Math.SQRT1_2]
  ] as const;

  for (let i = 0; i < dirs.length; i++) {
    const [dx, dz] = dirs[i];
    const inner = i < 4 ? radius * 0.08 : radius * 0.12;
    const outer = i < 4 ? radius : radius * 0.92;
    segments.push([dx * inner, 0, dz * inner, dx * outer, 0, dz * outer]);
  }

  // short crosshair accents near center
  const c = radius * 0.18;
  segments.push([-c, 0, 0, c, 0, 0]);
  segments.push([0, 0, -c, 0, 0, c]);
  return segments;
}

function segmentsToLinePointPairs(segments: LineSegment[]) {
  return segments.map(
    (s) =>
      [
        [s[0], s[1], s[2]],
        [s[3], s[4], s[5]]
      ] as LinePoints
  );
}

function buildCircleLinePoints(radius: number, segments = 96): LinePoints {
  const pts: LinePoints = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([Math.cos(a) * radius, 0, Math.sin(a) * radius]);
  }
  return pts;
}

function ScreenSpaceGroundLine({
  points,
  y,
  color,
  opacity,
  lineWidth,
  renderOrder,
  additive = false,
  focusMode = false,
  focusDim = FOCUS_GROUND_DIM
}: {
  points: LinePoints;
  y: number;
  color: string;
  opacity: number;
  lineWidth: number;
  renderOrder: number;
  additive?: boolean;
  focusMode?: boolean;
  focusDim?: number;
}) {
  const { size } = useThree();
  const opacityRef = useRef(opacity);
  const geometry = useMemo(() => {
    const g = new LineGeometry();
    const flat: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!p) continue;
      flat.push(p[0], p[1], p[2]);
    }
    g.setPositions(flat);
    return g;
  }, [points]);

  const material = useMemo(() => {
    const m = new LineMaterial({
      color,
      transparent: true,
      opacity,
      linewidth: lineWidth,
      depthWrite: false,
      depthTest: true
    });
    m.toneMapped = false;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
    if (additive) m.blending = AdditiveBlending;
    return m;
  }, [color, opacity, lineWidth, additive]);

  const line = useMemo(() => {
    const l = new Line2(geometry, material);
    l.computeLineDistances();
    l.frustumCulled = false;
    l.renderOrder = renderOrder;
    l.position.set(0, y, 0);
    return l;
  }, [geometry, material, renderOrder, y]);

  useEffect(() => {
    material.resolution.set(size.width, size.height);
  }, [material, size.width, size.height]);

  useEffect(() => {
    line.renderOrder = renderOrder;
    line.position.y = y;
    material.linewidth = lineWidth;
  }, [line, material, renderOrder, y, opacity, lineWidth]);

  useEffect(() => {
    opacityRef.current = opacity;
  }, [opacity]);

  useFrame((_, delta) => {
    const target = opacityRef.current * (focusMode ? focusDim : 1);
    material.opacity = MathUtils.damp(material.opacity, target, 9.5, delta);
  });

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return <primitive object={line} />;
}

function CircuitBoardGround({
  bounds,
  focusMode = false,
  marketPulse = 0
}: {
  bounds: SandboxBounds;
  focusMode?: boolean;
  marketPulse?: number;
}) {
  const boardSize = MathUtils.clamp(Math.max(420, bounds.radius * 8 + 180), 420, 1400);
  const targetGlowRadius = clampFinite(Math.max(30, bounds.radius * RADIAL_GLOW_RADIUS_MULT), 64, 30, boardSize * 0.48);
  const arteryLen = Math.min(boardSize * 0.92, Math.max(140, bounds.radius * 3.6));
  const groundGraphicY = GROUND_GRAPHIC_Y;
  const lineExtent = MathUtils.clamp(Math.max(200, bounds.radius * 4.2), 200, boardSize * 0.94);
  const gridStep = MathUtils.clamp(Math.round(Math.max(10, bounds.radius * 0.16)), 10, 20);
  const windRoseRadius = MathUtils.clamp(Math.max(68, bounds.radius * 2.35), 68, lineExtent * 0.62);
  const glowMeshRef = useRef<Mesh>(null);
  const smoothGlowRadiusRef = useRef(targetGlowRadius);
  const focusMixRef = useRef(0);
  const moodRef = useRef(marketPulse);
  const glowGeometry = useMemo(() => new PlaneGeometry(1, 1, 1, 1), []);
  const gridSegments = useMemo(() => buildGridSegments(lineExtent, gridStep), [lineExtent, gridStep]);
  const gridLinePairs = useMemo(() => segmentsToLinePointPairs(gridSegments), [gridSegments]);
  const windRoseSegments = useMemo(() => buildWindRoseSegments(windRoseRadius), [windRoseRadius]);
  const windRoseAxisLines = useMemo(() => segmentsToLinePointPairs(windRoseSegments.slice(0, 4)), [windRoseSegments]);
  const windRoseDiagonalLines = useMemo(() => segmentsToLinePointPairs(windRoseSegments.slice(4, 8)), [windRoseSegments]);
  const windRoseCrosshairLines = useMemo(() => segmentsToLinePointPairs(windRoseSegments.slice(8)), [windRoseSegments]);
  const outerRingPoints = useMemo(() => buildCircleLinePoints(windRoseRadius * 0.92, 96), [windRoseRadius]);
  const innerRingPoints = useMemo(() => buildCircleLinePoints(windRoseRadius * 0.62, 72), [windRoseRadius]);
  const glowUniforms = useMemo(
    () => ({
      uCenterColor: { value: new Color('#F5D8AE') },
      uRingColor: { value: new Color('#F7931A') },
      uOpacity: { value: 1.02 }
    }),
    []
  );
  const glowMaterial = useMemo(() => {
    const material = new ShaderMaterial({
      uniforms: glowUniforms,
      vertexShader: RADIAL_GLOW_VERTEX,
      fragmentShader: RADIAL_GLOW_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending
    });
    material.toneMapped = false;
    return material;
  }, [glowUniforms]);
  useEffect(() => {
    return () => {
      glowGeometry.dispose();
      glowMaterial.dispose();
    };
  }, [glowGeometry, glowMaterial]);

  useFrame((_, delta) => {
    focusMixRef.current = MathUtils.damp(focusMixRef.current, focusMode ? 1 : 0, 6.5, delta);
    moodRef.current = MathUtils.damp(moodRef.current, marketPulse, MARKET_PULSE_DAMP, delta);
    const mood = ENABLE_MARKET_PULSE ? moodRef.current : 0;
    const safeTarget = clampFinite(targetGlowRadius, smoothGlowRadiusRef.current || 64, 30, boardSize * 0.48);
    if (!Number.isFinite(smoothGlowRadiusRef.current)) {
      smoothGlowRadiusRef.current = safeTarget;
    }
    smoothGlowRadiusRef.current = MathUtils.damp(smoothGlowRadiusRef.current, safeTarget, RADIAL_GLOW_DAMP, delta);
    const r = MathUtils.clamp(smoothGlowRadiusRef.current, 30, boardSize * 0.48);
    if (glowMeshRef.current) {
      glowMeshRef.current.scale.set(r * 2.2, r * 2.2, 1);
      glowUniforms.uOpacity.value =
        MathUtils.lerp(1.08, 0.8, focusMixRef.current) *
        MathUtils.lerp(1 - MARKET_PULSE_GROUND_OPACITY_BREATH, 1 + MARKET_PULSE_GROUND_OPACITY_BREATH, mood);
    }
    glowUniforms.uCenterColor.value.copy(tempColorA.set('#F0D0A7').lerp(tempColorB.set('#FFD8A1'), mood * 0.35));
    glowUniforms.uRingColor.value.copy(tempColorA.set('#e1891a').lerp(tempColorB.set('#f7931a'), 0.55 + mood * 0.3));
  });

  const focusStaticScale = focusMode ? FOCUS_GROUND_DIM : 1;

  return (
    <group>
      {/* Layer stack: 0=deck, 1=radial glow (only depthTest off), 2=grid/wind-rose overlay lines, 3=guide lines */}
      <mesh
        ref={glowMeshRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, GROUND_GLOW_Y, 0]}
        scale={[targetGlowRadius * 2.2, targetGlowRadius * 2.2, 1]}
        renderOrder={1}
        geometry={glowGeometry}
        material={glowMaterial}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_SLAB_Y, 0]} receiveShadow renderOrder={0}>
        <planeGeometry args={[boardSize, boardSize]} />
        <meshStandardMaterial
          color="#05070b"
          roughness={0.97}
          metalness={0.04}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_DECK_Y, 0]} renderOrder={0}>
        <planeGeometry args={[boardSize * 0.99, boardSize * 0.99]} />
        <meshStandardMaterial
          color="#080c11"
          roughness={0.9}
          metalness={0.08}
          emissive="#10161f"
          emissiveIntensity={0.05}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>

      {gridLinePairs.map((points, i) => (
        <ScreenSpaceGroundLine
          key={`grid-${i}`}
          points={points}
          y={groundGraphicY + 0.0005}
          color={i % 2 === 0 ? '#d2b788' : '#bca173'}
          opacity={i % 4 === 0 ? 0.085 : 0.05}
          lineWidth={i % 4 === 0 ? 1.25 : 0.95}
          renderOrder={2.02}
          focusMode={focusMode}
          focusDim={FOCUS_GROUND_DIM}
        />
      ))}
      {windRoseDiagonalLines.map((points, i) => (
        <ScreenSpaceGroundLine
          key={`wr-diag-${i}`}
          points={points}
          y={groundGraphicY + 0.0007}
          color="#d7c09a"
          opacity={0.24}
          lineWidth={2.6}
          renderOrder={2.08}
          additive
          focusMode={focusMode}
          focusDim={FOCUS_GROUND_DIM}
        />
      ))}
      {windRoseAxisLines.map((points, i) => (
        <ScreenSpaceGroundLine
          key={`wr-axis-${i}`}
          points={points}
          y={groundGraphicY + 0.0009}
          color={i % 2 === 0 ? '#F4D3A2' : '#F7931A'}
          opacity={i % 2 === 0 ? 0.33 : 0.3}
          lineWidth={3.6}
          renderOrder={2.1}
          additive
          focusMode={focusMode}
          focusDim={FOCUS_GROUND_DIM}
        />
      ))}
      {windRoseCrosshairLines.map((points, i) => (
        <ScreenSpaceGroundLine
          key={`wr-cross-${i}`}
          points={points}
          y={groundGraphicY + 0.001}
          color="#f6ead7"
          opacity={0.2}
          lineWidth={2.4}
          renderOrder={2.12}
          focusMode={focusMode}
          focusDim={FOCUS_GROUND_DIM}
        />
      ))}
      <ScreenSpaceGroundLine
        points={outerRingPoints}
        y={groundGraphicY + 0.0011}
        color="#F7931A"
        opacity={0.24}
        lineWidth={3.0}
        renderOrder={2.16}
        additive
        focusMode={focusMode}
        focusDim={FOCUS_GROUND_DIM}
      />
      <ScreenSpaceGroundLine
        points={innerRingPoints}
        y={groundGraphicY + 0.00115}
        color="#f2e4cf"
        opacity={0.14}
        lineWidth={2.0}
        renderOrder={2.14}
        focusMode={focusMode}
        focusDim={FOCUS_GROUND_DIM}
      />

      <mesh position={[0, groundGraphicY + 0.002, 0]} renderOrder={3}>
        <boxGeometry args={[0.18, 0.01, arteryLen]} />
        <meshBasicMaterial
          color="#F7931A"
          transparent
          opacity={0.34 * focusStaticScale}
          toneMapped={false}
          depthWrite={false}
          depthTest
        />
      </mesh>
      <mesh position={[0, groundGraphicY + 0.0025, 0]} renderOrder={3}>
        <boxGeometry args={[arteryLen * 0.72, 0.01, 0.16]} />
        <meshBasicMaterial
          color="#f4e8d6"
          transparent
          opacity={0.18 * focusStaticScale}
          toneMapped={false}
          depthWrite={false}
          depthTest
        />
      </mesh>
      <mesh rotation={[0, Math.PI / 4, 0]} position={[0, groundGraphicY + 0.003, 0]} renderOrder={3}>
        <boxGeometry args={[0.12, 0.008, arteryLen * 0.8]} />
        <meshBasicMaterial
          color="#F7931A"
          transparent
          opacity={0.2 * focusStaticScale}
          toneMapped={false}
          depthWrite={false}
          depthTest
        />
      </mesh>
      <mesh rotation={[0, -Math.PI / 4, 0]} position={[0, groundGraphicY + 0.003, 0]} renderOrder={3}>
        <boxGeometry args={[0.12, 0.008, arteryLen * 0.62]} />
        <meshBasicMaterial
          color="#ffe7c4"
          transparent
          opacity={0.15 * focusStaticScale}
          toneMapped={false}
          depthWrite={false}
          depthTest
        />
      </mesh>
    </group>
  );
}

function ParksLayer({
  parks,
  trees,
  focusMode = false
}: {
  parks: ParkDatum[];
  trees: ParkTreeDatum[];
  focusMode?: boolean;
}) {
  const patchRefs = useRef<Array<Mesh | null>>([]);
  const pathRefs = useRef<Array<Mesh | null>>([]);
  const trunkRef = useRef<ThreeInstancedMesh>(null);
  const crownRef = useRef<ThreeInstancedMesh>(null);
  const trunkWireRef = useRef<ThreeInstancedMesh>(null);
  const crownWireRef = useRef<ThreeInstancedMesh>(null);
  const crownGlowRef = useRef<ThreeInstancedMesh>(null);
  const fireflyRef = useRef<ThreeInstancedMesh>(null);
  const focusMixRef = useRef(0);
  const matrixRef = useRef(new Matrix4());
  const posRef = useRef(new Vector3());
  const sclRef = useRef(new Vector3());
  const quatRef = useRef(new Quaternion());
  const upRef = useRef(new Vector3(0, 1, 0));
  const crownColorRef = useRef(new Color());
  const trunkColorRef = useRef(new Color());
  const treeBirthMeta = useMemo(() => {
    const meta = Array.from({ length: trees.length }, () => ({ parkIndex: -1, localIndex: 0, emittedAt: 0 }));
    for (let p = 0; p < parks.length; p++) {
      const park = parks[p];
      if (!park) continue;
      for (let i = 0; i < park.treeCount; i++) {
        const treeIndex = park.treeStart + i;
        if (treeIndex < 0 || treeIndex >= meta.length) continue;
        meta[treeIndex] = { parkIndex: p, localIndex: i, emittedAt: park.emittedAt };
      }
    }
    return meta;
  }, [parks, trees.length]);
  const fireflySources = useMemo(() => {
    const indices: number[] = [];
    for (let p = 0; p < parks.length; p++) {
      const park = parks[p];
      if (!park) continue;
      const limit = Math.min(park.treeCount, park.fireflyCount);
      for (let i = 0; i < limit; i++) {
        indices.push(park.treeStart + i);
      }
    }
    return indices;
  }, [parks]);

  useEffect(() => {
    patchRefs.current.length = parks.length;
    pathRefs.current.length = parks.length * 2;
  }, [parks.length]);

  useEffect(() => {
    const trunk = trunkRef.current;
    const crown = crownRef.current;
    const trunkWire = trunkWireRef.current;
    const crownWire = crownWireRef.current;
    const crownGlow = crownGlowRef.current;
    const firefly = fireflyRef.current;
    if (!trunk || !crown || !trunkWire || !crownWire || !crownGlow || !firefly) return;

    const count = Math.min(trees.length, Math.max(1, trunk.instanceMatrix.count));
    trunk.count = count;
    crown.count = count;
    trunkWire.count = count;
    crownWire.count = count;
    crownGlow.count = count;
    firefly.count = Math.max(1, Math.min(fireflySources.length, Math.max(1, firefly.instanceMatrix.count)));
    const matrix = matrixRef.current;
    const pos = posRef.current;
    const scl = sclRef.current;
    const quat = quatRef.current;
    const up = upRef.current;
    const crownColor = crownColorRef.current;
    const trunkColor = trunkColorRef.current;

    for (let i = 0; i < count; i++) {
      const tree = trees[i];
      if (!tree) continue;
      quat.setFromAxisAngle(up, tree.yaw);

      pos.set(tree.x, TREE_BASE_Y + tree.trunkH * 0.5, tree.z);
      scl.set(Math.max(0.05, tree.crownR * 0.28), tree.trunkH, Math.max(0.05, tree.crownR * 0.28));
      matrix.compose(pos, quat, scl);
      trunk.setMatrixAt(i, matrix);
      trunk.setColorAt(i, trunkColor.set('#ece6dc').lerp(new Color('#fff8ee'), tree.tintMix * 0.35));
      scl.set(Math.max(0.05, tree.crownR * 0.29) * 1.04, tree.trunkH * 1.02, Math.max(0.05, tree.crownR * 0.29) * 1.04);
      matrix.compose(pos, quat, scl);
      trunkWire.setMatrixAt(i, matrix);

      pos.set(tree.x, TREE_BASE_Y + tree.trunkH + tree.crownH * 0.5, tree.z);
      scl.set(tree.crownR, tree.crownH, tree.crownR);
      matrix.compose(pos, quat, scl);
      crown.setMatrixAt(i, matrix);
      crown.setColorAt(i, crownColor.set('#f5efe4').lerp(new Color('#ffe0b4'), 0.22 + tree.tintMix * 0.24));
      scl.set(tree.crownR * 1.06, tree.crownH * 1.03, tree.crownR * 1.06);
      matrix.compose(pos, quat, scl);
      crownWire.setMatrixAt(i, matrix);
      scl.set(tree.crownR * 1.22, tree.crownH * 1.18, tree.crownR * 1.22);
      matrix.compose(pos, quat, scl);
      crownGlow.setMatrixAt(i, matrix);
      crownGlow.setColorAt(i, crownColor.set('#ffd7a0').lerp(new Color('#f7931a'), 0.25 + tree.tintMix * 0.35));

      if (i < firefly.count) {
        const fireflyTree = trees[fireflySources[i] ?? i] ?? tree;
        const fx = fireflyTree.x + (hash01(i, 9021) - 0.5) * fireflyTree.crownR * 0.9;
        const fz = fireflyTree.z + (hash01(i, 9029) - 0.5) * fireflyTree.crownR * 0.9;
        const fy =
          TREE_BASE_Y + fireflyTree.trunkH + fireflyTree.crownH * MathUtils.lerp(0.45, 0.82, hash01(i, 9037));
        pos.set(fx, fy, fz);
        scl.set(0.035 + hash01(i, 9041) * 0.025, 0.035 + hash01(i, 9047) * 0.03, 0.035 + hash01(i, 9053) * 0.025);
        matrix.compose(pos, quat, scl);
        firefly.setMatrixAt(i, matrix);
        firefly.setColorAt(i, crownColor.set('#ffeccd').lerp(new Color('#fff7ea'), hash01(i, 9059)));
      }
    }

    trunk.instanceMatrix.needsUpdate = true;
    crown.instanceMatrix.needsUpdate = true;
    trunkWire.instanceMatrix.needsUpdate = true;
    crownWire.instanceMatrix.needsUpdate = true;
    crownGlow.instanceMatrix.needsUpdate = true;
    firefly.instanceMatrix.needsUpdate = true;
    if (trunk.instanceColor) trunk.instanceColor.needsUpdate = true;
    if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
    if (crownGlow.instanceColor) crownGlow.instanceColor.needsUpdate = true;
    if (firefly.instanceColor) firefly.instanceColor.needsUpdate = true;
  }, [fireflySources.length, trees.length]);

  useFrame((_, delta) => {
    focusMixRef.current = MathUtils.damp(focusMixRef.current, focusMode ? 1 : 0, 7.5, delta);
    const dimScale = MathUtils.lerp(1, FOCUS_GROUND_DIM, focusMixRef.current);
    const nowMs = Date.now();
    for (let i = 0; i < patchRefs.current.length; i++) {
      const patch = patchRefs.current[i];
      const pathA = pathRefs.current[i * 2];
      const pathB = pathRefs.current[i * 2 + 1];
      const patchMat = patch?.material as { opacity?: number } | undefined;
      const pathAMat = pathA?.material as { opacity?: number } | undefined;
      const pathBMat = pathB?.material as { opacity?: number } | undefined;
      const park = parks[i];
      const parkElapsed = park ? nowMs - park.emittedAt : BIRTH_RISE_MS + BIRTH_GLOW_RAMP_MS;
      const parkRiseT = MathUtils.clamp(parkElapsed / BIRTH_RISE_MS, 0, 1);
      const parkGlowT = MathUtils.clamp((parkElapsed - BIRTH_GLOW_DELAY_MS) / BIRTH_GLOW_RAMP_MS, 0, 1);
      const parkBirthAlpha = easeOutCubic(parkGlowT) * MathUtils.clamp(parkRiseT * 1.15, 0, 1);
      if (patchMat) patchMat.opacity = MathUtils.damp(patchMat.opacity ?? 0.92, 0.92 * dimScale * parkBirthAlpha, 8.5, delta);
      if (pathAMat) pathAMat.opacity = MathUtils.damp(pathAMat.opacity ?? 0.14, 0.14 * dimScale * parkBirthAlpha, 8.5, delta);
      if (pathBMat) pathBMat.opacity = MathUtils.damp(pathBMat.opacity ?? 0.1, 0.1 * dimScale * parkBirthAlpha, 8.5, delta);
    }

    const trunk = trunkRef.current;
    const crown = crownRef.current;
    const trunkWire = trunkWireRef.current;
    const crownWire = crownWireRef.current;
    const crownGlow = crownGlowRef.current;
    if (trunk && crown && trunkWire && crownWire && crownGlow) {
      const matrix = matrixRef.current;
      const pos = posRef.current;
      const scl = sclRef.current;
      const quat = quatRef.current;
      const up = upRef.current;
      const count = Math.min(trees.length, Math.max(1, trunk.instanceMatrix.count));
      trunk.count = count;
      crown.count = count;
      trunkWire.count = count;
      crownWire.count = count;
      crownGlow.count = count;
      for (let i = 0; i < count; i++) {
        const tree = trees[i];
        if (!tree) continue;
        const birth = treeBirthMeta[i];
        const localDelay = (birth?.localIndex ?? 0) * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 18 : 28);
        const elapsed = nowMs - ((birth?.emittedAt ?? nowMs) + localDelay);
        const riseT = MathUtils.clamp(elapsed / BIRTH_RISE_MS, 0, 1);
        const riseScaleY = Math.max(0.0001, easeOutBack(riseT, BIRTH_OVERSHOOT));
        const crownScaleXZ = MathUtils.lerp(0.25, 1, MathUtils.clamp(riseT * 1.15, 0, 1));
        quat.setFromAxisAngle(up, tree.yaw);

        const trunkH = tree.trunkH * riseScaleY;
        pos.set(tree.x, TREE_BASE_Y + trunkH * 0.5, tree.z);
        scl.set(Math.max(0.05, tree.crownR * 0.28) * crownScaleXZ, trunkH, Math.max(0.05, tree.crownR * 0.28) * crownScaleXZ);
        matrix.compose(pos, quat, scl);
        trunk.setMatrixAt(i, matrix);
        scl.set(
          Math.max(0.05, tree.crownR * 0.29) * 1.04 * crownScaleXZ,
          Math.max(0.0001, trunkH * 1.02),
          Math.max(0.05, tree.crownR * 0.29) * 1.04 * crownScaleXZ
        );
        matrix.compose(pos, quat, scl);
        trunkWire.setMatrixAt(i, matrix);

        const crownH = tree.crownH * riseScaleY;
        pos.set(tree.x, TREE_BASE_Y + trunkH + crownH * 0.5, tree.z);
        scl.set(tree.crownR * crownScaleXZ, crownH, tree.crownR * crownScaleXZ);
        matrix.compose(pos, quat, scl);
        crown.setMatrixAt(i, matrix);
        scl.set(tree.crownR * 1.06 * crownScaleXZ, Math.max(0.0001, crownH * 1.03), tree.crownR * 1.06 * crownScaleXZ);
        matrix.compose(pos, quat, scl);
        crownWire.setMatrixAt(i, matrix);
        scl.set(tree.crownR * 1.22 * crownScaleXZ, Math.max(0.0001, crownH * 1.18), tree.crownR * 1.22 * crownScaleXZ);
        matrix.compose(pos, quat, scl);
        crownGlow.setMatrixAt(i, matrix);
      }
      trunk.instanceMatrix.needsUpdate = true;
      crown.instanceMatrix.needsUpdate = true;
      trunkWire.instanceMatrix.needsUpdate = true;
      crownWire.instanceMatrix.needsUpdate = true;
      crownGlow.instanceMatrix.needsUpdate = true;
    }

    const trunkMat = trunkRef.current?.material as { opacity?: number; color?: Color } | undefined;
    if (trunkMat) {
      trunkMat.opacity = MathUtils.damp(trunkMat.opacity ?? 0.96, 0.96 * dimScale, 8.5, delta);
      if (trunkMat.color) trunkMat.color.copy(tempColorA.set('#eee7dc').lerp(tempColorB.set('#b8aea2'), focusMixRef.current * 0.45));
    }
    const crownMat = crownRef.current?.material as { opacity?: number; color?: Color } | undefined;
    if (crownMat) {
      crownMat.opacity = MathUtils.damp(crownMat.opacity ?? 0.96, 0.96 * dimScale, 8.5, delta);
      if (crownMat.color) crownMat.color.copy(tempColorA.set('#f7f0e5').lerp(tempColorB.set('#d9c7ae'), focusMixRef.current * 0.35));
    }
    const trunkWireMat = trunkWireRef.current?.material as { opacity?: number } | undefined;
    if (trunkWireMat) trunkWireMat.opacity = MathUtils.damp(trunkWireMat.opacity ?? 0.72, 0.72 * dimScale, 8.5, delta);
    const crownWireMat = crownWireRef.current?.material as { opacity?: number } | undefined;
    if (crownWireMat) crownWireMat.opacity = MathUtils.damp(crownWireMat.opacity ?? 0.78, 0.78 * dimScale, 8.5, delta);
    const crownGlowMat = crownGlowRef.current?.material as { opacity?: number } | undefined;
    if (crownGlowMat) crownGlowMat.opacity = MathUtils.damp(crownGlowMat.opacity ?? 0.16, 0.16 * dimScale, 8.5, delta);
    const fireflyMat = fireflyRef.current?.material as { opacity?: number } | undefined;
    if (fireflyMat) {
      const base = RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.13 : 0.2;
      fireflyMat.opacity = MathUtils.damp(fireflyMat.opacity ?? base, base * dimScale, 8.5, delta);
    }

    const firefly = fireflyRef.current;
    if (firefly && fireflySources.length > 0) {
      const now = performance.now() * 0.001;
      const matrix = matrixRef.current;
      const pos = posRef.current;
      const scl = sclRef.current;
      const quat = quatRef.current;
      quat.identity();
      const maxCount = Math.min(fireflySources.length, Math.max(1, firefly.instanceMatrix.count));
      firefly.count = maxCount;
      for (let i = 0; i < maxCount; i++) {
        const sourceIndex = fireflySources[i] ?? i;
        const tree = trees[sourceIndex];
        if (!tree) continue;
        const birth = treeBirthMeta[sourceIndex];
        const localDelay = (birth?.localIndex ?? 0) * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 18 : 28);
        const fireflyElapsed = nowMs - ((birth?.emittedAt ?? nowMs) + localDelay + BIRTH_GLOW_DELAY_MS);
        const fireflyT = MathUtils.clamp(fireflyElapsed / BIRTH_GLOW_RAMP_MS, 0, 1);
        if (fireflyT <= 0.02) {
          pos.set(tree.x, TREE_BASE_Y + tree.trunkH, tree.z);
          scl.set(0.0001, 0.0001, 0.0001);
          matrix.compose(pos, quat, scl);
          firefly.setMatrixAt(i, matrix);
          continue;
        }
        const driftAmp = (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.035 : 0.07) * Math.max(0.8, tree.crownR);
        const driftSpeed = (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.25 : 0.5) * MathUtils.lerp(0.7, 1.2, hash01(sourceIndex, 9067));
        const phase = hash01(sourceIndex, 9073) * Math.PI * 2;
        const dx = Math.cos(now * driftSpeed + phase) * driftAmp;
        const dz = Math.sin(now * driftSpeed * 0.87 + phase * 1.3) * driftAmp;
        const dy = Math.sin(now * driftSpeed * 1.35 + phase * 0.7) * driftAmp * 0.38;
        const fx = tree.x + dx;
        const fz = tree.z + dz;
        const fy = TREE_BASE_Y + tree.trunkH + tree.crownH * MathUtils.lerp(0.42, 0.88, hash01(sourceIndex, 9037)) + dy;
        const s =
          (0.028 + hash01(sourceIndex, 9041) * 0.022) *
          (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.85 : 1) *
          easeOutCubic(fireflyT);
        pos.set(fx, fy, fz);
        scl.set(s, s * 0.95, s);
        matrix.compose(pos, quat, scl);
        firefly.setMatrixAt(i, matrix);
      }
      firefly.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {parks.map((park, parkIndex) => {
        const lineLen = Math.min(park.w, park.d) * MathUtils.lerp(0.42, 0.78, hash01(parkIndex, park.w, park.d, 8011));
        const footpathSeg =
          park.linkX == null || park.linkZ == null ? null : segmentFromPoints(park.x, park.z, park.linkX, park.linkZ);
        return (
          <group key={park.id}>
            <group
              position={[park.x, PARK_PATCH_Y, park.z]}
              rotation={[-Math.PI / 2, park.yaw, 0]}
              renderOrder={2.55}
            >
              {ENABLE_PARK_PAD ? (
                <>
                  <mesh
                    ref={(el) => {
                      patchRefs.current[parkIndex] = el;
                    }}
                    renderOrder={2.55}
                  >
                    <circleGeometry args={[Math.max(0.6, park.radius), 20]} />
                    <meshStandardMaterial
                      color={park.patchColor}
                      roughness={0.84}
                      metalness={0.06}
                      emissive="#10151b"
                      emissiveIntensity={0.025}
                      transparent
                      opacity={0.16}
                      depthTest
                      depthWrite
                      polygonOffset
                      polygonOffsetFactor={-1}
                      polygonOffsetUnits={-1}
                    />
                  </mesh>
                  <mesh position={[0, 0.004, 0]} renderOrder={2.57}>
                    <ringGeometry args={[Math.max(0.4, park.radius * 0.9), Math.max(0.45, park.radius * 1.08), 32]} />
                    <meshBasicMaterial
                      color="#f7931a"
                      transparent
                      opacity={0.07}
                      toneMapped={false}
                      depthTest
                      depthWrite={false}
                      blending={AdditiveBlending}
                      polygonOffset
                      polygonOffsetFactor={-1}
                      polygonOffsetUnits={-1}
                    />
                  </mesh>
                </>
              ) : null}

              {ENABLE_PARK_HARDSCAPE_DETAILS ? (
                <>
                  <mesh position={[0, 0.003, 0]} renderOrder={2.58}>
                    <boxGeometry args={[park.w * 0.98, 0.01, 0.04]} />
                    <meshBasicMaterial
                      color={park.edgeColor}
                      transparent
                      opacity={0.015}
                      toneMapped={false}
                      depthTest
                      depthWrite={false}
                      blending={AdditiveBlending}
                    />
                  </mesh>
                  <mesh position={[0, -0.003, 0]} renderOrder={2.58}>
                    <boxGeometry args={[park.w * 0.98, 0.01, 0.04]} />
                    <meshBasicMaterial
                      color={park.edgeColor}
                      transparent
                      opacity={0.015}
                      toneMapped={false}
                      depthTest
                      depthWrite={false}
                      blending={AdditiveBlending}
                    />
                  </mesh>
                  <mesh position={[park.w * 0.5 - 0.02, 0, 0]} renderOrder={2.58}>
                    <boxGeometry args={[0.04, 0.01, park.d * 0.98]} />
                    <meshBasicMaterial
                      color={park.edgeColor}
                      transparent
                      opacity={0.015}
                      toneMapped={false}
                      depthTest
                      depthWrite={false}
                      blending={AdditiveBlending}
                    />
                  </mesh>
                  <mesh position={[-park.w * 0.5 + 0.02, 0, 0]} renderOrder={2.58}>
                    <boxGeometry args={[0.04, 0.01, park.d * 0.98]} />
                    <meshBasicMaterial
                      color={park.edgeColor}
                      transparent
                      opacity={0.015}
                      toneMapped={false}
                      depthTest
                      depthWrite={false}
                      blending={AdditiveBlending}
                    />
                  </mesh>

                  <mesh
                    ref={(el) => {
                      pathRefs.current[parkIndex * 2] = el;
                    }}
                    position={[0, 0.006, 0]}
                    renderOrder={2.6}
                  >
                    <boxGeometry args={[Math.max(0.12, park.w * 0.12), 0.012, lineLen]} />
                    <meshBasicMaterial
                      color="#fff2dc"
                      transparent
                      opacity={0.03}
                      toneMapped={false}
                      depthTest
                      depthWrite={false}
                      polygonOffset
                      polygonOffsetFactor={-1}
                      polygonOffsetUnits={-2}
                    />
                  </mesh>
                  <mesh
                    ref={(el) => {
                      pathRefs.current[parkIndex * 2 + 1] = el;
                    }}
                    position={[0, 0.0065, 0]}
                    rotation={[0, 0, Math.PI / 2]}
                    renderOrder={2.6}
                  >
                    <boxGeometry args={[Math.max(0.12, park.w * 0.08), 0.012, lineLen * 0.58]} />
                    <meshBasicMaterial
                      color="#f7931a"
                      transparent
                      opacity={0.025}
                      toneMapped={false}
                      depthTest
                      depthWrite={false}
                      polygonOffset
                      polygonOffsetFactor={-1}
                      polygonOffsetUnits={-2}
                    />
                  </mesh>
                </>
              ) : null}
            </group>
            {ENABLE_PARKS_V2 && ENABLE_PARK_FOOTPATH_LINK && footpathSeg && footpathSeg.length > 1.6 ? (
              <group
                position={[footpathSeg.midX, PARK_PATCH_Y + 0.0014, footpathSeg.midZ]}
                rotation={[0, footpathSeg.yaw, 0]}
                renderOrder={2.66}
              >
                <mesh renderOrder={2.66}>
                  <boxGeometry args={[0.028, 0.01, footpathSeg.length]} />
                  <meshBasicMaterial
                  color="#f0dfc6"
                  transparent
                    opacity={0.11}
                    toneMapped={false}
                    depthTest
                    depthWrite={false}
                    polygonOffset
                    polygonOffsetFactor={-2}
                    polygonOffsetUnits={-3}
                  />
                </mesh>
                <mesh position={[0, 0.0015, 0]} renderOrder={2.67}>
                  <boxGeometry args={[0.012, 0.009, footpathSeg.length * 0.96]} />
                  <meshBasicMaterial
                  color="#f7931a"
                  transparent
                    opacity={0.09}
                    toneMapped={false}
                    depthTest
                    depthWrite={false}
                    blending={AdditiveBlending}
                    polygonOffset
                    polygonOffsetFactor={-2}
                    polygonOffsetUnits={-4}
                  />
                </mesh>
              </group>
            ) : null}
          </group>
        );
      })}

      <instancedMesh ref={trunkRef} args={[undefined, undefined, Math.max(1, trees.length)]} renderOrder={2.72} frustumCulled={false}>
        <cylinderGeometry args={[0.08, 0.1, 1, 6]} />
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.96}
          toneMapped={false}
          depthTest
          depthWrite
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </instancedMesh>
      <instancedMesh ref={crownRef} args={[undefined, undefined, Math.max(1, trees.length)]} renderOrder={2.75} frustumCulled={false}>
        <coneGeometry args={[1, 1, 7]} />
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.96}
          toneMapped={false}
          depthTest
          depthWrite
          wireframe={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </instancedMesh>
      <instancedMesh ref={trunkWireRef} args={[undefined, undefined, Math.max(1, trees.length)]} renderOrder={2.755} frustumCulled={false}>
        <cylinderGeometry args={[0.08, 0.1, 1, 6]} />
        <meshBasicMaterial
          color="#fff3de"
          wireframe
          transparent
          opacity={0.72}
          toneMapped={false}
          depthTest
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </instancedMesh>
      <instancedMesh ref={crownWireRef} args={[undefined, undefined, Math.max(1, trees.length)]} renderOrder={2.758} frustumCulled={false}>
        <coneGeometry args={[1, 1, 7]} />
        <meshBasicMaterial
          color="#fff5e3"
          wireframe
          transparent
          opacity={0.78}
          toneMapped={false}
          depthTest
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </instancedMesh>
      <instancedMesh ref={crownGlowRef} args={[undefined, undefined, Math.max(1, trees.length)]} renderOrder={2.762} frustumCulled={false}>
        <coneGeometry args={[1, 1, 7]} />
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.16}
          toneMapped={false}
          depthTest
          depthWrite={false}
          blending={AdditiveBlending}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-3}
        />
      </instancedMesh>
      <instancedMesh ref={fireflyRef} args={[undefined, undefined, Math.max(1, trees.length)]} renderOrder={2.78} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.24}
          toneMapped={false}
          depthTest
          depthWrite={false}
          blending={AdditiveBlending}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-2}
        />
      </instancedMesh>
    </group>
  );
}

function TraceStrips({
  traces,
  focusMode = false,
  marketPulse = 0,
  arterial = false
}: {
  traces: TraceDatum[];
  focusMode?: boolean;
  marketPulse?: number;
  arterial?: boolean;
}) {
  const { camera } = useThree();
  const glowRefs = useRef<Array<Mesh | null>>([]);
  const coreRefs = useRef<Array<Mesh | null>>([]);
  const scanRefs = useRef<Array<Mesh | null>>([]);
  const focusMixRef = useRef(0);
  const pulseRef = useRef(marketPulse);

  useEffect(() => {
    glowRefs.current.length = traces.length;
    coreRefs.current.length = traces.length;
    scanRefs.current.length = traces.length;
  }, [traces.length]);

  useEffect(() => {
    pulseRef.current = marketPulse;
  }, [marketPulse]);

  useFrame(({ clock }, delta) => {
    const visCurve = distanceVisibilityCurve(camera.position.length());
    focusMixRef.current = MathUtils.damp(focusMixRef.current, focusMode ? 1 : 0, 7.5, delta);
    pulseRef.current = MathUtils.damp(pulseRef.current, marketPulse, MARKET_PULSE_DAMP, delta);
    const localPulse = ENABLE_MARKET_PULSE ? pulseRef.current : 0;
    const glowWidthScale = MathUtils.lerp(1, arterial ? 2.75 : 2.4, visCurve);
    const coreWidthScale = MathUtils.lerp(1, arterial ? 2.25 : 1.95, visCurve);
    const dimScale = MathUtils.lerp(1, FOCUS_TRACE_DIM, focusMixRef.current);
    const glowOpacityBase = arterial ? MathUtils.lerp(0.18, 0.29, visCurve) : MathUtils.lerp(0.13, 0.22, visCurve);
    const coreOpacityBase = arterial ? MathUtils.lerp(0.72, 0.9, visCurve) : MathUtils.lerp(0.62, 0.82, visCurve);
    const glowOpacity = MathUtils.clamp(
      glowOpacityBase * (1 + localPulse * MARKET_PULSE_TRACE_GLOW_GAIN) * dimScale,
      0,
      arterial ? 0.38 : 0.28
    );
    const coreOpacity = MathUtils.clamp(
      coreOpacityBase * (1 + localPulse * MARKET_PULSE_TRACE_CORE_GAIN) * dimScale,
      0,
      arterial ? 0.98 : 0.9
    );
    for (let i = 0; i < traces.length; i++) {
      const glow = glowRefs.current[i];
      const core = coreRefs.current[i];
      const scan = scanRefs.current[i];
      if (glow) {
        glow.scale.set(glowWidthScale, 1, 1);
        const mat = glow.material as { opacity?: number } | undefined;
        if (mat) mat.opacity = glowOpacity;
      }
      if (core) {
        core.scale.set(coreWidthScale, 1, 1);
        const mat = core.material as { opacity?: number } | undefined;
        if (mat) mat.opacity = coreOpacity;
      }
      if (scan && arterial) {
        const trace = traces[i];
        if (!trace) continue;
        const scanT = (clock.getElapsedTime() * 0.08 + (trace.scanSeed ?? 0)) % 1;
        const z = MathUtils.lerp(-trace.length * 0.42, trace.length * 0.42, scanT);
        scan.position.z = z;
        const mat = scan.material as { opacity?: number } | undefined;
        if (mat) {
          const envelope = 0.35 + 0.65 * Math.sin(scanT * Math.PI);
          mat.opacity = MathUtils.clamp(0.07 * envelope * dimScale, 0, 0.12);
        }
      }
    }
  });

  return (
    <group>
      {/* Render band 4/4.6: depth-tested traces above ground graphics, below traffic/towers */}
      {traces.map((trace, i) => (
        <group
          key={trace.id}
          position={[trace.midX, trace.y, trace.midZ]}
          rotation={[0, trace.yaw, 0]}
          renderOrder={arterial ? 4.55 : 4}
        >
          <mesh
            position={[0, -0.0016, 0]}
            renderOrder={arterial ? 4.55 : 4}
            ref={(el) => {
              glowRefs.current[i] = el;
            }}
          >
            <boxGeometry args={[trace.glowWidth * (arterial ? 1.14 : 1), arterial ? 0.014 : 0.012, trace.length]} />
            <meshBasicMaterial
              color={trace.glowColor}
              transparent
              opacity={0.11}
              toneMapped={false}
              depthWrite={false}
              depthTest
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
              blending={AdditiveBlending}
            />
          </mesh>
          <mesh
            position={[0, 0.0022, 0]}
            renderOrder={arterial ? 4.62 : 4.1}
            ref={(el) => {
              coreRefs.current[i] = el;
            }}
          >
            <boxGeometry args={[trace.width * (arterial ? 1.06 : 1), arterial ? 0.016 : 0.014, trace.length]} />
            <meshBasicMaterial
              color={trace.coreColor}
              transparent
              opacity={0.58}
              toneMapped={false}
              depthWrite={false}
              depthTest
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-2}
            />
          </mesh>
          {arterial ? (
            <mesh
              position={[0, 0.0047, 0]}
              renderOrder={4.64}
              ref={(el) => {
                scanRefs.current[i] = el;
              }}
            >
              <boxGeometry args={[trace.width * 1.65, 0.011, Math.max(0.45, trace.length * 0.14)]} />
              <meshBasicMaterial
                color="#fff4dc"
                transparent
                opacity={0.06}
                toneMapped={false}
                depthWrite={false}
                depthTest
                polygonOffset
                polygonOffsetFactor={-2}
                polygonOffsetUnits={-3}
                blending={AdditiveBlending}
              />
            </mesh>
          ) : null}
        </group>
      ))}
    </group>
  );
}

function TrafficParticles({
  particles,
  focusMode = false
}: {
  particles: TrafficParticleDatum[];
  focusMode?: boolean;
}) {
  const { camera } = useThree();
  const bodyRef = useRef<ThreeInstancedMesh>(null);
  const cabinRef = useRef<ThreeInstancedMesh>(null);
  const bodyWireRef = useRef<ThreeInstancedMesh>(null);
  const cabinWireRef = useRef<ThreeInstancedMesh>(null);
  const lightRef = useRef<ThreeInstancedMesh>(null);
  const glowRef = useRef<ThreeInstancedMesh>(null);
  const tempMatrixRef = useRef(new Matrix4());
  const tempPosRef = useRef(new Vector3());
  const tempPos2Ref = useRef(new Vector3());
  const tempPos3Ref = useRef(new Vector3());
  const tempPos4Ref = useRef(new Vector3());
  const tempOffsetRef = useRef(new Vector3());
  const tempScaleRef = useRef(new Vector3(1, 1, 1));
  const identityQuatRef = useRef(new Quaternion());
  const tempColorRef = useRef(new Color());
  const trafficUpRef = useRef(new Vector3(0, 1, 0));
  const trafficQuatRef = useRef(new Quaternion());
  const focusMixRef = useRef(0);
  useEffect(() => {
    const body = bodyRef.current;
    const cabin = cabinRef.current;
    const bodyWire = bodyWireRef.current;
    const cabinWire = cabinWireRef.current;
    const light = lightRef.current;
    const glow = glowRef.current;
    if (!body || !cabin || !bodyWire || !cabinWire || !light || !glow) return;
    const capacity = Math.max(1, body.instanceMatrix.count);
    const count = Math.min(particles.length, capacity);
    body.count = count;
    cabin.count = count;
    bodyWire.count = count;
    cabinWire.count = count;
    light.count = count;
    glow.count = count;
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      if (!p) continue;
      light.setColorAt(i, tempColorRef.current.set(DEBUG_FORCE_TRAFFIC_VIS ? '#ff3cf0' : '#ffffff'));
      glow.setColorAt(i, tempColorRef.current.set(DEBUG_FORCE_TRAFFIC_VIS ? '#ff3cf0' : p.color));
    }
    body.instanceMatrix.needsUpdate = true;
    cabin.instanceMatrix.needsUpdate = true;
    bodyWire.instanceMatrix.needsUpdate = true;
    cabinWire.instanceMatrix.needsUpdate = true;
    light.instanceMatrix.needsUpdate = true;
    glow.instanceMatrix.needsUpdate = true;
    if (light.instanceColor) light.instanceColor.needsUpdate = true;
    if (glow.instanceColor) glow.instanceColor.needsUpdate = true;
  }, [particles.length]);

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    const visCurve = distanceVisibilityCurve(camera.position.length());
    focusMixRef.current = MathUtils.damp(focusMixRef.current, focusMode ? 1 : 0, 7.5, delta);
    const sizeScale = MathUtils.lerp(1.15, 1.95, visCurve);
    const body = bodyRef.current;
    const cabin = cabinRef.current;
    const bodyWire = bodyWireRef.current;
    const cabinWire = cabinWireRef.current;
    const light = lightRef.current;
    const glow = glowRef.current;
    if (!body || !cabin || !bodyWire || !cabinWire || !light || !glow) return;
    const capacity = Math.max(1, body.instanceMatrix.count);
    const instanceCount = Math.min(particles.length, capacity);
    body.count = instanceCount;
    cabin.count = instanceCount;
    bodyWire.count = instanceCount;
    cabinWire.count = instanceCount;
    light.count = instanceCount;
    glow.count = instanceCount;
    const matrix = tempMatrixRef.current;
    const pos = tempPosRef.current;
    const pos2 = tempPos2Ref.current;
    const pos3 = tempPos3Ref.current;
    const pos4 = tempPos4Ref.current;
    const scl = tempScaleRef.current;
    const quat = trafficQuatRef.current;
    const up = trafficUpRef.current;
    const localOffset = tempOffsetRef.current;
    for (let i = 0; i < instanceCount; i++) {
      const p = particles[i];
      if (!p) continue;
      const dx = p.bx - p.ax;
      const dz = p.bz - p.az;
      const segLen = Math.hypot(dx, dz);
      const trim = Math.min(0.015, Math.max(0, segLen * 0.01));
      const invLen = segLen > 1e-6 ? 1 / segLen : 0;
      const dirX = dx * invLen;
      const dirZ = dz * invLen;
      if (segLen > 1e-6 && Number.isFinite(p.yaw)) {
        // Lock car heading to the same yaw convention as trace strips (rotation={[0, trace.yaw, 0]}).
        quat.setFromAxisAngle(up, p.yaw);
      } else {
        quat.copy(identityQuatRef.current);
      }
      const ax = p.ax + dirX * trim;
      const az = p.az + dirZ * trim;
      const bx = p.bx - dirX * trim;
      const bz = p.bz - dirZ * trim;
      const u = (p.phase + t * p.speed) % 1;
      const cx = MathUtils.lerp(ax, bx, u);
      const cz = MathUtils.lerp(az, bz, u);
      // Sit just above the orange trace core so cars appear attached to streets, not floating.
      const bodyH = Math.max(0.034, p.sizeY * 1.34) * MathUtils.lerp(1, 1.07, visCurve);
      const bodyLen = Math.max(0.26, p.sizeZ * 1.05) * MathUtils.lerp(1.0, 1.35, visCurve);
      const bodyW = Math.max(0.060, p.sizeX * 0.44) * MathUtils.lerp(1.0, 1.05, visCurve);
      const carBaseY = Math.max(TRACE_BASE_Y + 0.0118, p.y + 0.003);
      pos.set(cx, carBaseY + bodyH * 0.5, cz);
      // Car forward axis is +Z to match trace strips, so scale [width, height, length].
      scl.set(bodyW, bodyH, bodyLen);
      matrix.compose(pos, quat, scl);
      body.setMatrixAt(i, matrix);

      // Building-style warm-white wireframe shell (slight inflation) for readability / style consistency.
      scl.set(bodyW * 1.035, bodyH * 1.05, bodyLen * 1.035);
      matrix.compose(pos, quat, scl);
      bodyWire.setMatrixAt(i, matrix);

      // Low-poly cabin: narrower, taller, slightly rear-shifted to read as a car silhouette.
      const cabLen = bodyLen * 0.46;
      const cabH = bodyH * 0.78;
      const cabW = bodyW * 0.80;
      // Place cabin in car-local space so it stays attached/aligned to the body for every heading.
      localOffset.set(0, bodyH * 0.5 + cabH * 0.5 - bodyH * 0.16, -bodyLen * 0.12).applyQuaternion(quat);
      pos2.copy(pos).add(localOffset);
      scl.set(cabW, cabH, cabLen);
      matrix.compose(pos2, quat, scl);
      cabin.setMatrixAt(i, matrix);
      scl.set(cabW * 1.04, cabH * 1.05, cabLen * 1.04);
      matrix.compose(pos2, quat, scl);
      cabinWire.setMatrixAt(i, matrix);

      // Front light bar / nose accent makes direction of travel obvious.
      const barLen = Math.max(0.038, bodyLen * 0.18);
      const barH = Math.max(0.011, bodyH * 0.30);
      const barW = bodyW * 0.96;
      const frontOffset = bodyLen * 0.5 - barLen * 0.5 - 0.002;
      localOffset.set(0, -bodyH * 0.08, frontOffset).applyQuaternion(quat);
      pos3.copy(pos).add(localOffset);
      scl.set(barW, barH, barLen);
      matrix.compose(pos3, quat, scl);
      light.setMatrixAt(i, matrix);
      light.setColorAt(i, tempColorRef.current.set(DEBUG_FORCE_TRAFFIC_VIS ? '#ff3cf0' : '#fffdf0'));

      // Soft glow shell around the body for visibility (like the old bright cards), but subtle.
      pos4.copy(pos);
      const glowH = bodyH * MathUtils.lerp(2.1, 3.0, visCurve);
      const glowW = bodyW * MathUtils.lerp(2.2, 3.2, visCurve);
      const glowLen = bodyLen * MathUtils.lerp(2.0, 3.0, visCurve);
      scl.set(glowW, glowH, glowLen);
      matrix.compose(pos4, quat, scl);
      glow.setMatrixAt(i, matrix);
      glow.setColorAt(i, tempColorRef.current.set(DEBUG_FORCE_TRAFFIC_VIS ? '#ff3cf0' : '#fff2cf'));
    }
    body.instanceMatrix.needsUpdate = true;
    cabin.instanceMatrix.needsUpdate = true;
    bodyWire.instanceMatrix.needsUpdate = true;
    cabinWire.instanceMatrix.needsUpdate = true;
    light.instanceMatrix.needsUpdate = true;
    glow.instanceMatrix.needsUpdate = true;
    if (light.instanceColor) light.instanceColor.needsUpdate = true;
    if (glow.instanceColor) glow.instanceColor.needsUpdate = true;

    // Keep traffic readable at wide zoom: stronger glow shell + lights; bodies stay bright (meshBasic).
    const dimScale = MathUtils.lerp(1, FOCUS_TRAFFIC_DIM, focusMixRef.current);
    const bodyMat = body.material as { color?: Color } | undefined;
    if (bodyMat?.color && !DEBUG_FORCE_TRAFFIC_VIS) {
      bodyMat.color.copy(tempColorA.set('#f4fbff').lerp(tempColorB.set('#43505c'), focusMixRef.current));
    }
    const cabinMat = cabin.material as { color?: Color } | undefined;
    if (cabinMat?.color && !DEBUG_FORCE_TRAFFIC_VIS) {
      cabinMat.color.copy(tempColorA.set('#ffffff').lerp(tempColorB.set('#48525e'), focusMixRef.current * 0.95));
    }
    const bodyWireMat = bodyWire.material as { opacity?: number } | undefined;
    if (bodyWireMat) bodyWireMat.opacity = DEBUG_FORCE_TRAFFIC_VIS ? 0.98 : 0.98 * dimScale;
    const cabinWireMat = cabinWire.material as { opacity?: number } | undefined;
    if (cabinWireMat) cabinWireMat.opacity = DEBUG_FORCE_TRAFFIC_VIS ? 0.96 : 0.96 * dimScale;
    const glowMat = glow.material as { opacity?: number } | undefined;
    if (glowMat) glowMat.opacity = DEBUG_FORCE_TRAFFIC_VIS ? 1 : MathUtils.lerp(0.92, 1.0, visCurve) * dimScale;
    const lightMat = light.material as { opacity?: number } | undefined;
    if (lightMat) lightMat.opacity = DEBUG_FORCE_TRAFFIC_VIS ? 1 : MathUtils.lerp(0.95, 1, visCurve) * Math.max(0.35, dimScale);
  });

  return (
    <group>
      {/* Render band 5: traffic cues, still depth-tested so they do not draw through towers */}
      <instancedMesh ref={glowRef} args={[undefined, undefined, MAX_TRAFFIC_INSTANCES]} renderOrder={5.15} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.95}
          toneMapped={false}
          depthWrite={false}
          depthTest
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-4}
          blending={AdditiveBlending}
        />
      </instancedMesh>
      <instancedMesh ref={bodyRef} args={[undefined, undefined, MAX_TRAFFIC_INSTANCES]} renderOrder={5.2} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          color={DEBUG_FORCE_TRAFFIC_VIS ? '#ff3cf0' : '#f4fbff'}
          transparent={false}
          opacity={1}
          toneMapped={false}
          depthWrite
          depthTest
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </instancedMesh>
      <instancedMesh ref={bodyWireRef} args={[undefined, undefined, MAX_TRAFFIC_INSTANCES]} renderOrder={5.23} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          color={DEBUG_FORCE_TRAFFIC_VIS ? '#ffd9f5' : '#fff7e3'}
          wireframe
          transparent
          opacity={0.98}
          toneMapped={false}
          depthWrite={false}
          depthTest
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-3}
        />
      </instancedMesh>
      <instancedMesh ref={cabinRef} args={[undefined, undefined, MAX_TRAFFIC_INSTANCES]} renderOrder={5.25} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          color={DEBUG_FORCE_TRAFFIC_VIS ? '#ffd9f5' : '#ffffff'}
          transparent={false}
          toneMapped={false}
          depthWrite
          depthTest
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </instancedMesh>
      <instancedMesh ref={cabinWireRef} args={[undefined, undefined, MAX_TRAFFIC_INSTANCES]} renderOrder={5.27} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          color={DEBUG_FORCE_TRAFFIC_VIS ? '#ffd9f5' : '#fff7e3'}
          wireframe
          transparent
          opacity={0.96}
          toneMapped={false}
          depthWrite={false}
          depthTest
          polygonOffset
          polygonOffsetFactor={-3}
          polygonOffsetUnits={-3}
        />
      </instancedMesh>
      <instancedMesh ref={lightRef} args={[undefined, undefined, MAX_TRAFFIC_INSTANCES]} renderOrder={5.3} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={1}
          toneMapped={false}
          depthWrite={false}
          depthTest
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-3}
          blending={AdditiveBlending}
        />
      </instancedMesh>
    </group>
  );
}

function DistrictBoundaryLoop({
  district,
  focusMode = false
}: {
  district: DistrictDatum;
  focusMode?: boolean;
}) {
  const points = useMemo(
    () => buildCircleLinePoints(Math.max(4.8, district.radiusEstimate * 1.08), 72),
    [district.radiusEstimate]
  );
  return (
    <group position={[district.centerX, 0, district.centerZ]}>
      <ScreenSpaceGroundLine
        points={points}
        y={DISTRICT_LOOP_Y}
        color={district.tintColor}
        opacity={0.08}
        lineWidth={1.35}
        renderOrder={2.34}
        additive
        focusMode={focusMode}
        focusDim={FOCUS_GROUND_DIM}
      />
      <ScreenSpaceGroundLine
        points={points}
        y={DISTRICT_LOOP_Y + 0.00015}
        color="#f0e1ca"
        opacity={0.03}
        lineWidth={0.8}
        renderOrder={2.33}
        focusMode={focusMode}
        focusDim={FOCUS_GROUND_DIM}
      />
    </group>
  );
}

function DistrictBoundariesLayer({
  districts,
  focusMode = false
}: {
  districts: DistrictDatum[];
  focusMode?: boolean;
}) {
  const visible = useMemo(
    () => (ENABLE_DISTRICTS ? districts.slice(Math.max(0, districts.length - MAX_VISIBLE_DISTRICT_LOOPS)) : []),
    [districts]
  );
  if (visible.length === 0) return null;
  return (
    <group>
      {visible.map((district) => (
        <DistrictBoundaryLoop key={`district-${district.id}`} district={district} focusMode={focusMode} />
      ))}
    </group>
  );
}

function ShockwaveLayer({
  shockwaves,
  focusMode = false
}: {
  shockwaves: ShockwaveDatum[];
  focusMode?: boolean;
}) {
  const ringRefs = useRef<Array<Mesh | null>>([]);
  const focusMixRef = useRef(0);

  useEffect(() => {
    ringRefs.current.length = shockwaves.length;
  }, [shockwaves.length]);

  useFrame((_, delta) => {
    focusMixRef.current = MathUtils.damp(focusMixRef.current, focusMode ? 1 : 0, 8, delta);
    const dimScale = MathUtils.lerp(1, FOCUS_GROUND_DIM, focusMixRef.current);
    const now = performance.now();
    for (let i = 0; i < shockwaves.length; i++) {
      const ring = ringRefs.current[i];
      const sw = shockwaves[i];
      if (!ring || !sw?.active) {
        if (ring) ring.visible = false;
        continue;
      }
      const age = now - sw.startTimeMs;
      const t = sw.durationMs > 0 ? MathUtils.clamp(age / sw.durationMs, 0, 1) : 1;
      if (t >= 1) {
        ring.visible = false;
        sw.active = false;
        continue;
      }
      ring.visible = true;
      const eased = easeOutCubic(t);
      const radius = MathUtils.lerp(sw.startRadius, sw.maxRadius, eased);
      ring.scale.set(radius / Math.max(0.001, sw.startRadius), 1, radius / Math.max(0.001, sw.startRadius));
      const mat = ring.material as { opacity?: number; color?: Color } | undefined;
      if (mat) {
        const fade = 1 - smoothstep01(t);
        mat.opacity = MathUtils.clamp(sw.peakOpacity * fade * dimScale, 0, sw.peakOpacity);
      }
    }
  });

  if (!ENABLE_SHOCKWAVES || shockwaves.length === 0) return null;
  return (
    <group>
      {shockwaves.map((sw, i) => (
        <mesh
          key={`sw-${i}`}
          ref={(el) => {
            ringRefs.current[i] = el;
          }}
          visible={false}
          position={[sw.originX, SHOCKWAVE_Y, sw.originZ]}
          rotation={[Math.PI / 2, 0, 0]}
          renderOrder={3.45}
        >
          <torusGeometry args={[Math.max(0.2, sw.startRadius), Math.max(0.01, sw.thickness), 8, 64]} />
          <meshBasicMaterial
            color={sw.color}
            transparent
            opacity={0}
            toneMapped={false}
            depthTest
            depthWrite={false}
            blending={AdditiveBlending}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      ))}
    </group>
  );
}

function RecordCeremonyLayer({
  ceremonies,
  focusMode = false,
  sceneMaxY
}: {
  ceremonies: RecordCeremonyDatum[];
  focusMode?: boolean;
  sceneMaxY: number;
}) {
  const groupRefs = useRef<Array<Group | null>>([]);
  const baseRingRefs = useRef<Array<Mesh | null>>([]);
  const flareRefs = useRef<Array<Mesh | null>>([]);
  const beamRefs = useRef<Array<Mesh | null>>([]);
  const focusMixRef = useRef(0);

  useEffect(() => {
    groupRefs.current.length = ceremonies.length;
    baseRingRefs.current.length = ceremonies.length;
    flareRefs.current.length = ceremonies.length;
    beamRefs.current.length = ceremonies.length;
  }, [ceremonies.length]);

  useFrame((_, delta) => {
    focusMixRef.current = MathUtils.damp(focusMixRef.current, focusMode ? 1 : 0, 7.5, delta);
    const dimScale = MathUtils.lerp(1, FOCUS_NON_HOVER_DIM, focusMixRef.current * 0.35);
    const now = performance.now();
    for (let i = 0; i < ceremonies.length; i++) {
      const event = ceremonies[i];
      const g = groupRefs.current[i];
      const ring = baseRingRefs.current[i];
      const flare = flareRefs.current[i];
      const beam = beamRefs.current[i];
      if (!g || !event?.active) {
        if (g) g.visible = false;
        continue;
      }
      const age = now - event.startTimeMs;
      const t = event.durationMs > 0 ? MathUtils.clamp(age / event.durationMs, 0, 1) : 1;
      if (t >= 1) {
        g.visible = false;
        event.active = false;
        continue;
      }
      g.visible = true;
      const inT = smoothstep01(Math.min(1, t * 2.2));
      const outT = smoothstep01(Math.max(0, (t - 0.15) / 0.85));
      const fade = 1 - outT;
      if (ring) {
        ring.position.set(event.x, CEREMONY_RING_Y, event.z);
        const s = MathUtils.lerp(1, RUNTIME_QUALITY_CONFIG.reducedMotion ? 3.4 : 4.4, easeOutCubic(t));
        ring.scale.set(s, 1, s);
        const m = ring.material as { opacity?: number } | undefined;
        if (m) m.opacity = MathUtils.clamp(0.18 * fade * dimScale, 0, 0.18);
      }
      if (flare) {
        flare.position.set(event.x, event.towerHeight + 0.18, event.z);
        const s = MathUtils.lerp(0.9, 1.42, inT) * MathUtils.lerp(1, 0.92, outT);
        flare.scale.set(s, 1, s);
        const m = flare.material as { opacity?: number } | undefined;
        if (m) m.opacity = MathUtils.clamp(0.34 * fade * dimScale, 0, 0.34);
      }
      if (beam) {
        const beamLen = Math.min(18, Math.max(7, sceneMaxY * 0.2));
        beam.position.set(event.x, event.towerHeight + 0.55 + beamLen * 0.5, event.z);
        beam.scale.set(1, MathUtils.lerp(0.2, 1, inT), 1);
        const m = beam.material as { opacity?: number } | undefined;
        if (m) m.opacity = MathUtils.clamp(0.2 * fade * dimScale, 0, 0.2);
      }
    }
  });

  if (!ENABLE_RECORD_CEREMONY || ceremonies.length === 0) return null;
  return (
    <group renderOrder={6.82}>
      {ceremonies.map((event, i) => (
        <group
          key={`record-ceremony-${i}`}
          ref={(el) => {
            groupRefs.current[i] = el;
          }}
          visible={false}
        >
          <mesh
            ref={(el) => {
              baseRingRefs.current[i] = el;
            }}
            position={[event.x, CEREMONY_RING_Y, event.z]}
            rotation={[Math.PI / 2, 0, 0]}
            renderOrder={3.52}
          >
            <torusGeometry args={[0.85, 0.04, 8, 40]} />
            <meshBasicMaterial
              color="#f6b15a"
              transparent
              opacity={0}
              toneMapped={false}
              depthTest
              depthWrite={false}
              blending={AdditiveBlending}
              polygonOffset
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-3}
            />
          </mesh>
          <mesh
            ref={(el) => {
              flareRefs.current[i] = el;
            }}
            position={[event.x, event.towerHeight + 0.18, event.z]}
            renderOrder={6.84}
          >
            <boxGeometry args={[0.62, 0.08, 0.62]} />
            <meshBasicMaterial
              color="#ffe9c4"
              transparent
              opacity={0}
              toneMapped={false}
              depthTest
              depthWrite={false}
              blending={AdditiveBlending}
              polygonOffset
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-3}
            />
          </mesh>
          <mesh
            ref={(el) => {
              beamRefs.current[i] = el;
            }}
            position={[event.x, event.towerHeight + 3, event.z]}
            renderOrder={6.83}
          >
            <cylinderGeometry args={[0.08, 0.16, Math.min(18, Math.max(7, sceneMaxY * 0.2)), 12, 1, true]} />
            <meshBasicMaterial
              color="#f5cc95"
              transparent
              opacity={0}
              toneMapped={false}
              depthTest
              depthWrite={false}
              side={DoubleSide}
              blending={AdditiveBlending}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CinematicBackdrop() {
  const shader = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTop: { value: new Color('#030406') },
          uHorizon: { value: new Color('#0d0f13') }
        },
        vertexShader: SKY_GRADIENT_VERTEX,
        fragmentShader: SKY_GRADIENT_FRAGMENT,
        side: BackSide,
        depthWrite: false,
        depthTest: false
      }),
    []
  );
  shader.toneMapped = false;
  useEffect(() => () => shader.dispose(), [shader]);
  if (!ENABLE_CINEMATIC_BACKDROP) return null;
  return (
    <mesh renderOrder={-10}>
      <sphereGeometry args={[340, 24, 16]} />
      <primitive object={shader} attach="material" />
    </mesh>
  );
}

function FakeVignettePlane() {
  const { camera, size } = useThree();
  const meshRef = useRef<Mesh>(null);
  const material = useMemo(() => {
    const m = new ShaderMaterial({
      uniforms: { uOpacity: { value: 0.14 } },
      vertexShader: VIGNETTE_VERTEX,
      fragmentShader: VIGNETTE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: false
    });
    m.toneMapped = false;
    return m;
  }, []);
  const forward = useRef(new Vector3());

  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const m = meshRef.current;
    if (!m) return;
    const persp = camera as { fov?: number; near?: number; aspect?: number };
    const dist = 1.8;
    const fov = ((persp.fov ?? 50) * Math.PI) / 180;
    const aspect = persp.aspect ?? Math.max(1, size.width / Math.max(1, size.height));
    const h = 2 * Math.tan(fov * 0.5) * dist;
    const w = h * aspect;
    forward.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
    m.position.copy(camera.position).addScaledVector(forward.current, dist + (persp.near ?? 0.1) + 0.05);
    m.quaternion.copy(camera.quaternion);
    m.scale.set(w * 1.02, h * 1.02, 1);
  });

  if (!ENABLE_FAKE_VIGNETTE) return null;
  return (
    <mesh ref={meshRef} renderOrder={99}>
      <planeGeometry args={[1, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function SandboxScene({
  towers,
  traces,
  arterialTraces,
  trafficParticles,
  arterialTrafficParticles,
  parks,
  parkTrees,
  districts,
  shockwaves,
  recordCeremonies,
  bounds,
  marketMoodTarget,
  hoveredTowerSequence,
  selectedTowerSequence,
  tallestTowerSequence,
  onHoverTowerChange,
  onSelectTowerChange,
  onHoverHudUpdate,
  onCameraDebug
}: {
  towers: TowerDatum[];
  traces: TraceDatum[];
  arterialTraces: TraceDatum[];
  trafficParticles: TrafficParticleDatum[];
  arterialTrafficParticles: TrafficParticleDatum[];
  parks: ParkDatum[];
  parkTrees: ParkTreeDatum[];
  districts: DistrictDatum[];
  shockwaves: ShockwaveDatum[];
  recordCeremonies: RecordCeremonyDatum[];
  bounds: SandboxBounds;
  marketMoodTarget: number;
  hoveredTowerSequence: number | null;
  selectedTowerSequence: number | null;
  tallestTowerSequence: number | null;
  onHoverTowerChange?: (sequence: number | null) => void;
  onSelectTowerChange?: (sequence: number | null) => void;
  onHoverHudUpdate?: (snapshot: HoverHudSnapshot) => void;
  onCameraDebug?: (snapshot: CameraDebugSnapshot) => void;
}) {
  const hoveredTower = useMemo(
    () => (hoveredTowerSequence == null ? null : towers.find((tower) => tower.sequence === hoveredTowerSequence) ?? null),
    [hoveredTowerSequence, towers]
  );
  const tallestTower = useMemo(
    () => (tallestTowerSequence == null ? null : towers.find((tower) => tower.sequence === tallestTowerSequence) ?? null),
    [tallestTowerSequence, towers]
  );
  const selectedTower = useMemo(
    () => (selectedTowerSequence == null ? null : towers.find((tower) => tower.sequence === selectedTowerSequence) ?? null),
    [selectedTowerSequence, towers]
  );
  const focusTarget = useMemo<CameraFocusTarget | null>(
    () =>
      selectedTower
        ? {
            sequence: selectedTower.sequence,
            x: selectedTower.x,
            z: selectedTower.z,
            height: selectedTower.height
          }
        : null,
    [selectedTower]
  );
  const focusMode = hoveredTowerSequence != null;
  const hoverStableRef = useRef<number | null>(hoveredTowerSequence);
  const hoverIntentRef = useRef<number | null>(hoveredTowerSequence);
  const hoverCandidateRef = useRef<number | null>(null);
  const hoverCandidateFramesRef = useRef(0);
  const hoverLastSeenAtRef = useRef(0);

  useEffect(() => {
    hoverStableRef.current = hoveredTowerSequence;
    if (hoveredTowerSequence == null) {
      hoverIntentRef.current = null;
      hoverCandidateRef.current = null;
      hoverCandidateFramesRef.current = 0;
    }
  }, [hoveredTowerSequence]);

  const requestHoverTower = (sequence: number | null) => {
    if (sequence == null) {
      hoverIntentRef.current = null;
      return;
    }
    hoverIntentRef.current = sequence;
    hoverLastSeenAtRef.current = performance.now();
  };
  const requestSelectTower = (sequence: number) => {
    onSelectTowerChange?.(sequence);
  };

  useEffect(() => {
    let raf = 0;
    let mounted = true;

    const tick = () => {
      if (!mounted) return;

      const active = hoverStableRef.current;
      const intent = hoverIntentRef.current;
      let nextActive = active;
      const now = performance.now();

      if (intent != null) {
        hoverLastSeenAtRef.current = now;
        if (intent === active) {
          hoverCandidateRef.current = null;
          hoverCandidateFramesRef.current = 0;
        } else {
          if (hoverCandidateRef.current !== intent) {
            hoverCandidateRef.current = intent;
            hoverCandidateFramesRef.current = 1;
          } else {
            hoverCandidateFramesRef.current += 1;
          }
          if (hoverCandidateFramesRef.current >= HOVER_SWITCH_CONFIRM_FRAMES) {
            nextActive = intent;
            hoverCandidateRef.current = null;
            hoverCandidateFramesRef.current = 0;
          }
        }
      } else {
        hoverCandidateRef.current = null;
        hoverCandidateFramesRef.current = 0;
        if (active != null && now - hoverLastSeenAtRef.current > HOVER_CLEAR_GRACE_MS) {
          nextActive = null;
        }
      }

      if (nextActive !== active) {
        hoverStableRef.current = nextActive;
        onHoverTowerChange?.(nextActive);
      }

      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => {
      mounted = false;
      window.cancelAnimationFrame(raf);
    };
  }, [onHoverTowerChange]);

  return (
    <Canvas
      camera={{ position: [20, 12, 20], fov: 50, near: 0.15, far: 420 }}
      dpr={[1, RUNTIME_QUALITY_CONFIG.dprCap]}
      gl={{ antialias: RUNTIME_QUALITY_CONFIG.antialias, alpha: false, powerPreference: 'high-performance' }}
      onPointerMissed={() => {
        requestHoverTower(null);
      }}
      onCreated={({ scene, gl }) => {
        scene.background = new Color('#06080c');
        scene.fog = null;
        gl.outputColorSpace = SRGBColorSpace;
        gl.toneMapping = ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.02;
        gl.setClearColor('#06080c', 1);
      }}
    >
      <color attach="background" args={['#06080c']} />
      {ENABLE_CINEMATIC_BACKDROP ? <CinematicBackdrop /> : null}
      <ambientLight intensity={0.32} color="#9bb8d6" />
      <hemisphereLight args={['#9cc4ee', '#090b10', 0.34]} />
      <directionalLight position={[10, 18, 8]} intensity={0.72} color="#d6e8ff" castShadow={RUNTIME_QUALITY_CONFIG.shadows} />
      <directionalLight position={[-14, 20, -10]} intensity={0.34} color="#7fd3ff" />
      <MinimalOrbitRig
        bounds={bounds}
        focusTarget={focusTarget}
        onClearFocusTarget={() => onSelectTowerChange?.(null)}
        onCameraDebug={onCameraDebug}
      />

      <CircuitBoardGround bounds={bounds} focusMode={focusMode} marketPulse={marketMoodTarget} />
      <DistrictBoundariesLayer districts={districts} focusMode={focusMode} />
      <ShockwaveLayer shockwaves={shockwaves} focusMode={focusMode} />
      <ParksLayer parks={parks} trees={parkTrees} focusMode={focusMode} />
      <TraceStrips traces={traces} focusMode={focusMode} marketPulse={marketMoodTarget} />
      <TraceStrips traces={arterialTraces} focusMode={focusMode} marketPulse={marketMoodTarget} arterial />
      <TrafficParticles particles={trafficParticles} focusMode={focusMode} />
      <HoverProjectionTracker tower={hoveredTower} onHudUpdate={onHoverHudUpdate} />

      {/* Render band 6: tower bodies and holo layers remain the top visual anchors */}
      <group renderOrder={6}>
        {towers.map((tower) => (
          <AnimatedHoloTower
            key={tower.sequence}
            tower={tower}
            hoveredTowerSequence={hoveredTowerSequence}
            isTallest={tallestTowerSequence === tower.sequence}
            onHoverTower={requestHoverTower}
            onSelectTower={requestSelectTower}
          />
        ))}
      </group>

      {tallestTower ? (
        <TallestBeacon
          tower={tallestTower}
          sceneMaxY={bounds.maxY}
          focusMode={focusMode}
          isHovered={hoveredTowerSequence === tallestTower.sequence}
        />
      ) : null}
      <RecordCeremonyLayer ceremonies={recordCeremonies} focusMode={focusMode} sceneMaxY={bounds.maxY} />
      {ENABLE_FAKE_VIGNETTE ? <FakeVignettePlane /> : null}
    </Canvas>
  );
}

export function MinimalVizSandbox({
  mode = 'top200',
  onModeChange
}: {
  mode?: CityMode;
  onModeChange?: (nextMode: CityMode) => void;
}) {
  const { events, latest } = useBlockEventStore();
  const { latest: topSnapshot } = useTopCoinsStore();
  const btcData = useAppendOnlyTowers(events);
  const topData = useTopCoinsSkyline(topSnapshot);
  const active = mode === 'top200' ? topData : btcData;
  const {
    towers,
    traces,
    arterialTraces,
    trafficParticles,
    arterialTrafficParticles,
    parks,
    parkTrees,
    districts,
    shockwaves,
    recordCeremonies,
    bounds,
    marketMoodTarget,
    latestHeightDebug,
    tallestTowerSequence,
    tallestTowerHeight,
    parksAttempted,
    parksPlaced,
    lastParkSkipReason
  } = active;
  const [cameraDebug, setCameraDebug] = useState<CameraDebugSnapshot>({ camDist: 0, visCurve: 0 });
  const [hoveredTowerSequence, setHoveredTowerSequence] = useState<number | null>(null);
  const [selectedTowerSequence, setSelectedTowerSequence] = useState<number | null>(null);
  const [hoverHud, setHoverHud] = useState<HoverHudSnapshot>(HOVER_HUD_HIDDEN);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const topDebug = mode === 'top200' ? topData.topCoinsDebug : null;

  useEffect(() => {
    setHoveredTowerSequence(null);
    setSelectedTowerSequence(null);
    setHoverHud(HOVER_HUD_HIDDEN);
  }, [mode]);

  useEffect(() => {
    if (hoveredTowerSequence == null) return;
    if (!towers.some((tower) => tower.sequence === hoveredTowerSequence)) {
      setHoveredTowerSequence(null);
    }
  }, [hoveredTowerSequence, towers]);
  useEffect(() => {
    if (selectedTowerSequence == null) return;
    if (!towers.some((tower) => tower.sequence === selectedTowerSequence)) {
      setSelectedTowerSequence(null);
    }
  }, [selectedTowerSequence, towers]);

  useEffect(() => {
    if (hoveredTowerSequence == null && hoverHud.visible) {
      setHoverHud(HOVER_HUD_HIDDEN);
    }
  }, [hoveredTowerSequence, hoverHud.visible]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const hoveredTower = useMemo(
    () => (hoveredTowerSequence == null ? null : towers.find((tower) => tower.sequence === hoveredTowerSequence) ?? null),
    [hoveredTowerSequence, towers]
  );

  const overlay = useMemo(
    () => ({
      mode,
      feedMode: latest?.feedMode ?? 'auto',
      latestSequence: latest?.sequence ?? 0,
      towerCount: towers.length,
      traceCount: traces.length + arterialTraces.length,
      trafficCount: trafficParticles.length + arterialTrafficParticles.length,
      arterialCount: arterialTraces.length,
      districtCount: districts.length,
      parkCount: parks.length,
      parksAttempted,
      parksPlaced,
      lastParkSkipReason,
      cityRadius: bounds.radius,
      glowRadius: Math.max(30, bounds.radius * RADIAL_GLOW_RADIUS_MULT),
      camDist: cameraDebug.camDist,
      visCurve: cameraDebug.visCurve,
      mood: marketMoodTarget,
      hoveredTowerSequence,
      tallestTowerSequence,
      tallestTowerHeight,
      topDebug
    }),
    [
      latest,
      towers.length,
      traces.length,
      arterialTraces.length,
      trafficParticles.length,
      arterialTrafficParticles.length,
      parks.length,
      districts.length,
      parksAttempted,
      parksPlaced,
      lastParkSkipReason,
      bounds.radius,
      cameraDebug.camDist,
      cameraDebug.visCurve,
      marketMoodTarget,
      hoveredTowerSequence,
      tallestTowerSequence,
      tallestTowerHeight,
      mode,
      topDebug
    ]
  );

  return (
    <div className="minimal-viz">
      <SandboxScene
        towers={towers}
        traces={traces}
        arterialTraces={arterialTraces}
        trafficParticles={trafficParticles}
        arterialTrafficParticles={arterialTrafficParticles}
        parks={parks}
        parkTrees={parkTrees}
        districts={districts}
        shockwaves={shockwaves}
        recordCeremonies={recordCeremonies}
        bounds={bounds}
        marketMoodTarget={marketMoodTarget}
        hoveredTowerSequence={hoveredTowerSequence}
        selectedTowerSequence={selectedTowerSequence}
        tallestTowerSequence={tallestTowerSequence}
        onHoverTowerChange={setHoveredTowerSequence}
        onSelectTowerChange={setSelectedTowerSequence}
        onHoverHudUpdate={setHoverHud}
        onCameraDebug={setCameraDebug}
      />
      <HoverHudOverlay tower={hoveredTower} hud={hoverHud} />
      <div className="minimal-viz__overlay">
        <div className="minimal-viz__panel">
          <div className="minimal-viz__title">Sandbox</div>
          <div className="minimal-viz__row minimal-viz__row--control">
            <span>Mode</span>
            <select
              className="minimal-viz__select"
              value={overlay.mode}
              onChange={(event) => {
                const nextMode = event.currentTarget.value === 'btc' ? 'btc' : 'top200';
                onModeChange?.(nextMode);
              }}
            >
              <option value="top200">Top Coins Skyline (Binance Spot REST)</option>
              <option value="btc">Bitcoin Spot Buys (Binance WS)</option>
            </select>
          </div>
          <div className="minimal-viz__row">
            <span>Active</span>
            <span>{overlay.mode === 'top200' ? 'top200' : `btc (${overlay.feedMode})`}</span>
          </div>
          {overlay.mode === 'btc' ? (
            <div className="minimal-viz__row">
              <span>Latest Seq</span>
              <span>{overlay.latestSequence}</span>
            </div>
          ) : null}
          <div className="minimal-viz__row">
            <span>Towers</span>
            <span>{overlay.towerCount}</span>
          </div>
          <div className="minimal-viz__row">
            <span>Traces</span>
            <span>{overlay.traceCount}</span>
          </div>
          <div className="minimal-viz__row">
            <span>Traffic</span>
            <span>{overlay.trafficCount}</span>
          </div>
          <div className="minimal-viz__row">
            <span>Arteries</span>
            <span>{overlay.arterialCount}</span>
          </div>
          <div className="minimal-viz__row">
            <span>Districts</span>
            <span>{overlay.districtCount}</span>
          </div>
          <div className="minimal-viz__row">
            <span>Parks</span>
            <span>{overlay.parkCount}</span>
          </div>
          {overlay.mode === 'btc' ? (
            <>
              <div className="minimal-viz__row">
                <span>ParksAttempted</span>
                <span>{overlay.parksAttempted}</span>
              </div>
              <div className="minimal-viz__row">
                <span>ParksPlaced</span>
                <span>{overlay.parksPlaced}</span>
              </div>
              <div className="minimal-viz__row">
                <span>ParkSkip</span>
                <span>{overlay.lastParkSkipReason}</span>
              </div>
            </>
          ) : null}
          <div className="minimal-viz__row">
            <span>TrafficMode</span>
            <span>solid</span>
          </div>
          <div className="minimal-viz__row">
            <span>CityRadius</span>
            <span>{fmtFixed(overlay.cityRadius, 1)}</span>
          </div>
          <div className="minimal-viz__row">
            <span>GlowRadius</span>
            <span>{fmtFixed(overlay.glowRadius, 1)}</span>
          </div>
          <div className="minimal-viz__row">
            <span>CamDist</span>
            <span>{fmtFixed(overlay.camDist, 1)}</span>
          </div>
          <div className="minimal-viz__row">
            <span>VisCurve</span>
            <span>{fmtFixed(overlay.visCurve, 2)}</span>
          </div>
          {MARKET_PULSE_DEBUG_OVERLAY ? (
            <div className="minimal-viz__row">
              <span>Mood</span>
              <span>{fmtFixed(overlay.mood, 2)}</span>
            </div>
          ) : null}
          <div className="minimal-viz__row">
            <span>Hover</span>
            <span>{overlay.hoveredTowerSequence ?? 'none'}</span>
          </div>
          <div className="minimal-viz__row">
            <span>Tallest</span>
            <span>{overlay.tallestTowerSequence ?? 'none'}</span>
          </div>
          <div className="minimal-viz__row">
            <span>Tall H</span>
            <span>{fmtFixed(overlay.tallestTowerHeight, 1)}</span>
          </div>
          {overlay.topDebug ? (
            <>
              <div className="minimal-viz__row">
                <span>Symbols</span>
                <span>{overlay.topDebug.symbols}</span>
              </div>
              <div className="minimal-viz__row">
                <span>AsOf</span>
                <span>{overlay.topDebug.asOfIso || 'n/a'}</span>
              </div>
              <div className="minimal-viz__row">
                <span>LastFetchOk</span>
                <span>{overlay.topDebug.lastFetchOk ? 'yes' : 'no'}</span>
              </div>
              <div className="minimal-viz__row">
                <span>AsOfAge</span>
                <span>
                  {overlay.topDebug.asOfMs > 0
                    ? `${fmtFixed(Math.max(0, nowTick - overlay.topDebug.asOfMs) / 1000, 1)}s`
                    : 'n/a'}
                </span>
              </div>
              <div className="minimal-viz__row">
                <span>FetchAge</span>
                <span>{fmtFixed(Math.max(0, nowTick - overlay.topDebug.fetchedAt) / 1000, 1)}s</span>
              </div>
              <div className="minimal-viz__row">
                <span>LastHash</span>
                <span>{overlay.topDebug.lastHash}</span>
              </div>
              <div className="minimal-viz__row">
                <span>LogosMissing</span>
                <span>
                  {overlay.topDebug.logosMissing}/{overlay.topDebug.logosAttempted}
                </span>
              </div>
              <div className="minimal-viz__row">
                <span>LayoutIters</span>
                <span>{overlay.topDebug.layoutIters}</span>
              </div>
              <div className="minimal-viz__row">
                <span>MinSep</span>
                <span>{fmtFixed(overlay.topDebug.minSeparation, 2)}</span>
              </div>
              <div className="minimal-viz__row">
                <span>OverlapFix</span>
                <span>{overlay.topDebug.overlapFix}</span>
              </div>
              <div className="minimal-viz__row">
                <span>Top+</span>
                <span>
                  {overlay.topDebug.topGainer.symbol} {fmtSignedPct(overlay.topDebug.topGainer.pct)}
                </span>
              </div>
              <div className="minimal-viz__row">
                <span>Top-</span>
                <span>
                  {overlay.topDebug.topLoser.symbol} {fmtSignedPct(overlay.topDebug.topLoser.pct)}
                </span>
              </div>
              <div className="minimal-viz__row">
                <span>Top Vol</span>
                <span>
                  {overlay.topDebug.topVolume.symbol} {fmtUsdCompact(overlay.topDebug.topVolume.quoteVolume)}
                </span>
              </div>
              <div className="minimal-viz__row">
                <span>Error</span>
                <span>{fmtTopCoinsError(overlay.topDebug.lastError)}</span>
              </div>
            </>
          ) : null}
          {latestHeightDebug ? (
            <>
              <div className="minimal-viz__row">
                <span>USD</span>
                <span>{fmtUsdCompact(latestHeightDebug.usdNotional)}</span>
              </div>
              <div className="minimal-viz__row">
                <span>USD Src</span>
                <span>{latestHeightDebug.usdSource}</span>
              </div>
              <div className="minimal-viz__row">
                <span>logUSD</span>
                <span>{fmtFixed(latestHeightDebug.logUsd, 2)}</span>
              </div>
              <div className="minimal-viz__row">
                <span>AnchorU</span>
                <span>{fmtFixed(latestHeightDebug.anchorU, 2)}</span>
              </div>
              <div className="minimal-viz__row">
                <span>UsdZ</span>
                <span>{fmtFixed(latestHeightDebug.zUsd, 2)}</span>
              </div>
              <div className="minimal-viz__row">
                <span>UsdDist</span>
                <span>{fmtFixed(latestHeightDebug.scoreUsdDist, 2)}</span>
              </div>
              <div className="minimal-viz__row">
                <span>ScoreUSD</span>
                <span>{fmtFixed(latestHeightDebug.scoreUsd, 2)}</span>
              </div>
              <div className="minimal-viz__row">
                <span>Score</span>
                <span>{fmtFixed(latestHeightDebug.score, 2)}</span>
              </div>
              <div className="minimal-viz__row">
                <span>Height</span>
                <span>{fmtFixed(latestHeightDebug.height, 1)}</span>
              </div>
              <div className="minimal-viz__row">
                <span>Hero</span>
                <span>{latestHeightDebug.isHero ? latestHeightDebug.heroMode : 'no'}</span>
              </div>
              <div className="minimal-viz__row">
                <span>HeroMult</span>
                <span>{fmtFixed(latestHeightDebug.heroMult, 2)}</span>
              </div>
              <div className="minimal-viz__row">
                <span>BaseW</span>
                <span>{fmtFixed(latestHeightDebug.baseW, 2)}</span>
              </div>
              <div className="minimal-viz__row">
                <span>BaseD</span>
                <span>{fmtFixed(latestHeightDebug.baseD, 2)}</span>
              </div>
              <div className="minimal-viz__row">
                <span>EMA logU</span>
                <span>
                  {fmtFixed(latestHeightDebug.meanLogUsd, 2)}/{fmtFixed(latestHeightDebug.stdLogUsd, 2)}
                </span>
              </div>
              <div className="minimal-viz__row">
                <span>EMA I</span>
                <span>
                  {fmtFixed(latestHeightDebug.meanI, 2)}/{fmtFixed(latestHeightDebug.stdI, 2)}
                </span>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
