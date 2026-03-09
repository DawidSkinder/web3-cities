import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Group, InstancedMesh as ThreeInstancedMesh, Mesh, Texture } from 'three';
import {
  AdditiveBlending,
  ACESFilmicToneMapping,
  BackSide,
  BufferGeometry,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  ConeGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  FrontSide,
  Float32BufferAttribute,
  IcosahedronGeometry,
  LinearFilter,
  LineBasicMaterial,
  Matrix4,
  MathUtils,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SRGBColorSpace,
  TetrahedronGeometry,
  TextureLoader,
  TorusGeometry,
  Vector3
} from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { CryptoCityPreset } from '../data/cryptoCity/presets';
import { useTopCoinsStore } from '../data/topCoins/topCoinsStore';
import type { TopCoinsSnapshot } from '../data/topCoins/types';
import { useBlockEventStore } from '../data/trades/blockEventStore';
import type { BlockEvent } from '../data/trades/types';
import type { CryptoCityMode } from '../lib/cityMode';
import { isCryptoCityMode } from '../lib/cityMode';
import type { CityMode } from '../lib/cityMode';
import { deriveBtcCityMetrics } from '../ui/cityMetrics';
import { Web3CitiesUi } from '../ui/Web3CitiesUi';
import {
  buildCinematicFlyoverPlan,
  pickCinematicFlyoverTargets,
  sampleCinematicFlyoverPlan
} from './cinematicFlyover';
import type { CinematicFlyoverPlan, CinematicFlyoverTarget } from './cinematicFlyover';
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
  assetTicker?: string;
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
  discRevealAt?: number;
  discOcclusion?: number;
  isDiscPriority?: boolean;
  sparkUntilMs?: number;
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
  emittedAt?: number;
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
  emittedAt?: number;
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
  lastTowerBirthAt: number;
  parksAttempted: number;
  parksPlaced: number;
  lastParkSkipReason: string;
};

type CameraMode = 'auto' | 'user' | 'focus' | 'flyover';

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
const BTC_TOWER_BIRTH_PACE_MS = 3000;
const BTC_BUILDING_SPACING_MULT = 1.2;
const BTC_STRICT_ADJACENT_ROADS = true;
const BTC_ADJACENT_DIST_RATIO = 1.42;
const BTC_ADJACENT_DIST_PAD = 0.55;
const TRACE_BIRTH_FADE_MS = 260;
const TRAFFIC_BIRTH_FADE_MS = 220;
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
const TOP_REPLAY_HISTORY_MAX = 30;
const TOP_COINS_UNIVERSE_LIMIT = 150;
const TOP_COINS_DISC_GAINERS = 50;
const TOP_COINS_QUOTE_ASSET = 'USDT';
const TOP_COINS_CHANGE_TF_LABEL = '24h';
const TOP_INTRO_TIME_SCALE = RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.45 : 1;
const scaleTopIntroMs = (ms: number) => Math.max(90, Math.round(ms * TOP_INTRO_TIME_SCALE));
const TOP_INTRO_BOOT_MS = scaleTopIntroMs(2100);
const TOP_INTRO_WAVE_A_START_MS = TOP_INTRO_BOOT_MS;
const TOP_INTRO_WAVE_B_START_MS = scaleTopIntroMs(6400);
const TOP_INTRO_WAVE_C_START_MS = scaleTopIntroMs(11_100);
const TOP_INTRO_WAVE_A_STEP_MS = scaleTopIntroMs(120);
const TOP_INTRO_WAVE_B_STEP_MS = scaleTopIntroMs(76);
const TOP_INTRO_WAVE_C_STEP_MS = scaleTopIntroMs(46);
const TOP_INTRO_LAST_RANK_DELAY_MS =
  TOP_INTRO_WAVE_C_START_MS + Math.max(0, TOP_COINS_UNIVERSE_LIMIT - 81) * TOP_INTRO_WAVE_C_STEP_MS;
const TOP_INTRO_LIFE_START_MS = TOP_INTRO_LAST_RANK_DELAY_MS + BIRTH_RISE_MS + scaleTopIntroMs(220);
const TOP_INTRO_LIFE_RAMP_MS = scaleTopIntroMs(900);
const TOP_INTRO_TOTAL_MS = Math.max(
  scaleTopIntroMs(19_600),
  TOP_INTRO_LIFE_START_MS + TOP_INTRO_LIFE_RAMP_MS + scaleTopIntroMs(420)
);
const TOP_INTRO_CAMERA_BEAT_MS = scaleTopIntroMs(10_500);
const TOP_INTRO_DISC_STAGGER_STEP_MS = scaleTopIntroMs(3);
const TOP_INTRO_DISC_STAGGER_MAX_MS = scaleTopIntroMs(360);
const BTC_GROUND_BOOT_MS = 2400;
const BTC_GROUND_BOOT_START_SCALE = 0.34;
const TOP_UPDATE_THRESHOLD_PCT = 0.1;
const TOP_UPDATE_THRESHOLD_VOLUME = 0.05;
const TOP_REPLAY_SCRUB_MS = 1200;
const TOP_UPDATE_WAVE_MIN_DELAY_MS = 26;
const TOP_UPDATE_WAVE_MAX_DELAY_MS = 88;
const TOP_UPDATE_WAVE_LEAD_MS = 120;
const TOP_UPDATE_WAVE_TAIL_MS = 2200;

const ENABLE_SPECTACLE_LAYER = true;
const ENABLE_MARKET_PULSE = true;
const ENABLE_SHOCKWAVES = true;
const ENABLE_ARTERIALS = true;
const ENABLE_DISTRICTS = true;
const ENABLE_PARKS_V2 = true;
const ENABLE_RECORD_CEREMONY = true;
const ENABLE_CINEMATIC_BACKDROP = true;
const ENABLE_FAKE_VIGNETTE = false;
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
const BTC_MOUNTAIN_SEED = 58_031;
const BTC_MOUNTAIN_LAYER_FAR_COUNT = 24;
const BTC_MOUNTAIN_LAYER_MID_COUNT = 18;
const BTC_MOUNTAIN_LAYER_PEAK_COUNT = 12;
const BTC_MOUNTAIN_RING_MULT = 4.4;
const BTC_MOUNTAIN_RING_MIN = 320;
const BTC_MOUNTAIN_RING_MAX = 520;
const BTC_MOUNTAIN_METRIC_UPDATE_MS = 1000;
const BTC_MOUNTAIN_RENDER_ORDER = 1.3;
const BTC_MOUNTAIN_REVEAL_MID_DELAY_S = 0.34;
const BTC_MOUNTAIN_REVEAL_PEAK_DELAY_S = 0.66;
const BTC_MOUNTAIN_REVEAL_LAYER_DUR_S = 1.05;
const BTC_MOUNTAIN_REVEAL_FALLBACK_S = 0.95;
const BTC_MOUNTAIN_FAR_OPACITY = 0.78;
const BTC_MOUNTAIN_MID_OPACITY = 0.84;
const BTC_MOUNTAIN_PEAK_OPACITY = 0.9;
const BTC_BIRD_START_TOWER_COUNT = 6;
const BTC_BIRD_MIN_COUNT = 10;
const BTC_BIRD_MAX_COUNT = 220;
const BTC_BIRD_BASE_COUNT = 8;
const BTC_BIRD_GROWTH_PER_TOWER = 0.42;
const BTC_BIRD_GROWTH_BY_CITY_RADIUS = 0.14;
const BTC_BIRD_COUNT_ADJUST_PER_SEC = 18;
const BTC_BIRD_METRIC_UPDATE_MS = 1000;
const BTC_BIRD_MAX_INSTANCES = BTC_BIRD_MAX_COUNT;
const BTC_BIRD_RENDER_ORDER = 5.56;
const BTC_BIRD_CLEARANCE_Y = 1.35;
const BTC_BIRD_AVOID_PAD = 1.25;
const BTC_BIRD_AVOID_RADIUS_MAX = 9.5;
const BTC_BIRD_REPEL_STRENGTH = 2.15;
const BTC_BIRD_SIZE_MIN = 0.28;
const BTC_BIRD_SIZE_MAX = 0.5;
const BTC_BIRD_CITY_SIZE_GAIN = 0.0035;
const BTC_BIRD_MIN_SCREEN_PX = 1.9;
const BTC_BIRD_SIZE_DYNAMIC_MAX = 0.62;
const BTC_BIRD_ALTITUDE_LIFT_HEIGHT_GAIN = 0.16;
const BTC_BIRD_ALTITUDE_LIFT_PROX_GAIN = 0.5;
const BTC_BIRD_ALTITUDE_DAMP_BASE = 1.6;
const BTC_BIRD_ALTITUDE_DAMP_LIFT = 2.1;
const BTC_BIRD_MAX_ALTITUDE_STEP_BASE = 1.15;
const BTC_BIRD_MAX_ALTITUDE_STEP_LIFT = 1.85;
const BTC_BIRD_PITCH_SCALE_GAIN = 1.2;
const BTC_BIRD_OPACITY = 0.24;
const BTC_BIRD_DEBUG_ROW = true;

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
const TOP_DISC_BODY_GEOMETRY = new CircleGeometry(0.72, 40);
const TOP_DISC_FACE_GEOMETRY = new CircleGeometry(0.58, 40);
const TOP_DISC_RING_GEOMETRY = new TorusGeometry(0.68, 0.04, 10, 48);
const topCoinDiscScreenRegistry = new Map<
  number,
  { x: number; y: number; rank: number; updatedAt: number }
>();
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

const compactAssetAmount = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2
});

function fmtAssetAmount(v: number, ticker: string) {
  if (!Number.isFinite(v)) return `0 ${ticker}`;
  if (Math.abs(v) >= 10_000) {
    return `${compactAssetAmount.format(v)} ${ticker}`;
  }
  return `${fmtBtc(v)} ${ticker}`;
}

function withAlpha(rgb: string, alpha: number) {
  return `rgba(${rgb},${alpha})`;
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

function fmtMmSs(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(safe / 60)
    .toString()
    .padStart(2, '0');
  const ss = (safe % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

function fmtAgeFriendly(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(safe / 60);
  const ss = safe % 60;
  if (mm <= 0) return `${ss}s`;
  return `${mm}m ${ss}s`;
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
  if (error === 'snapshot-invalid-count') {
    return 'snapshot missing symbols';
  }
  return error;
}

function getTopCoinTicker(symbol: string | undefined, baseAsset?: string | undefined) {
  const base = (baseAsset ?? '').trim().toUpperCase();
  if (base) return base;
  const raw = (symbol ?? '').trim().toUpperCase();
  if (!raw) return 'N/A';
  const stripped = raw.replace(/(USDT|USDC|BUSD|FDUSD|TUSD|USD)$/i, '');
  return stripped || raw;
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

function percentileFromSorted(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  const safeP = MathUtils.clamp(p, 0, 1);
  const raw = safeP * (sorted.length - 1);
  const i0 = Math.floor(raw);
  const i1 = Math.min(sorted.length - 1, i0 + 1);
  const t = raw - i0;
  return MathUtils.lerp(sorted[i0] ?? 0, sorted[i1] ?? 0, t);
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

function orient2d(ax: number, az: number, bx: number, bz: number, cx: number, cz: number) {
  return (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
}

function onSegment2d(ax: number, az: number, bx: number, bz: number, px: number, pz: number, eps = 1e-6) {
  return (
    px >= Math.min(ax, bx) - eps &&
    px <= Math.max(ax, bx) + eps &&
    pz >= Math.min(az, bz) - eps &&
    pz <= Math.max(az, bz) + eps
  );
}

function segmentsIntersect2d(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number
) {
  const eps = 1e-6;
  const o1 = orient2d(ax, az, bx, bz, cx, cz);
  const o2 = orient2d(ax, az, bx, bz, dx, dz);
  const o3 = orient2d(cx, cz, dx, dz, ax, az);
  const o4 = orient2d(cx, cz, dx, dz, bx, bz);

  if (Math.abs(o1) <= eps && onSegment2d(ax, az, bx, bz, cx, cz, eps)) return true;
  if (Math.abs(o2) <= eps && onSegment2d(ax, az, bx, bz, dx, dz, eps)) return true;
  if (Math.abs(o3) <= eps && onSegment2d(cx, cz, dx, dz, ax, az, eps)) return true;
  if (Math.abs(o4) <= eps && onSegment2d(cx, cz, dx, dz, bx, bz, eps)) return true;

  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function traceCrossesExistingTrace(
  state: AccumState,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  aSeq: number,
  bSeq: number
) {
  for (let i = 0; i < state.traces.length; i++) {
    const t = state.traces[i];
    if (!t) continue;
    // Touching at a shared tower endpoint is expected/valid.
    if (t.aSequence === aSeq || t.aSequence === bSeq || t.bSequence === aSeq || t.bSequence === bSeq) continue;
    const half = t.length * 0.5;
    const dirX = Math.sin(t.yaw);
    const dirZ = Math.cos(t.yaw);
    const cx = t.midX - dirX * half;
    const cz = t.midZ - dirZ * half;
    const dx = t.midX + dirX * half;
    const dz = t.midZ + dirZ * half;
    if (segmentsIntersect2d(ax, az, bx, bz, cx, cz, dx, dz)) return true;
  }
  return false;
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

function createEmptyAccum(preset: CryptoCityPreset): AccumState {
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
    color: preset.theme.primary,
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
    lastTowerBirthAt: 0,
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

function ensureDistrictForNextTower(state: AccumState, tower: TowerDatum, preset: CryptoCityPreset) {
  if (!ENABLE_SPECTACLE_LAYER || !ENABLE_DISTRICTS) {
    tower.districtId = 0;
    tower.districtAccentColor = preset.theme.districtBase;
    return;
  }
  const nextIndex = state.towers.length;
  const districtId = Math.floor(nextIndex / DISTRICT_SIZE);
  while (state.districts.length <= districtId) {
    const id = state.districts.length;
    const seed = hash01(id, 9101);
    const tint = new Color(preset.theme.districtBase).lerp(new Color(preset.theme.districtAccent), seed * 0.28);
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

function appendArteriesForNewTower(state: AccumState, tower: TowerDatum, preset: CryptoCityPreset) {
  if (BTC_STRICT_ADJACENT_ROADS) return;
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
    const core = new Color(preset.theme.pale).lerp(new Color(preset.theme.warm), warm * 0.22);
    const glow = new Color(preset.theme.primary).lerp(new Color(preset.theme.pale), warm * 0.16);
    const y = ARTERY_TRACE_BASE_Y + i * ARTERY_TRACE_STEP_Y;
    const width = 0.14 + hash01(aSeq, bSeq, 9907) * 0.045;
    const glowWidth = width * 3.05;
    const traceId = `A-${key}`;
    const connectionEmittedAt = tower.emittedAt;
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
      emittedAt: connectionEmittedAt,
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
        emittedAt: connectionEmittedAt,
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

function parkConflictsTopCoinTower(x: number, z: number, w: number, d: number, tower: ParkTowerCollisionTarget) {
  const dx = Math.abs(x - tower.x);
  const dz = Math.abs(z - tower.z);
  const towerHalfX = Math.max(tower.baseW, tower.footprintX) * 0.6;
  const towerHalfZ = Math.max(tower.baseD, tower.footprintZ) * 0.6;
  const topClearance = 1.05;
  return dx < w * 0.5 + towerHalfX + topClearance && dz < d * 0.5 + towerHalfZ + topClearance;
}

function parkConflictsTopCoinPark(x: number, z: number, w: number, d: number, park: ParkDatum) {
  const dx = Math.abs(x - park.x);
  const dz = Math.abs(z - park.z);
  const topClearance = 0.9;
  return dx < w * 0.5 + park.w * 0.5 + topClearance && dz < d * 0.5 + park.d * 0.5 + topClearance;
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

function appendParkAtTowerSlot(state: AccumState, sourceTower: TowerDatum, seed: number, preset: CryptoCityPreset) {
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

  const patchColor = CORE_GRAPHITE.clone().lerp(CORE_GRAPHITE_HI, 0.52).lerp(new Color(preset.theme.primary), 0.03);
  const edgeColor = new Color(preset.theme.warm)
    .lerp(new Color(preset.theme.pale), 0.34)
    .lerp(new Color(preset.theme.primary), 0.18);

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

function appendPark(state: AccumState, seed: number, preset: CryptoCityPreset) {
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
    .lerp(new Color(preset.theme.primary), 0.04 + hash01(seed, 7207) * 0.05);
  const edgeColor = new Color(preset.theme.warm).lerp(
    new Color(preset.theme.primary),
    0.25 + hash01(seed, 7211) * 0.28
  );

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

function maybeAppendPark(state: AccumState, seed: number, preset: CryptoCityPreset) {
  const towerCount = state.towers.length;
  if (ENABLE_PARKS_V2 && state.parks.length === 0 && towerCount >= PARK_FORCE_FIRST_BY_TOWER_COUNT) {
    for (let i = 0; i < 4 && state.parks.length === 0; i++) {
      appendPark(state, seed + i * 97, preset);
    }
    if (state.parks.length > 0) {
      state.nextParkAtCount = towerCount + nextParkInterval(seed + towerCount);
      return;
    }
  }
  if (towerCount < state.nextParkAtCount) return;
  const placed = appendPark(state, seed, preset);
  if (!placed && state.lastParkSkipReason === 'too-early') {
    state.nextParkAtCount = Math.max(state.nextParkAtCount, 24);
    return;
  }
  state.nextParkAtCount = towerCount + nextParkInterval(seed + towerCount);
}

function appendTracesForNewTower(state: AccumState, tower: TowerDatum, preset: CryptoCityPreset) {
  if (state.towers.length <= 1) return;

  const existing = state.towers.slice(0, -1);
  const maxLinkDistance = BTC_STRICT_ADJACENT_ROADS
    ? RUNTIME_QUALITY_CONFIG.tier === 'low'
      ? 14
      : RUNTIME_QUALITY_CONFIG.tier === 'medium'
        ? 16
        : 18
    : RUNTIME_QUALITY_CONFIG.tier === 'low'
      ? 20
      : RUNTIME_QUALITY_CONFIG.tier === 'medium'
        ? 24
        : 28;
  const candidates = existing
    .map((other) => {
      const dist = Math.hypot(tower.x - other.x, tower.z - other.z);
      return { other, dist };
    })
    .filter((item) => item.dist > 0.001 && item.dist <= maxLinkDistance)
    .sort((a, b) => a.dist - b.dist);
  const desiredLinks = BTC_STRICT_ADJACENT_ROADS
    ? candidates.length
    : RUNTIME_QUALITY_CONFIG.tier === 'low'
      ? 2
      : RUNTIME_QUALITY_CONFIG.tier === 'medium'
        ? 3
        : 4;
  const adjacentMaxDist = BTC_STRICT_ADJACENT_ROADS
    ? candidates.length > 0
      ? Math.min(
          maxLinkDistance,
          Math.max(candidates[0]!.dist * BTC_ADJACENT_DIST_RATIO, candidates[0]!.dist + BTC_ADJACENT_DIST_PAD)
        )
      : 0
    : maxLinkDistance;

  const picked: TowerDatum[] = [];
  for (let i = 0; i < candidates.length && picked.length < desiredLinks; i++) {
    const candidate = candidates[i];
    if (!candidate) continue;
    if (BTC_STRICT_ADJACENT_ROADS && candidate.dist > adjacentMaxDist) continue;
    const neighbor = candidate.other;
    if (!neighbor) continue;
    const aSeq = Math.min(tower.sequence, neighbor.sequence);
    const bSeq = Math.max(tower.sequence, neighbor.sequence);
    const traceKey = `${aSeq}:${bSeq}`;
    if (state.traceKeySet.has(traceKey)) continue;

    const seg = segmentFromPoints(tower.x, tower.z, neighbor.x, neighbor.z);
    if (!Number.isFinite(seg.length) || seg.length < 0.8) continue;
    if (traceCrossesPark(state, tower.x, tower.z, neighbor.x, neighbor.z)) continue;
    if (traceCrossesExistingTrace(state, tower.x, tower.z, neighbor.x, neighbor.z, aSeq, bSeq)) continue;

    picked.push(neighbor);
  }

  for (let i = 0; i < picked.length; i++) {
    const neighbor = picked[i]!;
    const aSeq = Math.min(tower.sequence, neighbor.sequence);
    const bSeq = Math.max(tower.sequence, neighbor.sequence);
    const traceKey = `${aSeq}:${bSeq}`;
    const seg = segmentFromPoints(tower.x, tower.z, neighbor.x, neighbor.z);

    state.traceKeySet.add(traceKey);
    const warmBias = hash01(aSeq, bSeq, seg.length);
    const imbalanceBias = hash01(tower.sequence, neighbor.sequence, 7);
    const core = new Color(preset.theme.tracePrimary)
      .lerp(new Color(preset.theme.tracePale), 0.22 + warmBias * 0.22)
      .lerp(new Color(preset.theme.traceWarm), imbalanceBias > 0.82 ? 0.24 : 0);
    const glow = new Color(preset.theme.tracePrimary).lerp(
      new Color(preset.theme.traceWarm),
      warmBias > 0.88 ? 0.35 : 0.12
    );
    const width = 0.08 + hash01(aSeq, bSeq, 3) * 0.03;
    const glowWidth = width * 2.6;
    const y = TRACE_BASE_Y + i * TRACE_LAYER_STEP_Y;

    const traceId = `T-${traceKey}`;
    const visibleTraceLen = Math.max(0.9, seg.length - TOWER_FOOTPRINT * 0.7);
    const connectionEmittedAt = tower.emittedAt;
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
      glowColor: `#${glow.getHexString()}`,
      emittedAt: connectionEmittedAt
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
          ? new Color(preset.theme.tracePrimary)
          : orangeBias > 0.52
            ? new Color(preset.theme.traceWarm)
            : new Color(preset.theme.tracePale);

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
        sizeZ: 0.18 + hash01(aSeq, bSeq, p, 59) * 0.08,
        emittedAt: connectionEmittedAt
      });
    }
  }
}

function mapEventToTower(event: BlockEvent, state: AccumState, preset: CryptoCityPreset): TowerDatum {
  const idx = Math.max(0, Math.floor(event.sequence) - 1);
  const angle = idx * GOLDEN_ANGLE;
  const radius = Math.sqrt(idx) * SPIRAL_STEP * BTC_BUILDING_SPACING_MULT;
  let x = Math.cos(angle) * radius;
  let z = Math.sin(angle) * radius;

  const intensity = MathUtils.clamp(clampFinite(event.metrics.intensity, 0), 0, 1);
  // Preserve raw bucket volume for labels/panels. Thin, low-price assets like LUNC
  // can legitimately print above 10M units inside one block, and clipping that makes
  // unrelated blocks look identical in the UI.
  const totalVolume = Math.max(0, clampFinite(event.metrics.totalVolume, 0, 0, 1_000_000_000_000));
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
  const glow = new Color(preset.theme.warm)
    .lerp(new Color(preset.theme.pale), 0.38)
    .lerp(new Color(preset.theme.primary), dominance01);
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
        const minDist = (otherR + thisRBase + dynamicPad) * BTC_BUILDING_SPACING_MULT;
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
            (otherR + thisRBase + (0.46 + pairJumboT * (JUMBO_CLEARANCE_PAD_MAX + 0.12) + pairTallT * 0.5 + bothTallT * 0.48)) *
            BTC_BUILDING_SPACING_MULT;
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
    districtAccentColor: preset.theme.districtBase,
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
    emittedAt: Math.max(0, clampFinite(event.emittedAt, Date.now())),
    mode: preset.mode,
    assetTicker: preset.assetTicker
  };
}

function useAppendOnlyTowers(events: BlockEvent[], preset: CryptoCityPreset) {
  const accumRef = useRef<AccumState>(createEmptyAccum(preset));
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const state = accumRef.current;

    if (events.length === 0) {
      if (state.lastSequence > 0) {
        accumRef.current = createEmptyAccum(preset);
        setVersion((v) => v + 1);
      }
      return;
    }

    const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
    let appended = false;

    if (state.lastSequence > 0 && ordered[ordered.length - 1]?.sequence < state.lastSequence && ordered.length < 8) {
      accumRef.current = createEmptyAccum(preset);
    }

    const target = accumRef.current;
    for (const event of ordered) {
      if (target.processedSequences.has(event.sequence)) continue;
      if (!event.hasTrades) {
        target.processedSequences.add(event.sequence);
        target.lastSequence = Math.max(target.lastSequence, event.sequence);
        continue;
      }
      const tower = mapEventToTower(event, target, preset);
      const processedCount = target.processedSequences.size + 1;
      const parkEligible =
        ENABLE_PARKS_V2 &&
        target.parks.length < MAX_PARKS_VISIBLE &&
        processedCount >= Math.max(8, target.nextParkAtCount) &&
        !tower.isHero &&
        tower.height < target.tallestTowerHeight * 0.92;
      if (parkEligible) {
        const placedPark = appendParkAtTowerSlot(target, tower, tower.sequence, preset);
        target.processedSequences.add(event.sequence);
        target.lastSequence = Math.max(target.lastSequence, event.sequence);
        target.bounds.radius = Math.max(target.bounds.radius, Math.hypot(tower.x, tower.z) + 8);
        target.nextParkAtCount = processedCount + nextParkInterval(event.sequence);
        if (placedPark) {
          appended = true;
          continue;
        }
      }
      ensureDistrictForNextTower(target, tower, preset);
      const nowWallMs = Date.now();
      const pacedBirthAt =
        target.lastTowerBirthAt <= 0
          ? Math.max(nowWallMs, tower.emittedAt)
          : Math.max(target.lastTowerBirthAt + BTC_TOWER_BIRTH_PACE_MS, nowWallMs);
      target.lastTowerBirthAt = pacedBirthAt;
      tower.emittedAt = pacedBirthAt;
      target.towers.push(tower);
      appendTracesForNewTower(target, tower, preset);
      if (ENABLE_SHOCKWAVES) {
        const dir = MathUtils.clamp(clampFinite(event.metrics.imbalance, 0), -1, 1);
        pushShockwave(target, tower, dir >= 0 ? preset.theme.shockwavePositive : preset.theme.shockwaveNegative);
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
      appendArteriesForNewTower(target, tower, preset);
      appended = true;
    }

    if (appended) {
      setVersion((v) => v + 1);
    }
  }, [events, preset]);

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
  snapshotSeq: number;
  applyCount: number;
  changedTowers: number;
  changedCount: number;
  heightDeltaSum: number;
  baseDeltaSum: number;
  lastAppliedAt: number;
  asOfMs: number;
  asOfIso: string;
  asOfAgeSec: number;
  asOfAgeLabel: string;
  staleData: boolean;
  symbols: number;
  fetchedAt: number;
  lastFetchAt: number;
  lastSuccessAt: number;
  pollSec: number;
  nextUpdateAtMs: number;
  nextUpdateInSec: number;
  nextUpdateInLabel: string;
  lastHash: string;
  hashChanged: boolean;
  refreshAgeSec: number;
  lastError: string | null;
  lastFetchOk: boolean;
  logosMissing: number;
  logosAttempted: number;
  logosDownloaded: number;
  layoutIters: number;
  minSeparation: number;
  overlapFix: 'ok' | 'iterating';
  introActive: boolean;
  introBootAlpha: number;
  introLifeAlpha: number;
  introProgress: number;
  clutter: number;
  discVisible: number;
  discMode: string;
  replayEnabled: boolean;
  replayOffset: number;
  replayMax: number;
  replayAsOfIso: string;
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
  isDiscPriority: boolean;
  discRevealAt: number;
  discRevealDelayMs?: number;
  updateStartAt: number;
  discOcclusion: number;
  sparkUntilMs: number;
  introDelayMs?: number;
};

const TOP_COINS_DISTRICT_COUNT = 5;
const TOP_COINS_DISTRICT_TINTS = [
  '#f2dfbf',
  '#ebd1a7',
  '#d8c2a1',
  '#c9b29f',
  '#bda89f'
];
const TOP_LAYOUT_PADDING = 8;
const TOP_LAYOUT_INITIAL_ITERS = 64;
const TOP_LAYOUT_REFRESH_ITERS = 20;
const TOP_LAYOUT_INNER_RADIUS = 8;
const TOP_LAYOUT_RING_STEP = 5.05;
const TOP_LAYOUT_EDGE_PAD = 6.6;

type TopCoinsLayoutNode = {
  symbol: string;
  districtId: number;
  radius: number;
  x: number;
  z: number;
  homeX: number;
  homeZ: number;
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
  traces: TraceDatum[];
  arterialTraces: TraceDatum[];
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

function shortestAngleDelta(from: number, to: number) {
  const twoPi = Math.PI * 2;
  let diff = ((to - from + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  if (diff < -Math.PI) diff += twoPi;
  return diff;
}

function clampNodeToCity(node: TopCoinsLayoutNode, cityRadius: number) {
  const minRadius = Math.max(3.6, TOP_LAYOUT_INNER_RADIUS * 0.18);
  const maxRadius = Math.max(minRadius + 2, cityRadius - TOP_LAYOUT_EDGE_PAD);
  const radius = MathUtils.clamp(Math.hypot(node.x, node.z), minRadius, maxRadius);
  const angle = Math.atan2(node.z, node.x);
  node.x = Math.cos(angle) * radius;
  node.z = Math.sin(angle) * radius;
}

function estimateTopCoinFootprintRadius(
  symbol: string,
  sizeScore: number,
  pct: number,
  rank: number,
  isTopVolume: boolean,
  isTopGainer: boolean,
  isTopLoser: boolean
) {
  const sequence = (hashString32(symbol) % 1_000_000) + 1;
  const shape = buildTowerShapeParams(sequence, MathUtils.clamp(sizeScore, 0, 1));
  const baseScale = topCoinBaseScale({
    pct,
    rank,
    sizeScore,
    isTopGainer,
    isTopLoser,
    isTopVolume
  });
  const baseW = MathUtils.clamp(shape.baseW * baseScale, MIN_BASE * 0.95, MAX_BASE * 1.9);
  const baseD = MathUtils.clamp(shape.baseD * baseScale, MIN_BASE * 0.95, MAX_BASE * 1.9);
  return 0.5 * Math.hypot(baseW, baseD);
}

function buildTopCoinsLayoutTargets({
  items,
  states,
  sizeScoreBySymbol
}: {
  items: Array<{ symbol: string; rank: number; pct: number; isTopVolume: boolean; isTopGainer: boolean; isTopLoser: boolean }>;
  states: Map<string, TopCoinSymbolState>;
  sizeScoreBySymbol: Map<string, number>;
}): TopCoinsLayoutResult {
  const rankTier = (rank: number) => {
    if (rank <= 10) return 0;
    if (rank <= 50) return 1;
    if (rank <= 100) return 2;
    if (rank <= 150) return 3;
    return 4;
  };
  const ordered = [...items].sort((a, b) => a.rank - b.rank || a.symbol.localeCompare(b.symbol));
  const nodes: TopCoinsLayoutNode[] = [];
  const tierCounts = [0, 0, 0, 0, 0];
  const tierIndex = [0, 0, 0, 0, 0];
  for (const item of ordered) {
    tierCounts[rankTier(item.rank)] += 1;
  }

  const tierRadii = [10, 24, 38, 52, 66];
  for (let idx = 0; idx < ordered.length; idx++) {
    const item = ordered[idx];
    const districtId = rankTier(item.rank);
    const tierTotal = Math.max(1, tierCounts[districtId] ?? 1);
    const tierIdx = tierIndex[districtId] ?? 0;
    tierIndex[districtId] = tierIdx + 1;

    const spin = hashUnitString(item.symbol, 41);
    const baseAngle = ((tierIdx + 0.2 + spin * 0.6) / tierTotal) * Math.PI * 2;
    const angle = baseAngle + (hashUnitString(item.symbol, 43) - 0.5) * 0.18 + districtId * 0.11;
    const radialSpread = tierTotal <= 1 ? 0 : tierIdx / Math.max(1, tierTotal - 1);
    const radius = tierRadii[districtId] + (hashUnitString(item.symbol, 47) - 0.5) * 2.2 + radialSpread * 2.6;
    const xNominal = Math.cos(angle) * radius;
    const zNominal = Math.sin(angle) * radius;

    const sizeScore = sizeScoreBySymbol.get(item.symbol) ?? 0.4;
    const footprintRadius = estimateTopCoinFootprintRadius(
      item.symbol,
      sizeScore,
      item.pct,
      item.rank,
      item.isTopVolume,
      item.isTopGainer,
      item.isTopLoser
    );
    const prev = states.get(item.symbol);
    const anchorBlend = prev ? 0.78 : 1;
    const x0 = prev ? MathUtils.lerp(prev.xTarget ?? prev.x, xNominal, 0.36) : xNominal;
    const z0 = prev ? MathUtils.lerp(prev.zTarget ?? prev.z, zNominal, 0.36) : zNominal;
    nodes.push({
      symbol: item.symbol,
      districtId,
      radius: footprintRadius,
      x: x0,
      z: z0,
      homeX: MathUtils.lerp(x0, xNominal, anchorBlend),
      homeZ: MathUtils.lerp(z0, zNominal, anchorBlend)
    });
  }

  const maxNominalRadius = nodes.reduce((acc, node) => Math.max(acc, Math.hypot(node.homeX, node.homeZ) + node.radius), 0);
  let cityRadius = Math.max(86, maxNominalRadius + 80 + Math.sqrt(Math.max(1, nodes.length)) * 0.8);

  const dispX = new Array(nodes.length).fill(0);
  const dispZ = new Array(nodes.length).fill(0);
  const hasExisting = states.size > 0;
  const baseIterations = hasExisting ? TOP_LAYOUT_REFRESH_ITERS : TOP_LAYOUT_INITIAL_ITERS;
  let minSeparation = Number.POSITIVE_INFINITY;
  let overlapFix: 'ok' | 'iterating' = 'iterating';
  let layoutIters = 0;

  for (let attempt = 0; attempt < 6; attempt++) {
    for (const node of nodes) {
      clampNodeToCity(node, cityRadius);
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
        const homePull = hasExisting ? 0.08 : 0.05;
        node.x += dispX[i] * 0.82 + (node.homeX - node.x) * homePull;
        node.z += dispZ[i] * 0.82 + (node.homeZ - node.z) * homePull;
        clampNodeToCity(node, cityRadius);
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

    cityRadius *= 1.14;
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
  cityRadius,
  traces,
  arterialTraces
}: {
  towers: TopCoinsParkTower[];
  cityRadius: number;
  traces: TraceDatum[];
  arterialTraces: TraceDatum[];
}): TopCoinsParkResult {
  const parks: ParkDatum[] = [];
  const trees: ParkTreeDatum[] = [];
  const passthrough = {
    parks,
    trees,
    traces: [...traces],
    arterialTraces: [...arterialTraces]
  };
  if (!ENABLE_PARKS_V2 || towers.length < 20) {
    return passthrough;
  }

  const desiredParks = Math.min(MAX_PARKS_VISIBLE, Math.max(10, Math.round(towers.length / 16)));
  const attemptsMax = desiredParks * 180;
  const now = Date.now();
  const tracePool = [...traces, ...arterialTraces];
  const towerMaxRadius = towers.reduce((acc, tower) => {
    if (!tower) return acc;
    const footprint = Math.max(tower.baseW, tower.baseD, tower.footprintX, tower.footprintZ) * 0.5;
    return Math.max(acc, Math.hypot(tower.x, tower.z) + footprint);
  }, 12);
  const parkFootprintRadius = Math.min(cityRadius * 0.94, towerMaxRadius + 4.6);
  const parkCoreMinRadius = Math.max(8.5, Math.min(parkFootprintRadius * 0.45, towerMaxRadius * 0.58));
  const parkCoreMaxRadius = Math.max(parkCoreMinRadius + 3, parkFootprintRadius);
  const gridCellSize = 1.35;
  const gridMin = -parkFootprintRadius * 1.08;
  const gridMax = parkFootprintRadius * 1.08;
  const occupiedCells = new Set<string>();

  const toCell = (value: number) => Math.floor((value - gridMin) / gridCellSize);
  const cellKey = (ix: number, iz: number) => `${ix}:${iz}`;
  const reserveRect = (x: number, z: number, w: number, d: number, padding: number) => {
    const minX = x - (w * 0.5 + padding);
    const maxX = x + (w * 0.5 + padding);
    const minZ = z - (d * 0.5 + padding);
    const maxZ = z + (d * 0.5 + padding);
    const ix0 = toCell(minX);
    const ix1 = toCell(maxX);
    const iz0 = toCell(minZ);
    const iz1 = toCell(maxZ);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        occupiedCells.add(cellKey(ix, iz));
      }
    }
  };
  const rectIsFree = (x: number, z: number, w: number, d: number, padding: number) => {
    const edge = Math.max(w, d) * 0.5 + padding;
    if (Math.hypot(x, z) + edge > parkFootprintRadius) return false;
    const minX = x - (w * 0.5 + padding);
    const maxX = x + (w * 0.5 + padding);
    const minZ = z - (d * 0.5 + padding);
    const maxZ = z + (d * 0.5 + padding);
    if (minX < gridMin || maxX > gridMax || minZ < gridMin || maxZ > gridMax) return false;
    const ix0 = toCell(minX);
    const ix1 = toCell(maxX);
    const iz0 = toCell(minZ);
    const iz1 = toCell(maxZ);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        if (occupiedCells.has(cellKey(ix, iz))) return false;
      }
    }
    return true;
  };

  for (let i = 0; i < towers.length; i++) {
    const tower = towers[i];
    if (!tower) continue;
    const w = Math.max(tower.baseW, tower.footprintX);
    const d = Math.max(tower.baseD, tower.footprintZ);
    reserveRect(tower.x, tower.z, w, d, 1.0);
  }

  const traceTouchesCandidate = (x: number, z: number, parkRadius: number) => {
    for (let i = 0; i < tracePool.length; i++) {
      const trace = tracePool[i];
      if (!trace) continue;
      const dirX = Math.sin(trace.yaw);
      const dirZ = Math.cos(trace.yaw);
      const halfLen = Math.max(0.4, trace.length * 0.5);
      const ax = trace.midX - dirX * halfLen;
      const az = trace.midZ - dirZ * halfLen;
      const bx = trace.midX + dirX * halfLen;
      const bz = trace.midZ + dirZ * halfLen;
      const d = pointSegmentDistanceXZ(x, z, ax, az, bx, bz);
      if (d < parkRadius + 0.56) return true;
    }
    return false;
  };

  const treeTouchesTower = (x: number, z: number) => {
    const marker = 0.36;
    for (let i = 0; i < towers.length; i++) {
      if (parkConflictsTopCoinTower(x, z, marker, marker, towers[i])) {
        return true;
      }
    }
    return false;
  };

  for (let attempt = 0; attempt < attemptsMax && parks.length < desiredParks; attempt++) {
    const seed = 81_001 + attempt * 137;
    const angle = hash01(seed, 1) * Math.PI * 2;
    const edgeBias = hash01(seed, 2);
    const radialN =
      edgeBias > 0.78
        ? MathUtils.lerp(0.8, 0.98, hash01(seed, 3))
        : MathUtils.lerp(0.25, 0.78, hash01(seed, 3));
    const radialJitter = (hash01(seed, 5) - 0.5) * MathUtils.lerp(9, 22, radialN);
    const radial = MathUtils.clamp(
      MathUtils.lerp(parkCoreMinRadius, parkCoreMaxRadius, radialN) + radialJitter * 0.35,
      parkCoreMinRadius,
      parkCoreMaxRadius
    );
    const x = Math.cos(angle) * radial;
    const z = Math.sin(angle) * radial;
    const w = MathUtils.lerp(3.2, 5.8, hash01(seed, 7));
    const d = MathUtils.lerp(3.0, 5.4, hash01(seed, 9));
    const yaw = hash01(seed, 11) * Math.PI;
    const radius = Math.max(w, d) * 0.58;

    if (!rectIsFree(x, z, w, d, 0.52)) continue;

    let blocked = false;
    for (let i = 0; i < towers.length; i++) {
      if (parkConflictsTopCoinTower(x, z, w, d, towers[i])) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    if (traceTouchesCandidate(x, z, radius)) continue;
    for (let i = 0; i < parks.length; i++) {
      if (parkConflictsTopCoinPark(x, z, w, d, parks[i])) {
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
      if (Math.hypot(worldX, worldZ) > parkFootprintRadius * 0.99) continue;
      if (treeTouchesTower(worldX, worldZ)) continue;

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
    reserveRect(x, z, w, d, 0.56);

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

  if (parks.length < desiredParks) {
    for (let i = parks.length; i < desiredParks; i++) {
      const seed = 93_001 + i * 131;
      const angle = ((i + 1) / (desiredParks + 1)) * Math.PI * 2 + (hash01(seed, 1) - 0.5) * 0.18;
      const radius = MathUtils.lerp(parkCoreMinRadius, parkCoreMaxRadius, MathUtils.lerp(0.25, 0.96, hash01(seed, 3)));
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const w = MathUtils.lerp(2.9, 4.2, hash01(seed, 5));
      const d = MathUtils.lerp(2.8, 4.0, hash01(seed, 7));
      const yaw = hash01(seed, 9) * Math.PI;
      const r = Math.max(w, d) * 0.58;
      if (!rectIsFree(x, z, w, d, 0.48)) continue;
      let blocked = false;
      for (let t = 0; t < towers.length; t++) {
        if (parkConflictsTopCoinTower(x, z, w, d, towers[t])) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      if (traceTouchesCandidate(x, z, r)) continue;
      for (let p = 0; p < parks.length; p++) {
        if (parkConflictsTopCoinPark(x, z, w, d, parks[p])) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      const treeStart = trees.length;
      const requestedTreeCount = Math.max(8, Math.round(MathUtils.lerp(10, 18, hash01(seed, 11))));
      for (let ti = 0; ti < requestedTreeCount; ti++) {
        const a = hash01(seed, ti, 13) * Math.PI * 2;
        const rr = Math.sqrt(hash01(seed, ti, 17)) * (r * 0.82);
        const lx = Math.cos(a) * rr;
        const lz = Math.sin(a) * rr;
        const cs = Math.cos(yaw);
        const sn = Math.sin(yaw);
        const worldX = x + lx * cs - lz * sn;
        const worldZ = z + lx * sn + lz * cs;
        if (Math.hypot(worldX, worldZ) > parkFootprintRadius * 0.99) continue;
        if (treeTouchesTower(worldX, worldZ)) continue;
        trees.push({
          x: worldX,
          z: worldZ,
          yaw: hash01(seed, ti, 19) * Math.PI * 2,
          trunkH: MathUtils.lerp(0.2, 0.44, hash01(seed, ti, 23)),
          crownH: MathUtils.lerp(0.36, 0.82, hash01(seed, ti, 29)),
          crownR: MathUtils.lerp(0.14, 0.34, hash01(seed, ti, 31)),
          tintMix: hash01(seed, ti, 37)
        });
      }
      const treeCount = trees.length - treeStart;
      if (treeCount <= 0) continue;
      reserveRect(x, z, w, d, 0.54);
      const fireflyCount = Math.max(4, Math.min(treeCount, Math.round(treeCount * 0.7)));
      parks.push({
        id: `top-park-fallback-${i}-${seed}`,
        x,
        z,
        w,
        d,
        yaw,
        patchColor: '#2a2c30',
        edgeColor: '#f1cc97',
        seed,
        radius: r,
        fireflyCount,
        linkX: null,
        linkZ: null,
        emittedAt: now,
        treeStart,
        treeCount
      });
    }
  }

  const traceCrossesAnyPark = (trace: TraceDatum) => {
    const dirX = Math.sin(trace.yaw);
    const dirZ = Math.cos(trace.yaw);
    const halfLen = Math.max(0.4, trace.length * 0.5);
    const ax = trace.midX - dirX * halfLen;
    const az = trace.midZ - dirZ * halfLen;
    const bx = trace.midX + dirX * halfLen;
    const bz = trace.midZ + dirZ * halfLen;
    for (let i = 0; i < parks.length; i++) {
      const park = parks[i];
      if (!park) continue;
      const d = pointSegmentDistanceXZ(park.x, park.z, ax, az, bx, bz);
      if (d < park.radius + 0.28) return true;
    }
    return false;
  };

  const parkSafeTraces = traces.filter((trace) => !traceCrossesAnyPark(trace));
  const parkSafeArterials = arterialTraces.filter((trace) => !traceCrossesAnyPark(trace));
  return { parks, trees, traces: parkSafeTraces, arterialTraces: parkSafeArterials };
}

function easeTowards(current: number, target: number, lambda: number, dtSec: number) {
  const t = 1 - Math.exp(-Math.max(0.001, lambda) * Math.max(0.0001, dtSec));
  return current + (target - current) * t;
}

function resolveClockNowForEmittedAt(emittedAt: number, perfNowMs: number, wallNowMs: number) {
  // BTC mode still uses wall-clock timestamps, while Top Coins intro uses animation-clock timestamps.
  return Number.isFinite(emittedAt) && emittedAt > 1_000_000_000_000 ? wallNowMs : perfNowMs;
}

function mapTopCoinTowerMetrics({
  pct,
  quoteVolume,
  maxQuoteVolume,
  rank,
  isTopGainer,
  isTopLoser,
  isTopVolume
}: {
  pct: number;
  quoteVolume: number;
  maxQuoteVolume: number;
  rank: number;
  isTopGainer: boolean;
  isTopLoser: boolean;
  isTopVolume: boolean;
}) {
  const volumeNorm = MathUtils.clamp(Math.log10(quoteVolume + 1) / Math.log10(maxQuoteVolume + 1), 0, 1);
  const gainPct = Math.max(0, pct);
  const lossPct = Math.max(0, -pct);

  // Sea-level encoding: winners rise above baseline, losers sink toward it (never below ground).
  const minCityTower = 2.9;
  const seaLevelTower = 5.6;
  let height = minCityTower;
  let sizeScore = 0.04;

  if (gainPct > 0) {
    const gainCurve = Math.pow(Math.tanh(gainPct / 26), 1.12);
    height = seaLevelTower + gainCurve * 74;
    sizeScore = 0.14 + gainCurve * 0.7 + volumeNorm * 0.15;
    if (rank <= 3) sizeScore += 0.05;
  } else {
    const sink = Math.pow(Math.tanh(lossPct / 18), 0.92);
    height = seaLevelTower - sink * 2.1 + volumeNorm * 0.55;
    sizeScore = 0.08 + (1 - sink) * 0.12 + volumeNorm * 0.08;
  }

  if (isTopGainer) {
    height *= 1.12;
    sizeScore += 0.08;
  }
  if (isTopLoser) {
    height = Math.min(height, seaLevelTower - 0.5);
    sizeScore = Math.min(sizeScore, 0.24);
  }
  if (isTopVolume) {
    if (gainPct > 0) {
      height *= 1.04;
      sizeScore = Math.max(sizeScore, 0.58);
    } else {
      sizeScore = Math.min(0.22, sizeScore + 0.05);
    }
  }

  sizeScore = MathUtils.clamp(sizeScore, 0.03, 1);
  const heightScore = MathUtils.clamp((height - minCityTower) / Math.max(1, HERO_MAX_HEIGHT - minCityTower), 0, 1);

  return {
    height: MathUtils.clamp(height, TOWER_VISUAL_MIN_HEIGHT, HERO_MAX_HEIGHT),
    sizeScore,
    heightScore,
    volumeNorm
  };
}

function topCoinBaseScale({
  pct,
  rank,
  sizeScore,
  isTopGainer,
  isTopLoser,
  isTopVolume
}: {
  pct: number;
  rank: number;
  sizeScore: number;
  isTopGainer: boolean;
  isTopLoser: boolean;
  isTopVolume: boolean;
}) {
  const gain = Math.max(0, pct);
  const gainBoost = smoothstep01(remapClamped(gain, 8, 42));
  const sizeBoost = smoothstep01(remapClamped(sizeScore, 0.62, 1));
  const rankBoost = smoothstep01(remapClamped(30 - rank, 0, 28));

  let scale = MathUtils.lerp(0.92, 1.9, gainBoost);
  scale *= MathUtils.lerp(1, 1.28, sizeBoost);
  scale *= MathUtils.lerp(1, 1.13, rankBoost);
  // Keep small towers as-is; only medium/large towers get an extra base-width lift.
  const mediumLargeWidthBoost = smoothstep01(remapClamped(sizeScore, 0.34, 0.92));
  scale *= MathUtils.lerp(1, 1.34, mediumLargeWidthBoost);

  if (isTopGainer) scale *= 1.15;
  if (isTopVolume) scale *= 1.1;
  if (rank <= 3) scale *= 1.1;
  if (isTopLoser || pct < 0) {
    scale = Math.min(scale, 1.02);
  }
  return MathUtils.clamp(scale, 0.85, 2.65);
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
  const clutterRef = useRef(0.1);
  const updateWaveUntilRef = useRef(0);
  const updateWaveLoadRef = useRef(0);
  const historyRef = useRef<TopCoinsSnapshot[]>([]);
  const liveSnapshotRef = useRef<TopCoinsSnapshot | null>(null);
  const lastAppliedKeyRef = useRef('');
  const lastTopGainerSymbolRef = useRef('N/A');
  const introRef = useRef({
    hasRun: false,
    active: false,
    startPending: false,
    startedAtMs: 0,
    elapsedMs: 0,
    progress: 0,
    bootAlpha: 0,
    lifeAlpha: 0,
    storyBeatUntilMs: 0
  });
  const debugRef = useRef<TopCoinsDebugOverlay>({
    snapshotSeq: 0,
    applyCount: 0,
    changedTowers: 0,
    changedCount: 0,
    heightDeltaSum: 0,
    baseDeltaSum: 0,
    lastAppliedAt: 0,
    asOfMs: 0,
    asOfIso: '',
    asOfAgeSec: 0,
    asOfAgeLabel: '0s',
    staleData: false,
    symbols: 0,
    fetchedAt: 0,
    lastFetchAt: 0,
    lastSuccessAt: 0,
    pollSec: 60,
    nextUpdateAtMs: 0,
    nextUpdateInSec: 0,
    nextUpdateInLabel: '00:00',
    lastHash: 'none',
    hashChanged: false,
    refreshAgeSec: 0,
    lastError: null,
    lastFetchOk: false,
    logosMissing: 0,
    logosAttempted: 0,
    logosDownloaded: 0,
    layoutIters: 0,
    minSeparation: 0,
    overlapFix: 'ok',
    introActive: false,
    introBootAlpha: 0,
    introLifeAlpha: 0,
    introProgress: 0,
    clutter: 0.1,
    discVisible: 0,
    discMode: 'live',
    replayEnabled: false,
    replayOffset: 0,
    replayMax: 0,
    replayAsOfIso: '',
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
      durationMs: 1200
    }))
  );
  const recordCeremonyCursorRef = useRef(0);
  const recordCeremonySerialRef = useRef(0);
  const [version, setVersion] = useState(0);
  const [replayEnabled, setReplayEnabled] = useState(false);
  const [replayIndex, setReplayIndex] = useState(-1);
  const [historyVersion, setHistoryVersion] = useState(0);

  const pushShockwave = (
    x: number,
    z: number,
    color: string,
    durationMs: number,
    maxRadius: number,
    peakOpacity: number
  ) => {
    const slot = shockwavesRef.current[shockwaveCursorRef.current % shockwavesRef.current.length];
    shockwaveCursorRef.current += 1;
    shockwaveSerialRef.current += 1;
    slot.serial = shockwaveSerialRef.current;
    slot.active = true;
    slot.originX = x;
    slot.originZ = z;
    slot.startTimeMs = performance.now();
    slot.durationMs = durationMs;
    slot.startRadius = 0.42;
    slot.maxRadius = maxRadius;
    slot.thickness = 0.055;
    slot.color = color;
    slot.peakOpacity = peakOpacity;
  };

  useEffect(() => {
    if (!snapshot) return;
    liveSnapshotRef.current = snapshot;

    if (snapshot.hashChanged) {
      const history = historyRef.current;
      const last = history[history.length - 1];
      if (!last || last.hash !== snapshot.hash) {
        history.push(snapshot);
        while (history.length > TOP_REPLAY_HISTORY_MAX) {
          history.shift();
        }
        if (!replayEnabled) {
          setReplayIndex(history.length - 1);
        }
        setHistoryVersion((v) => v + 1);
      }
    }
  }, [replayEnabled, snapshot]);

  const replayMax = Math.max(0, historyRef.current.length - 1);
  const replayOffset = replayEnabled && replayMax >= 0 ? Math.max(0, replayMax - Math.max(0, replayIndex)) : 0;

  const activeSnapshot = useMemo(() => {
    if (!replayEnabled) return snapshot;
    const history = historyRef.current;
    if (history.length === 0) return null;
    const clamped = MathUtils.clamp(replayIndex < 0 ? history.length - 1 : replayIndex, 0, history.length - 1);
    return history[clamped] ?? history[history.length - 1] ?? null;
  }, [historyVersion, replayEnabled, replayIndex, snapshot]);

  useEffect(() => {
    if (!replayEnabled) return;
    const history = historyRef.current;
    if (history.length === 0) {
      setReplayIndex(-1);
      return;
    }
    if (replayIndex < 0 || replayIndex >= history.length) {
      setReplayIndex(history.length - 1);
    }
  }, [historyVersion, replayEnabled, replayIndex]);

  useEffect(() => {
    const states = statesRef.current;
    const live = liveSnapshotRef.current ?? snapshot;
    const selected = activeSnapshot ?? live;

    if (!selected) {
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
      introRef.current.hasRun = false;
      introRef.current.active = false;
      introRef.current.startPending = false;
      introRef.current.progress = 0;
      introRef.current.bootAlpha = 0;
      introRef.current.lifeAlpha = 0;
      introRef.current.elapsedMs = 0;
      introRef.current.storyBeatUntilMs = 0;
      return;
    }

    const metadataOnly = !replayEnabled && states.size > 0 && !selected.hashChanged;
    const applyKey = replayEnabled ? `replay:${replayIndex}:${selected.hash}` : `live:${selected.hash}:${selected.hashChanged ? 1 : 0}`;
    if (!metadataOnly && lastAppliedKeyRef.current === applyKey) {
      return;
    }
    if (!metadataOnly) {
      lastAppliedKeyRef.current = applyKey;
    }

    const nextSymbols = new Set<string>();
    const topGainerSymbol = selected.stats.topGainer.symbol;
    const topLoserSymbol = selected.stats.topLoser.symbol;
    const topVolumeSymbol = selected.stats.topVolume.symbol;
    const maxQuoteVolume = Math.max(selected.stats.sessionMaxQuoteVolume, 1);
    const wallNowMs = Date.now();
    const animNowMs = performance.now();
    const sizeScoreBySymbol = new Map<string, number>();
    const metricsBySymbol = new Map<string, { height: number; sizeScore: number; heightScore: number; volumeNorm: number }>();
    const prioritizedDiscSymbols = (() => {
      const gainers = selected.items
        .filter((item) => item.priceChangePercent > 0)
        .sort(
          (a, b) =>
            b.priceChangePercent - a.priceChangePercent ||
            a.rankByQuoteVolume - b.rankByQuoteVolume ||
            a.symbol.localeCompare(b.symbol)
        );
      const source =
        gainers.length > 0
          ? gainers
          : [...selected.items].sort(
              (a, b) =>
                Math.abs(b.priceChangePercent) - Math.abs(a.priceChangePercent) ||
                a.rankByQuoteVolume - b.rankByQuoteVolume ||
                a.symbol.localeCompare(b.symbol)
            );
      return new Set(source.slice(0, TOP_COINS_DISC_GAINERS).map((item) => item.symbol));
    })();
    let changedTowers = 0;
    let heightDeltaSum = 0;
    let baseDeltaSum = 0;

    for (let i = 0; i < selected.items.length; i++) {
      const item = selected.items[i];
      if (!item) continue;
      const rank = item.rankByQuoteVolume || i + 1;
      const metrics = mapTopCoinTowerMetrics({
        pct: item.priceChangePercent,
        quoteVolume: item.quoteVolume,
        maxQuoteVolume,
        rank,
        isTopGainer: item.symbol === topGainerSymbol,
        isTopLoser: item.symbol === topLoserSymbol,
        isTopVolume: item.symbol === topVolumeSymbol
      });
      metricsBySymbol.set(item.symbol, metrics);
      sizeScoreBySymbol.set(item.symbol, metrics.sizeScore);
    }

    const layout = buildTopCoinsLayoutTargets({
      items: selected.items.map((item, index) => ({
        symbol: item.symbol,
        rank: item.rankByQuoteVolume || index + 1,
        pct: item.priceChangePercent,
        isTopVolume: item.symbol === topVolumeSymbol,
        isTopGainer: item.symbol === topGainerSymbol,
        isTopLoser: item.symbol === topLoserSymbol
      })),
      states,
      sizeScoreBySymbol
    });

    const shouldStartIntro = !replayEnabled && selected.hashChanged && !introRef.current.hasRun;
    if (shouldStartIntro) {
      introRef.current.hasRun = true;
      introRef.current.active = true;
      introRef.current.startPending = true;
      introRef.current.startedAtMs = 0;
      introRef.current.elapsedMs = 0;
      introRef.current.progress = 0;
      introRef.current.bootAlpha = 0;
      introRef.current.lifeAlpha = 0;
      introRef.current.storyBeatUntilMs = 0;
    }

    const isIntroApply = introRef.current.active && states.size === 0 && !replayEnabled;
    const introDelayByRank = (rank: number) => {
      if (!isIntroApply) return 0;
      if (rank <= 20) return TOP_INTRO_WAVE_A_START_MS + (rank - 1) * TOP_INTRO_WAVE_A_STEP_MS;
      if (rank <= 80) return TOP_INTRO_WAVE_B_START_MS + (rank - 21) * TOP_INTRO_WAVE_B_STEP_MS;
      return TOP_INTRO_WAVE_C_START_MS + (rank - 81) * TOP_INTRO_WAVE_C_STEP_MS;
    };

    if (!metadataOnly) {
      const changedBudget = Math.max(1, selected.debug.changedCount || selected.items.length);
      const perTowerDelayMs = replayEnabled
        ? 0
        : MathUtils.clamp(7_500 / changedBudget, TOP_UPDATE_WAVE_MIN_DELAY_MS, TOP_UPDATE_WAVE_MAX_DELAY_MS);
      let stagedOrdinal = 0;

      for (let i = 0; i < selected.items.length; i++) {
        const item = selected.items[i];
        if (!item) continue;
        nextSymbols.add(item.symbol);
        const rank = item.rankByQuoteVolume || i + 1;
        const isTopGainer = item.symbol === topGainerSymbol;
        const isTopLoser = item.symbol === topLoserSymbol;
        const isTopVolume = item.symbol === topVolumeSymbol;
        const placement = layout.targets.get(item.symbol);
        const sequence = (hashString32(item.symbol) % 1_000_000) + 1;
        const prev = states.get(item.symbol);
        const metrics = metricsBySymbol.get(item.symbol);
        const volumeNorm = metrics?.volumeNorm ?? MathUtils.clamp(Math.log10(item.quoteVolume + 1) / Math.log10(maxQuoteVolume + 1), 0, 1);
        const nextHeight = metrics?.height ?? TOWER_VISUAL_MIN_HEIGHT;
        const nextBase = metrics?.sizeScore ?? 0.5;
        const isDiscPriority = prioritizedDiscSymbols.has(item.symbol);
        const targetX = placement?.x ?? prev?.xTarget ?? prev?.x ?? 0;
        const targetZ = placement?.z ?? prev?.zTarget ?? prev?.z ?? 0;
        const districtId = placement?.districtId ?? prev?.districtId ?? 0;

        let nextGlowStrength = MathUtils.clamp(
          0.72 + volumeNorm * 0.78 + Math.min(0.42, Math.abs(item.priceChangePercent) * 0.012),
          0.72,
          1.95
        );
        if (isTopGainer) nextGlowStrength *= 1.16;
        if (isTopLoser) nextGlowStrength *= 0.98;
        if (isTopVolume) nextGlowStrength *= 1.12;

        if (!prev) {
          const delay = introDelayByRank(rank);
          const emittedAt = isIntroApply ? Number.POSITIVE_INFINITY : animNowMs;
          const discRevealAt = isIntroApply ? Number.POSITIVE_INFINITY : animNowMs + (220 + rank * 5);
          const discRevealDelayMs = isIntroApply
            ? TOP_INTRO_LIFE_START_MS + Math.min(TOP_INTRO_DISC_STAGGER_MAX_MS, Math.max(0, rank - 1) * TOP_INTRO_DISC_STAGGER_STEP_MS)
            : undefined;
          changedTowers += 1;
          heightDeltaSum += nextHeight;
          baseDeltaSum += nextBase;
          states.set(item.symbol, {
            symbol: item.symbol,
            baseAsset: item.base,
            quoteAsset: item.quote,
            sequence,
            districtId,
            x: targetX,
            z: targetZ,
            xTarget: targetX,
            zTarget: targetZ,
            rank,
            emittedAt,
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
            logoPath: item.logoPath ?? null,
            isDiscPriority,
            discRevealAt,
            discRevealDelayMs,
            updateStartAt: animNowMs,
            discOcclusion: 0,
            sparkUntilMs: 0,
            introDelayMs: isIntroApply ? delay : undefined
          });
          continue;
        }

        const prevRank = prev.rank;
        const heightDelta = Math.abs(prev.heightTarget - nextHeight);
        const baseDelta = Math.abs(prev.baseTarget - nextBase);
        const pctDelta = Math.abs(prev.pctTarget - item.priceChangePercent);
        const volumeDeltaRatio = Math.abs(prev.quoteVolumeTarget - item.quoteVolume) / Math.max(1, prev.quoteVolumeTarget);
        const meaningful =
          replayEnabled ||
          pctDelta > TOP_UPDATE_THRESHOLD_PCT ||
          volumeDeltaRatio > TOP_UPDATE_THRESHOLD_VOLUME ||
          heightDelta > 0.08 ||
          baseDelta > 0.014 ||
          prevRank !== rank;

        if (meaningful) {
          changedTowers += 1;
          heightDeltaSum += heightDelta;
          baseDeltaSum += baseDelta;
        }
        if ((prevRank > 10 && rank <= 10) || (prevRank - rank >= 12 && rank <= 35)) {
          pushShockwave(prev.x, prev.z, item.priceChangePercent >= 0 ? '#f9b563' : '#7aa6d9', 1100, 13, 0.25);
        }

        let updateStartAt = animNowMs;
        if (!replayEnabled && selected.hashChanged && meaningful) {
          updateStartAt = animNowMs + TOP_UPDATE_WAVE_LEAD_MS + stagedOrdinal * perTowerDelayMs;
          stagedOrdinal += 1;
        }

        const blend = replayEnabled ? 1 : meaningful ? 0.56 : 0.18;
        prev.baseAsset = item.base;
        prev.quoteAsset = item.quote;
        prev.rank = rank;
        prev.active = true;
        prev.districtId = districtId;
        prev.xTarget = targetX;
        prev.zTarget = targetZ;
        prev.pctTarget = MathUtils.lerp(prev.pctTarget, item.priceChangePercent, blend);
        prev.quoteVolumeTarget = MathUtils.lerp(prev.quoteVolumeTarget, item.quoteVolume, blend);
        prev.lastPriceTarget = MathUtils.lerp(prev.lastPriceTarget, item.lastPrice, blend);
        prev.heightTarget = MathUtils.lerp(prev.heightTarget, nextHeight, blend);
        prev.baseTarget = MathUtils.lerp(prev.baseTarget, nextBase, blend);
        prev.glowStrengthTarget = MathUtils.lerp(prev.glowStrengthTarget, nextGlowStrength, blend);
        prev.opacityTarget = 1;
        prev.isTopGainer = isTopGainer;
        prev.isTopLoser = isTopLoser;
        prev.isTopVolume = isTopVolume;
        prev.logoPath = item.logoPath ?? null;
        prev.isDiscPriority = isDiscPriority;
        prev.updateStartAt = updateStartAt;
      }

      for (const [symbol, state] of states) {
        if (nextSymbols.has(symbol)) continue;
        state.active = false;
        state.opacityTarget = 0;
        state.rank = 999;
        state.updateStartAt = animNowMs;
      }

      if (!replayEnabled && selected.hashChanged) {
        const stagedWindowMs =
          TOP_UPDATE_WAVE_LEAD_MS + Math.max(0, stagedOrdinal - 1) * perTowerDelayMs + TOP_UPDATE_WAVE_TAIL_MS;
        updateWaveUntilRef.current = animNowMs + stagedWindowMs;
      }

      if (!replayEnabled && selected.hashChanged && !shouldStartIntro) {
        const breadth = selected.stats.breadth ?? 0;
        pushShockwave(0, 0, breadth >= 0 ? '#f8b46a' : '#8eb1de', 950, Math.max(14, layout.cityRadius * 0.24), 0.2);
      }

      if (!replayEnabled && selected.hashChanged && lastTopGainerSymbolRef.current !== topGainerSymbol) {
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
          slot.durationMs = 980;
          topGainerState.sparkUntilMs = performance.now() + 900;
        }
      }
      lastTopGainerSymbolRef.current = topGainerSymbol;

      const activeStates = selected.items
        .map((item) => states.get(item.symbol))
        .filter((state): state is TopCoinSymbolState => Boolean(state))
        .sort((a, b) => a.rank - b.rank);

      for (const state of activeStates) {
        state.discOcclusion = 0;
      }
      for (let i = 0; i < activeStates.length; i++) {
        const a = activeStates[i];
        for (let j = i + 1; j < activeStates.length; j++) {
          const b = activeStates[j];
          const dist = Math.hypot(a.xTarget - b.xTarget, a.zTarget - b.zTarget);
          if (dist > 6.9) continue;
          const overlap = smoothstep01(remapClamped(6.9 - dist, 0, 6.9));
          if (a.rank < b.rank) {
            b.discOcclusion = Math.max(b.discOcclusion, overlap);
          } else {
            a.discOcclusion = Math.max(a.discOcclusion, overlap);
          }
        }
      }

      districtsRef.current = [];
      const traces: TraceDatum[] = [];
      const arterialTraces: TraceDatum[] = [];
      const trafficParticles: TrafficParticleDatum[] = [];
      const arterialTrafficParticles: TrafficParticleDatum[] = [];
      const dedupe = new Set<string>();

      const pushLink = (a: TopCoinSymbolState, b: TopCoinSymbolState, arterial: boolean, seed: number, force = false) => {
        const aSeq = Math.min(a.sequence, b.sequence);
        const bSeq = Math.max(a.sequence, b.sequence);
        const key = `${aSeq}:${bSeq}:${arterial ? 'A' : 'T'}`;
        if (dedupe.has(key)) return;
        dedupe.add(key);

        const segment = segmentFromPoints(a.xTarget, a.zTarget, b.xTarget, b.zTarget);
        if (segment.length < 1.2) return;
        if (!arterial && !force && segment.length > 34) return;

        const avgPct = (a.pctTarget + b.pctTarget) * 0.5;
        const avgVolNorm = MathUtils.clamp(
          (Math.log10(a.quoteVolumeTarget + 1) + Math.log10(b.quoteVolumeTarget + 1)) / (2 * Math.log10(maxQuoteVolume + 1)),
          0,
          1
        );
        const rankFactor = MathUtils.lerp(
          1.22,
          0.74,
          MathUtils.clamp((Math.min(a.rank, b.rank) - 1) / Math.max(1, TOP_COINS_UNIVERSE_LIMIT - 1), 0, 1)
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

        if (arterial) arterialTraces.push(trace);
        else traces.push(trace);

        const particleCount = Math.min(
          arterial ? 7 : 5,
          Math.max(arterial ? 2 : 1, Math.round((1.2 + segment.length / 10) * (0.9 + avgVolNorm * 1.4)))
        );
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
          const speed = (0.018 + avgVolNorm * 0.05) * (arterial ? 1.16 : 1) * speedMood * rankFactor;
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
          if (arterial) arterialTrafficParticles.push(entry);
          else trafficParticles.push(entry);
        }
      };

      const maxLinkDistance = MathUtils.clamp(layout.cityRadius * 0.44, 28, 54);
      const desiredLinksBase = RUNTIME_QUALITY_CONFIG.tier === 'low' ? 2 : RUNTIME_QUALITY_CONFIG.tier === 'medium' ? 3 : 5;

      for (let i = 0; i < activeStates.length; i++) {
        const origin = activeStates[i];
        const neighbors = activeStates
          .filter((other) => other.sequence !== origin.sequence)
          .map((other) => ({
            other,
            dist: Math.hypot(other.xTarget - origin.xTarget, other.zTarget - origin.zTarget)
          }))
          .sort((a, b) => a.dist - b.dist);
        if (neighbors.length === 0) continue;
        pushLink(origin, neighbors[0].other, false, i + 1, true);
        let added = 1;
        const desiredLinks = origin.rank <= 24 ? desiredLinksBase + 1 : desiredLinksBase;
        for (let n = 1; n < neighbors.length && added < desiredLinks; n++) {
          if (neighbors[n].dist > maxLinkDistance) continue;
          pushLink(origin, neighbors[n].other, false, i * 11 + n);
          added += 1;
        }
        for (let n = 1; n < neighbors.length && added < 2; n++) {
          pushLink(origin, neighbors[n].other, false, i * 17 + n, true);
          added += 1;
        }
      }

      const topTen = activeStates.slice(0, Math.min(10, activeStates.length));
      for (let i = 0; i < topTen.length; i++) {
        const a = topTen[i];
        const b = topTen[(i + 1) % topTen.length];
        if (a && b && a.sequence !== b.sequence) {
          pushLink(a, b, true, 8100 + i, true);
        }
        const c = topTen[(i + 2) % topTen.length];
        if (a && c && a.sequence !== c.sequence && i < topTen.length - 2) {
          pushLink(a, c, true, 8200 + i, true);
        }
      }

      const globalLeader = activeStates[0] ?? null;
      const topGainerHub = activeStates.find((state) => state.symbol === topGainerSymbol) ?? null;
      const topLoserHub = activeStates.find((state) => state.symbol === topLoserSymbol) ?? null;
      const topVolumeHub = activeStates.find((state) => state.symbol === topVolumeSymbol) ?? null;
      const arterialHubs = [globalLeader, topGainerHub, topVolumeHub, topLoserHub].filter(
        (state, idx, arr): state is TopCoinSymbolState => Boolean(state) && arr.findIndex((s) => s?.sequence === state?.sequence) === idx
      );
      const arterialTargetPool = activeStates.slice(0, Math.min(40, activeStates.length));
      for (let h = 0; h < arterialHubs.length; h++) {
        const hub = arterialHubs[h];
        const candidates = arterialTargetPool
          .filter((candidate) => candidate.sequence !== hub.sequence)
          .map((candidate) => ({
            candidate,
            dist: Math.hypot(candidate.xTarget - hub.xTarget, candidate.zTarget - hub.zTarget)
          }))
          .sort((a, b) => a.dist - b.dist);
        const arterialLinks = Math.min(6, candidates.length);
        for (let i = 0; i < arterialLinks; i++) {
          pushLink(hub, candidates[i]!.candidate, true, h * 19 + i + 1, true);
        }
      }

      // Keep Top Coins ground scaling aligned with BTC mode:
      // derive bounds directly from active tower positions with a fixed margin.
      let maxRadius = 18;
      let maxHeight = 10;
      for (let i = 0; i < activeStates.length; i++) {
        const state = activeStates[i];
        if (!state) continue;
        maxRadius = Math.max(maxRadius, Math.hypot(state.xTarget, state.zTarget) + 8);
        maxHeight = Math.max(maxHeight, state.heightTarget + 2.5);
      }
      boundsRef.current = { radius: maxRadius, maxY: maxHeight };

      const parkTowerTargets: TopCoinsParkTower[] = [];
      for (const item of selected.items) {
        const state = states.get(item.symbol);
        if (!state) continue;
        const shape = buildTowerShapeParams(state.sequence, MathUtils.clamp(state.baseTarget, 0, 1));
        const baseScale = topCoinBaseScale({
          pct: state.pctTarget,
          rank: state.rank,
          sizeScore: state.baseTarget,
          isTopGainer: state.isTopGainer,
          isTopLoser: state.isTopLoser,
          isTopVolume: state.isTopVolume
        });
        const baseW = MathUtils.clamp(shape.baseW * baseScale, MIN_BASE * 0.95, MAX_BASE * 1.95);
        const baseD = MathUtils.clamp(shape.baseD * baseScale, MIN_BASE * 0.95, MAX_BASE * 1.95);
        parkTowerTargets.push({
          sequence: state.sequence,
          x: state.xTarget,
          z: state.zTarget,
          height: state.heightTarget,
          baseW,
          baseD,
          footprintX: MathUtils.clamp(baseW * 0.98, 0.8, 5.7),
          footprintZ: MathUtils.clamp(baseD * 0.98, 0.8, 5.7)
        });
      }
      const decorativeParks = buildTopCoinsDecorativeParks({
        towers: parkTowerTargets,
        cityRadius: boundsRef.current.radius,
        traces,
        arterialTraces
      });
      const filteredTraceIds = new Set<string>();
      for (let i = 0; i < decorativeParks.traces.length; i++) {
        const trace = decorativeParks.traces[i];
        if (trace) filteredTraceIds.add(trace.id);
      }
      const filteredArterialTraceIds = new Set<string>();
      for (let i = 0; i < decorativeParks.arterialTraces.length; i++) {
        const trace = decorativeParks.arterialTraces[i];
        if (trace) filteredArterialTraceIds.add(trace.id);
      }
      const filteredTraffic = trafficParticles.filter((particle) => filteredTraceIds.has(particle.traceId));
      const filteredArterialTraffic = arterialTrafficParticles.filter((particle) =>
        filteredArterialTraceIds.has(particle.traceId)
      );
      tracesRef.current = decorativeParks.traces;
      arterialTracesRef.current = decorativeParks.arterialTraces;
      trafficRef.current = filteredTraffic;
      arterialTrafficRef.current = filteredArterialTraffic;
      parksRef.current = decorativeParks.parks;
      parkTreesRef.current = decorativeParks.trees;

      const totalBreadth = Math.max(1, selected.items.length);
      const breadthRaw = selected.stats.breadth ?? (selected.stats.marketBreadth.positive - selected.stats.marketBreadth.negative) / totalBreadth;
      moodTargetRef.current = MathUtils.clamp(0.5 + breadthRaw * 0.5, 0.08, 0.92);
      volatilityRef.current =
        selected.items.length > 0
          ? MathUtils.clamp(
              selected.items.reduce((acc, item) => acc + Math.abs(item.priceChangePercent), 0) / selected.items.length / 6,
              0.15,
              1.2
            )
          : 0.2;
      clutterRef.current = MathUtils.clamp(
        (decorativeParks.traces.length * 0.65 + filteredTraffic.length * 0.2 + selected.items.length) / 360,
        0,
        1
      );
    }

    const meta = liveSnapshotRef.current ?? selected;
    const asOfMs = meta.asOf;
    const pollSec = Math.max(1, Math.floor((meta.debug.pollMs || 60_000) / 1000));
    const nowDebug = Date.now();
    const asOfAgeSec = asOfMs > 0 ? Math.max(0, (nowDebug - asOfMs) / 1000) : 0;
    const nextUpdateInSec = Math.max(0, (meta.debug.nextUpdateAt - nowDebug) / 1000);
    debugRef.current = {
      snapshotSeq: meta.sequence,
      applyCount: metadataOnly ? debugRef.current.applyCount : debugRef.current.applyCount + 1,
      changedTowers: metadataOnly ? debugRef.current.changedTowers : changedTowers,
      changedCount: meta.debug.changedCount,
      heightDeltaSum: metadataOnly ? debugRef.current.heightDeltaSum : heightDeltaSum,
      baseDeltaSum: metadataOnly ? debugRef.current.baseDeltaSum : baseDeltaSum,
      lastAppliedAt: metadataOnly ? debugRef.current.lastAppliedAt : wallNowMs,
      asOfMs,
      asOfIso: meta.asOfIso || (asOfMs > 0 ? new Date(asOfMs).toISOString() : ''),
      asOfAgeSec,
      asOfAgeLabel: fmtAgeFriendly(asOfAgeSec),
      staleData: asOfAgeSec > pollSec * 2,
      symbols: meta.debug.symbols,
      fetchedAt: meta.debug.fetchedAt,
      lastFetchAt: meta.debug.lastFetchAt,
      lastSuccessAt: meta.debug.lastSuccessAt,
      pollSec,
      nextUpdateAtMs: meta.debug.nextUpdateAt,
      nextUpdateInSec,
      nextUpdateInLabel: fmtMmSs(nextUpdateInSec),
      lastHash: meta.debug.lastHash,
      hashChanged: meta.debug.hashChanged,
      refreshAgeSec: meta.debug.refreshAgeSec,
      lastError: meta.debug.lastError,
      lastFetchOk: meta.debug.lastFetchOk,
      logosMissing: meta.debug.logosMissing,
      logosAttempted: meta.debug.logosAttempted,
      logosDownloaded: meta.debug.logosDownloaded,
      layoutIters: metadataOnly ? debugRef.current.layoutIters : layout.layoutIters,
      minSeparation: metadataOnly ? debugRef.current.minSeparation : layout.minSeparation,
      overlapFix: metadataOnly ? debugRef.current.overlapFix : layout.overlapFix,
      introActive: introRef.current.active,
      introBootAlpha: introRef.current.bootAlpha,
      introLifeAlpha: introRef.current.lifeAlpha,
      introProgress: introRef.current.progress,
      clutter: clutterRef.current,
      discVisible: Array.from(statesRef.current.values()).filter((state) => state.isDiscPriority).length,
      discMode: replayEnabled ? 'replay' : 'live',
      replayEnabled,
      replayOffset,
      replayMax,
      replayAsOfIso: replayEnabled && activeSnapshot ? activeSnapshot.asOfIso : '',
      topGainer: meta.stats.topGainer,
      topLoser: meta.stats.topLoser,
      topVolume: meta.stats.topVolume
    };

    if (!metadataOnly) {
      setVersion((v) => v + 1);
    } else {
      setVersion((v) => v + 1);
    }
  }, [activeSnapshot, historyVersion, replayEnabled, replayIndex, replayMax, replayOffset, snapshot]);

  useEffect(() => {
    let raf = 0;
    let prevTime = performance.now();
    let mounted = true;

    const tick = (now: number) => {
      if (!mounted) return;
      const rawDtMs = Math.max(0, now - prevTime);
      const dt = Math.max(0.001, rawDtMs / 1000);
      prevTime = now;
      let dirty = false;
      const nowAnimMs = now;
      const nowWallMs = Date.now();

      moodRef.current = easeTowards(moodRef.current, moodTargetRef.current, 2.8, dt);
      const waveLeftMs = Math.max(0, updateWaveUntilRef.current - nowAnimMs);
      const waveLoadTarget = waveLeftMs > 0 ? MathUtils.clamp(0.35 + (waveLeftMs / 10_000) * 0.65, 0, 1) : 0;
      const nextWaveLoad = easeTowards(updateWaveLoadRef.current, waveLoadTarget, 4.5, dt);
      if (Math.abs(nextWaveLoad - updateWaveLoadRef.current) > 0.001) {
        updateWaveLoadRef.current = nextWaveLoad;
        dirty = true;
      }

      if (introRef.current.active && introRef.current.startPending) {
        introRef.current.startPending = false;
        introRef.current.startedAtMs = nowAnimMs;
        introRef.current.elapsedMs = 0;
        for (const state of statesRef.current.values()) {
          if (state.introDelayMs != null) {
            state.emittedAt = nowAnimMs + state.introDelayMs;
            state.introDelayMs = undefined;
          }
          if (state.discRevealDelayMs != null) {
            state.discRevealAt = nowAnimMs + state.discRevealDelayMs;
            state.discRevealDelayMs = undefined;
          }
        }
        dirty = true;
      }

      if (introRef.current.active) {
        if (introRef.current.startedAtMs <= 0) {
          introRef.current.startedAtMs = nowAnimMs;
        }
        const elapsed = Math.max(0, nowAnimMs - introRef.current.startedAtMs);
        introRef.current.elapsedMs = Math.min(TOP_INTRO_TOTAL_MS, elapsed);
        const bootAlpha = MathUtils.clamp(elapsed / TOP_INTRO_BOOT_MS, 0, 1);
        const lifeAlpha = MathUtils.clamp((elapsed - TOP_INTRO_LIFE_START_MS) / TOP_INTRO_LIFE_RAMP_MS, 0, 1);
        const progress = MathUtils.clamp(elapsed / TOP_INTRO_TOTAL_MS, 0, 1);
        if (
          Math.abs(bootAlpha - introRef.current.bootAlpha) > 0.001 ||
          Math.abs(lifeAlpha - introRef.current.lifeAlpha) > 0.001 ||
          Math.abs(progress - introRef.current.progress) > 0.001
        ) {
          introRef.current.bootAlpha = bootAlpha;
          introRef.current.lifeAlpha = lifeAlpha;
          introRef.current.progress = progress;
          dirty = true;
        }
        if (elapsed >= TOP_INTRO_TOTAL_MS) {
          introRef.current.active = false;
          introRef.current.startPending = false;
          introRef.current.bootAlpha = 1;
          introRef.current.lifeAlpha = 1;
          introRef.current.progress = 1;
          introRef.current.elapsedMs = TOP_INTRO_TOTAL_MS;
          introRef.current.storyBeatUntilMs = nowWallMs + TOP_INTRO_CAMERA_BEAT_MS;
          dirty = true;
        }
      }

      const nowPerf = nowAnimMs;
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
        const canStart = nowAnimMs >= (state.updateStartAt || 0);

        if (canStart) {
          const smoothAlpha = Number.isFinite(state.smoothAlpha) ? state.smoothAlpha : 3.8;
          state.x = easeTowards(state.x, state.xTarget, Math.min(2.3, smoothAlpha * 0.55), dt);
          state.z = easeTowards(state.z, state.zTarget, Math.min(2.3, smoothAlpha * 0.55), dt);
          state.height = easeTowards(state.height, state.heightTarget, 1.85, dt);
          state.base = easeTowards(state.base, state.baseTarget, 1.78, dt);
          state.pct = easeTowards(state.pct, state.pctTarget, 1.7, dt);
          state.quoteVolume = easeTowards(state.quoteVolume, state.quoteVolumeTarget, 1.62, dt);
          state.lastPrice = easeTowards(state.lastPrice, state.lastPriceTarget, 1.62, dt);
          state.glowStrength = easeTowards(state.glowStrength, state.glowStrengthTarget, 1.86, dt);
          state.opacity = easeTowards(state.opacity, state.opacityTarget, 2.4, dt);
        }

        if (state.opacityTarget <= 0.001 && state.opacity < 0.02) {
          statesRef.current.delete(symbol);
          dirty = true;
          continue;
        }
        if (state.sparkUntilMs > 0 && nowPerf > state.sparkUntilMs) {
          state.sparkUntilMs = 0;
          dirty = true;
        }
        if (
          state.sparkUntilMs <= 0 &&
          (state.rank <= 12 || state.isTopGainer || state.isTopLoser) &&
          Math.abs(state.pct) >= 1 &&
          Math.sin(nowPerf * 0.00013 + state.sequence * 0.17) > 0.9988
        ) {
          state.sparkUntilMs = nowPerf + 360;
          dirty = true;
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

      if (dirty) setVersion((v) => v + 1);
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
    const now = performance.now();
    for (const state of list) {
      const pctMagnitude = MathUtils.clamp(Math.abs(state.pct) / Math.max(1, Math.abs(debugRef.current.topGainer.pct) || 1), 0, 1);
      const isPositive = state.pct >= 0;
      const accent = isPositive ? new Color('#87c79a') : new Color('#c17a73');
      const glow = TRACE_ORANGE.clone().lerp(accent, 0.36 + pctMagnitude * 0.42);
      if (state.isTopLoser) glow.lerp(new Color('#7aa6d9'), 0.58);
      if (state.isTopGainer) glow.lerp(new Color('#ffd98f'), 0.4);
      const core = CORE_GRAPHITE.clone().lerp(CORE_GRAPHITE_HI, 0.26 + pctMagnitude * 0.28);
      if (state.isTopLoser) core.lerp(new Color('#8da5bb'), 0.18);
      const districtTint = TOP_COINS_DISTRICT_TINTS[state.districtId % TOP_COINS_DISTRICT_TINTS.length] ?? '#ead8bb';
      const shape = buildTowerShapeParams(state.sequence, MathUtils.clamp(state.base, 0, 1));
      const baseScale = topCoinBaseScale({
        pct: state.pct,
        rank: state.rank,
        sizeScore: state.base,
        isTopGainer: state.isTopGainer,
        isTopLoser: state.isTopLoser,
        isTopVolume: state.isTopVolume
      });
      const baseW = MathUtils.clamp(shape.baseW * baseScale, MIN_BASE * 0.95, MAX_BASE * 1.95);
      const baseD = MathUtils.clamp(shape.baseD * baseScale, MIN_BASE * 0.95, MAX_BASE * 1.95);
      const breathe =
        state.isTopGainer || state.isTopLoser
          ? 1 + Math.sin((now + state.sequence * 31) * 0.0018) * 0.045
          : 1;
      out.push({
        sequence: state.sequence,
        x: state.x,
        z: state.z,
        height: state.height,
        archetypeId: shape.archetypeId,
        baseW,
        baseD,
        footprintX: MathUtils.clamp(shape.footprintX * baseScale, MIN_BASE * 0.95, MAX_BASE * 1.7),
        footprintZ: MathUtils.clamp(shape.footprintZ * baseScale, MIN_BASE * 0.95, MAX_BASE * 1.7),
        taper: shape.taper,
        podiumRatio: shape.podiumRatio,
        crownRatio: shape.crownRatio,
        coreColor: `#${core.getHexString()}`,
        glowColor: `#${glow.getHexString()}`,
        glowStrength: state.glowStrength * breathe * (1 - clutterRef.current * 0.14) * MathUtils.clamp(state.opacity, 0, 1),
        bandCount: state.isTopGainer || state.isTopVolume || state.rank <= 3 ? 4 : state.rank <= 16 ? 3 : 2,
        heightScore: MathUtils.clamp(state.base, 0, 1),
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
        usdAnchorU: MathUtils.clamp(state.rank / TOP_COINS_UNIVERSE_LIMIT, 0, 1),
        usdScoreDist: MathUtils.clamp(Math.abs(state.pct) / 20, 0, 1),
        averagePrice: state.lastPrice,
        tradeCount: 0,
        windowStart: activeSnapshot?.asOf ?? Date.now(),
        windowEnd: activeSnapshot?.asOf ?? Date.now(),
        emittedAt: state.emittedAt,
        mode: 'top200',
        assetTicker: state.baseAsset,
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
        isTopVolume: state.isTopVolume,
        discRevealAt: state.discRevealAt,
        discOcclusion: state.discOcclusion,
        isDiscPriority: state.isDiscPriority,
        sparkUntilMs: state.sparkUntilMs
      });
    }
    return out;
  }, [activeSnapshot, version]);

  const tallestTowerSequence = useMemo(() => {
    const topVolume = towers.find((tower) => tower.symbol === debugRef.current.topVolume.symbol);
    if (topVolume) return topVolume.sequence;
    const topGainer = towers.find((tower) => tower.symbol === debugRef.current.topGainer.symbol);
    if (topGainer) return topGainer.sequence;
    let best: TowerDatum | null = null;
    for (const tower of towers) {
      if (!best || tower.height > best.height) best = tower;
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
    topCoinsDebug: debugRef.current,
    topReplay: {
      enabled: replayEnabled,
      offset: replayOffset,
      max: replayMax,
      setEnabled: (next: boolean) => {
        setReplayEnabled(next);
        if (next) {
          const history = historyRef.current;
          setReplayIndex(history.length > 0 ? history.length - 1 : -1);
          pushShockwave(0, 0, '#96b8e2', 900, 12, 0.16);
        } else {
          setReplayIndex(historyRef.current.length > 0 ? historyRef.current.length - 1 : -1);
        }
      },
      setOffset: (offset: number) => {
        const history = historyRef.current;
        if (history.length === 0) return;
        const clampedOffset = Math.max(0, Math.min(offset, history.length - 1));
        const index = history.length - 1 - clampedOffset;
        setReplayIndex(index);
        pushShockwave(0, 0, '#9ec1e9', TOP_REPLAY_SCRUB_MS, 10, 0.14);
      }
    },
    topFx: {
      introBootAlpha: introRef.current.bootAlpha,
      introLifeAlpha: introRef.current.lifeAlpha,
      introProgress: introRef.current.progress,
      introActive: introRef.current.active,
      storyBeatUntilMs: introRef.current.storyBeatUntilMs,
      clutter: MathUtils.clamp(clutterRef.current + updateWaveLoadRef.current * 0.42, 0, 1),
      transitionLoad: updateWaveLoadRef.current
    }
  };
}

function MinimalOrbitRig({
  bounds,
  focusTarget,
  onClearFocusTarget,
  onCameraDebug,
  flyoverTargets,
  flyoverSignal = 0,
  onFlyoverActiveChange,
  storyBeatUntilMs = 0,
  resetSignal = 0,
  zoomInSignal = 0,
  zoomOutSignal = 0
}: {
  bounds: SandboxBounds;
  focusTarget?: CameraFocusTarget | null;
  onClearFocusTarget?: () => void;
  onCameraDebug?: (snapshot: CameraDebugSnapshot) => void;
  flyoverTargets?: readonly CinematicFlyoverTarget[];
  flyoverSignal?: number;
  onFlyoverActiveChange?: (active: boolean) => void;
  storyBeatUntilMs?: number;
  resetSignal?: number;
  zoomInSignal?: number;
  zoomOutSignal?: number;
}) {
  const { camera, gl } = useThree();
  const initializedRef = useRef(false);
  const modeRef = useRef<CameraMode>('auto');
  const clearFocusTargetRef = useRef(onClearFocusTarget);

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
  const flyoverPlanRef = useRef<CinematicFlyoverPlan | null>(null);
  const flyoverElapsedRef = useRef(0);
  const lastFlyoverSignalRef = useRef(flyoverSignal);
  const lastZoomInSignalRef = useRef(zoomInSignal);
  const lastZoomOutSignalRef = useRef(zoomOutSignal);
  const flyoverActiveChangeRef = useRef(onFlyoverActiveChange);
  const autoReturnBoostUntilRef = useRef(0);

  useEffect(() => {
    clearFocusTargetRef.current = onClearFocusTarget;
  }, [onClearFocusTarget]);

  useEffect(() => {
    flyoverActiveChangeRef.current = onFlyoverActiveChange;
  }, [onFlyoverActiveChange]);

  const syncControlFromCurrentView = () => {
    const control = controlRef.current;
    const actual = actualRef.current;
    const px = smoothPosition.lengthSq() > 0 ? smoothPosition.x : camera.position.x;
    const pz = smoothPosition.lengthSq() > 0 ? smoothPosition.z : camera.position.z;
    const py = smoothPosition.lengthSq() > 0 ? smoothPosition.y : camera.position.y;
    const lookY = smoothTarget.lengthSq() > 0 ? smoothTarget.y : 4;
    const angle = Math.atan2(px, pz);
    const distance = Math.max(0.001, Math.hypot(px, pz));

    control.angle = angle;
    control.distance = distance;
    control.elevation = py;
    control.lookY = lookY;

    actual.angle = angle;
    actual.distance = distance;
    actual.elevation = py;
    actual.lookY = lookY;
  };

  const clearFlyoverState = () => {
    const wasActive = modeRef.current === 'flyover' || flyoverPlanRef.current != null;
    flyoverPlanRef.current = null;
    flyoverElapsedRef.current = 0;
    autoReturnBoostUntilRef.current = 0;
    if (wasActive) {
      flyoverActiveChangeRef.current?.(false);
    }
  };

  useLayoutEffect(() => {
    if (initializedRef.current) return;

    const radius = Math.max(18, bounds.radius);
    const maxY = Math.max(8, bounds.maxY);
    const autoAngle = 0;
    const autoDistance = MathUtils.clamp(18 + radius * 1.65 + maxY * 0.55, 24, 170);
    const autoElevation = MathUtils.clamp(8 + maxY * 0.9 + radius * 0.22, 10, 72);
    const autoLookY = MathUtils.clamp(1.5 + maxY * 0.45, 2, 30);

    const auto = autoRef.current;
    auto.angle = autoAngle;
    auto.distance = autoDistance;
    auto.elevation = autoElevation;
    auto.lookY = autoLookY;

    const control = controlRef.current;
    control.angle = autoAngle;
    control.distance = autoDistance;
    control.elevation = autoElevation;
    control.lookY = autoLookY;

    const actual = actualRef.current;
    actual.angle = autoAngle;
    actual.distance = autoDistance;
    actual.elevation = autoElevation;
    actual.lookY = autoLookY;

    centerActualRef.current.x = 0;
    centerActualRef.current.z = 0;
    centerTargetRef.current.x = 0;
    centerTargetRef.current.z = 0;

    tempDir.set(Math.sin(autoAngle), 0, Math.cos(autoAngle));
    desiredPosition.copy(tempDir).multiplyScalar(autoDistance);
    desiredPosition.y = autoElevation;
    desiredTarget.set(0, autoLookY, 0);
    smoothPosition.copy(desiredPosition);
    smoothTarget.copy(desiredTarget);
    camera.position.copy(smoothPosition);
    camera.lookAt(smoothTarget);
    initializedRef.current = true;
  }, [bounds.maxY, bounds.radius, camera]);

  useEffect(() => {
    const canvas = gl.domElement;

    const markUserInteraction = () => {
      if (modeRef.current === 'flyover') {
        clearFlyoverState();
        syncControlFromCurrentView();
      }
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
      if (modeRef.current === 'focus' || modeRef.current === 'flyover') {
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
      if (modeRef.current === 'focus' || modeRef.current === 'flyover') {
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
        clearFlyoverState();
        syncControlFromCurrentView();
        modeRef.current = 'auto';
        clearFocusTargetRef.current?.();
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
    if (modeRef.current === 'flyover') return;
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

  useEffect(() => {
    if (resetSignal <= 0) return;
    clearFlyoverState();
    syncControlFromCurrentView();
    modeRef.current = 'auto';
    clearFocusTargetRef.current?.();
  }, [resetSignal]);

  useEffect(() => {
    const flyoverDelta = Math.max(0, flyoverSignal - lastFlyoverSignalRef.current);
    lastFlyoverSignalRef.current = flyoverSignal;
    if (flyoverDelta <= 0 || !flyoverTargets || flyoverTargets.length === 0) return;

    clearFocusTargetRef.current?.();
    const startPosition = smoothPosition.lengthSq() > 0 ? smoothPosition : camera.position;
    const startTarget = smoothTarget.lengthSq() > 0 ? smoothTarget : desiredTarget.set(0, 4, 0);
    const plan = buildCinematicFlyoverPlan({
      targets: flyoverTargets,
      startPosition,
      startTarget,
      boundsRadius: bounds.radius,
      maxY: bounds.maxY,
      reducedMotion: RUNTIME_QUALITY_CONFIG.reducedMotion
    });

    if (!plan) return;

    flyoverPlanRef.current = plan;
    flyoverElapsedRef.current = 0;
    autoReturnBoostUntilRef.current = 0;
    modeRef.current = 'flyover';
    flyoverActiveChangeRef.current?.(true);
  }, [bounds.maxY, bounds.radius, camera, flyoverSignal, flyoverTargets]);

  useEffect(() => {
    const zoomInDelta = Math.max(0, zoomInSignal - lastZoomInSignalRef.current);
    const zoomOutDelta = Math.max(0, zoomOutSignal - lastZoomOutSignalRef.current);
    lastZoomInSignalRef.current = zoomInSignal;
    lastZoomOutSignalRef.current = zoomOutSignal;
    if (zoomInDelta <= 0 && zoomOutDelta <= 0) return;

    const control = controlRef.current;
    const px = smoothPosition.lengthSq() > 0 ? smoothPosition.x : camera.position.x;
    const pz = smoothPosition.lengthSq() > 0 ? smoothPosition.z : camera.position.z;
    control.angle = Math.atan2(px, pz);
    control.distance = Math.max(0.001, Math.hypot(px, pz));
    control.elevation = smoothPosition.lengthSq() > 0 ? smoothPosition.y : camera.position.y;
    control.lookY = smoothTarget.lengthSq() > 0 ? smoothTarget.y : 4;

    clearFlyoverState();
    if (focusTarget) {
      clearFocusTargetRef.current?.();
    }
    modeRef.current = 'user';

    if (zoomInDelta > 0) {
      control.distance -= 8 * zoomInDelta;
    }
    if (zoomOutDelta > 0) {
      control.distance += 8 * zoomOutDelta;
    }
  }, [camera, focusTarget, zoomInSignal, zoomOutSignal]);

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    const storyBeatActive = storyBeatUntilMs > Date.now();
    const radius = Math.max(18, bounds.radius);
    const maxY = Math.max(8, bounds.maxY);
    const orbitScale = RUNTIME_QUALITY_CONFIG.cameraOrbitSpeedScale;
    const driftScale = RUNTIME_QUALITY_CONFIG.cameraDriftScale;
    const storyOrbitMul = storyBeatActive ? 0.62 : 1;

    const auto = autoRef.current;
    auto.angle = wrapAngleRad(t * 0.18 * orbitScale * storyOrbitMul + Math.sin(t * 0.1 * orbitScale) * (0.06 * driftScale));
    auto.distance = MathUtils.clamp(18 + radius * 1.65 + maxY * 0.55 + (storyBeatActive ? 8 : 0), 24, 170);
    auto.elevation = MathUtils.clamp(8 + maxY * 0.9 + radius * 0.22 + (storyBeatActive ? 2.2 : 0), 10, 72);
    auto.lookY = MathUtils.clamp(1.5 + maxY * 0.45, 2, 30);

    const keys = keysRef.current;
    const anyMovementKey = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD || keys.KeyQ || keys.KeyE;
    if (anyMovementKey) {
      if (modeRef.current === 'flyover') {
        clearFlyoverState();
        syncControlFromCurrentView();
      }
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

    if (modeRef.current === 'flyover') {
      const plan = flyoverPlanRef.current;
      if (!plan) {
        clearFlyoverState();
        syncControlFromCurrentView();
        modeRef.current = 'auto';
      } else {
        flyoverElapsedRef.current += delta;
        const sample = sampleCinematicFlyoverPlan(plan, flyoverElapsedRef.current, desiredPosition, desiredTarget);
        smoothPosition.copy(desiredPosition);
        smoothTarget.copy(desiredTarget);
        camera.position.copy(smoothPosition);
        camera.lookAt(smoothTarget);

        if (sample.complete) {
          clearFlyoverState();
          syncControlFromCurrentView();
          modeRef.current = 'auto';
          autoReturnBoostUntilRef.current = performance.now() + 2200;
        }

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

        return;
      }
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

    const autoReturnBoostActive = modeRef.current === 'auto' && performance.now() < autoReturnBoostUntilRef.current;
    const orbitDamp = modeRef.current === 'auto' ? (autoReturnBoostActive ? 4.2 : 1.6) : modeRef.current === 'focus' ? 2.4 : 2.2;
    const radiusDamp = modeRef.current === 'auto' ? (autoReturnBoostActive ? 4 : 1.5) : modeRef.current === 'focus' ? 2.3 : 2.1;
    const verticalDamp = modeRef.current === 'auto' ? (autoReturnBoostActive ? 3.9 : 1.45) : modeRef.current === 'focus' ? 2.2 : 2.0;
    const lookDamp = modeRef.current === 'auto' ? (autoReturnBoostActive ? 3.8 : 1.4) : modeRef.current === 'focus' ? 2.25 : 1.9;
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

    const autoPositionDamp = autoReturnBoostActive ? 4.8 : 1.8;
    const autoTargetDamp = autoReturnBoostActive ? 4.4 : 1.75;
    smoothPosition.x = MathUtils.damp(smoothPosition.x, desiredPosition.x, modeRef.current === 'auto' ? autoPositionDamp : 2.4, delta);
    smoothPosition.y = MathUtils.damp(smoothPosition.y, desiredPosition.y, modeRef.current === 'auto' ? autoPositionDamp : 2.4, delta);
    smoothPosition.z = MathUtils.damp(smoothPosition.z, desiredPosition.z, modeRef.current === 'auto' ? autoPositionDamp : 2.4, delta);

    smoothTarget.x = MathUtils.damp(smoothTarget.x, desiredTarget.x, modeRef.current === 'auto' ? autoTargetDamp : 2.2, delta);
    smoothTarget.y = MathUtils.damp(smoothTarget.y, desiredTarget.y, modeRef.current === 'auto' ? autoTargetDamp : 2.2, delta);
    smoothTarget.z = MathUtils.damp(smoothTarget.z, desiredTarget.z, modeRef.current === 'auto' ? autoTargetDamp : 2.2, delta);

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

function TallestCryptoDecals({
  tower,
  preset,
  focusMode,
  isHovered
}: {
  tower: TowerDatum;
  preset: CryptoCityPreset;
  focusMode: boolean;
  isHovered: boolean;
}) {
  const { texture } = useTopCoinDiscTexture(preset.logoPath, preset.assetTicker);

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
              color={isHovered ? preset.theme.primaryHover : preset.theme.primary}
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
  preset,
  sceneMaxY,
  focusMode,
  isHovered
}: {
  tower: TowerDatum;
  preset: CryptoCityPreset;
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
          color={preset.theme.beaconOuter}
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
          color={preset.theme.beaconInner}
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
          color={preset.theme.beaconOuter}
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
          color={preset.theme.beaconInner}
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
  const volumeText = useMemo(
    () => fmtAssetAmount(tower.btcVolume, tower.assetTicker ?? tower.baseAsset ?? 'BTC'),
    [tower.assetTicker, tower.baseAsset, tower.btcVolume]
  );

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
    ctx.fillText(volumeText, 52, 182);

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(247,147,26,0.92)';
    ctx.font = '700 34px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`#${tower.sequence}`, 52, 250);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(244,227,200,0.82)';
    ctx.font = '500 28px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`trades ${tower.tradeCount}`, canvas.width - 52, 250);

    return finalizeCanvasTexture(new CanvasTexture(canvas));
  }, [tower.sequence, tower.tradeCount, usdText, volumeText]);

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

function getTopCoinTickerTexture(ticker: string) {
  const key = ticker.trim().toUpperCase() || 'N/A';
  const existing = topCoinTickerTextureCache.get(key);
  if (existing) return existing;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const fallback = finalizeCanvasTexture(new CanvasTexture(canvas));
    topCoinTickerTextureCache.set(key, fallback);
    return fallback;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

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
  const label = key.length > 5 ? key.slice(0, 5) : key;
  ctx.lineWidth = 20;
  ctx.strokeStyle = 'rgba(7,9,12,0.86)';
  ctx.font = `900 ${Math.max(176, Math.floor(318 - Math.max(0, label.length - 3) * 28))}px ui-sans-serif, system-ui, sans-serif`;
  ctx.shadowColor = 'rgba(247,147,26,0.25)';
  ctx.shadowBlur = 16;
  ctx.strokeText(label, center, center);
  ctx.shadowBlur = 0;
  ctx.fillText(label, center, center);

  const texture = finalizeCanvasTexture(new CanvasTexture(canvas));
  texture.generateMipmaps = false;
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

function useTopCoinDiscTexture(logoPath: string | null | undefined, ticker: string) {
  const fallback = useMemo(() => getTopCoinTickerTexture(ticker), [ticker]);
  const [state, setState] = useState<{ texture: Texture; usingFallback: boolean }>({
    texture: fallback,
    usingFallback: true
  });

  useEffect(() => {
    let mounted = true;
    if (!logoPath) {
      setState({ texture: fallback, usingFallback: true });
      return () => {
        mounted = false;
      };
    }

    const cached = topCoinLogoTextureCache.get(logoPath);
    if (cached !== undefined) {
      setState({ texture: cached ?? fallback, usingFallback: !cached });
      return () => {
        mounted = false;
      };
    }

    loadTopCoinLogoTexture(logoPath).then((loaded) => {
      if (!mounted) return;
      setState({ texture: loaded ?? fallback, usingFallback: !loaded });
    });

    return () => {
      mounted = false;
    };
  }, [fallback, logoPath]);

  return state;
}

function TopCoinLogoDisc({
  tower,
  focusMode,
  isHovered,
  isSelected,
  focusAnchorX = 0,
  focusAnchorZ = 0,
  introLifeAlpha = 1,
  clutter = 0,
  transitionLoad = 0
}: {
  tower: TowerDatum;
  focusMode: boolean;
  isHovered: boolean;
  isSelected: boolean;
  focusAnchorX?: number;
  focusAnchorZ?: number;
  introLifeAlpha?: number;
  clutter?: number;
  transitionLoad?: number;
}) {
  const { camera, gl, size } = useThree();
  const groupRef = useRef<Group>(null);
  const discRef = useRef<Mesh>(null);
  const ringRef = useRef<Mesh>(null);
  const bodyRef = useRef<Mesh>(null);
  const fallbackPlateRef = useRef<Mesh>(null);
  const worldPosRef = useRef(new Vector3());
  const ndcRef = useRef(new Vector3());
  const ticker = useMemo(() => getTopCoinTicker(tower.symbol, tower.baseAsset), [tower.baseAsset, tower.symbol]);
  const { texture, usingFallback } = useTopCoinDiscTexture(tower.logoPath, ticker);

  useEffect(() => {
    if (!texture) return;
    const maxAniso = gl.capabilities.getMaxAnisotropy();
    texture.anisotropy = Math.max(2, Math.min(8, maxAniso || 1));
    texture.needsUpdate = true;
  }, [gl, texture]);

  useEffect(() => {
    return () => {
      topCoinDiscScreenRegistry.delete(tower.sequence);
    };
  }, [tower.sequence]);

  useFrame(({ clock }, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const t = clock.getElapsedTime() + tower.sequence * 0.015;
    g.quaternion.copy(camera.quaternion);
    const isForceVisible = isHovered || isSelected;
    const camDist = camera.position.length();
    const rank = tower.rank ?? TOP_COINS_UNIVERSE_LIMIT;
    const isPriority = Boolean(tower.isDiscPriority);
    const zoomRevealT = smoothstep01(remapClamped(camDist, 24, 14));
    const focusDist = Math.hypot(tower.x - focusAnchorX, tower.z - focusAnchorZ);
    const contextualRadius = MathUtils.lerp(4.2, 24, zoomRevealT);
    const contextualFade = 1 - smoothstep01(remapClamped(focusDist, contextualRadius * 0.4, contextualRadius));
    const contextualAlpha = zoomRevealT * contextualFade;
    const priorityAlpha = isForceVisible ? 1 : isPriority ? 1 : contextualAlpha;
    const introDelay =
      tower.discRevealAt && tower.discRevealAt > 0 ? MathUtils.clamp((performance.now() - tower.discRevealAt) / 900, 0, 1) : 1;
    const introFade = MathUtils.clamp(introLifeAlpha, 0, 1) * introDelay;
    const transitionVisibility = 1 - smoothstep01(remapClamped(transitionLoad, 0.05, 0.22));
    const baseLodAlpha = MathUtils.clamp(priorityAlpha * introFade * transitionVisibility, 0, 1);

    // Keep very-low-priority discs nearly free in far/default views.
    if (!isForceVisible && baseLodAlpha < 0.01 && !isPriority) {
      topCoinDiscScreenRegistry.delete(tower.sequence);
    }

    g.position.set(0, tower.height + 2.7, 0);
    g.getWorldPosition(worldPosRef.current);
    const distance = camera.position.distanceTo(worldPosRef.current);
    const baseScale = MathUtils.clamp(1.16 + distance * 0.0104, 1.35, 4.35);
    // One-way boost: large/tall towers get larger discs; baseline towers never get smaller.
    const towerBoostT = smoothstep01(remapClamped(tower.height, 30, 90));
    let scale = baseScale * MathUtils.lerp(1, 1.26, towerBoostT);
    const fovDeg = (camera as { fov?: number }).fov ?? 50;
    const worldPerPx = (2 * distance * Math.tan(MathUtils.degToRad(fovDeg * 0.5))) / Math.max(320, size.height);
    const minReadableScale = worldPerPx * 42;
    scale = Math.max(scale, minReadableScale);
    const clearance = MathUtils.clamp(1.2 + tower.height * 0.12 + scale * 0.1, 1.6, 5.6);
    g.position.set(0, tower.height + clearance, 0);
    g.scale.set(scale, scale, scale);
    if (ringRef.current) ringRef.current.rotation.z = t * 0.58;
    if (bodyRef.current) bodyRef.current.rotation.z = -t * 0.14;
    if (discRef.current) discRef.current.rotation.z = Math.sin(t * 0.35) * 0.04;
    if (fallbackPlateRef.current) fallbackPlateRef.current.rotation.z = Math.sin(t * 0.35) * 0.04;

    const projected = ndcRef.current.copy(worldPosRef.current).project(camera);
    const nowPerf = performance.now();
    if (baseLodAlpha >= 0.01 || isForceVisible) {
      topCoinDiscScreenRegistry.set(tower.sequence, {
        x: projected.x,
        y: projected.y,
        rank,
        updatedAt: nowPerf
      });
    }

    let screenOcclusion = tower.discOcclusion ?? 0;
    if (baseLodAlpha >= 0.02 || isForceVisible) {
      const screenThresholdX = 0.11 * MathUtils.clamp(1200 / Math.max(320, size.width), 0.78, 1.4);
      const screenThresholdY = 0.15 * MathUtils.clamp(900 / Math.max(320, size.height), 0.78, 1.4);
      for (const [sequence, other] of topCoinDiscScreenRegistry) {
        if (sequence === tower.sequence) continue;
        if (other.updatedAt < nowPerf - 120) continue;
        if (other.rank >= rank) continue;
        const dx = Math.abs(other.x - projected.x);
        const dy = Math.abs(other.y - projected.y);
        const ox = 1 - smoothstep01(remapClamped(dx, 0, screenThresholdX));
        const oy = 1 - smoothstep01(remapClamped(dy, 0, screenThresholdY));
        const overlap = ox * oy;
        if (overlap > screenOcclusion) {
          screenOcclusion = overlap;
        }
      }
    }

    const occlusionFade = isForceVisible ? 1 : 1 - MathUtils.clamp(screenOcclusion * 0.8, 0, 0.8);
    const clutterFade = MathUtils.lerp(1, 0.84, MathUtils.clamp(clutter, 0, 1));
    const lodAlpha = MathUtils.clamp(baseLodAlpha * occlusionFade * clutterFade, 0, 1);
    if (!isForceVisible && screenOcclusion > 0.3) {
      const stagger = MathUtils.lerp(
        0,
        0.24,
        smoothstep01(remapClamped(screenOcclusion, 0.3, 1)) * MathUtils.clamp(rank / TOP_COINS_UNIVERSE_LIMIT, 0.45, 1)
      );
      g.position.y += stagger;
    }

    const dimFactor = focusMode && !isHovered ? FOCUS_NON_HOVER_DIM : 1;
    const hoverBoost = isHovered ? 1.2 : 1;
    const bodyMat = bodyRef.current?.material as { opacity?: number } | undefined;
    if (bodyMat) bodyMat.opacity = MathUtils.damp(bodyMat.opacity ?? 0.72, 0.72 * dimFactor * hoverBoost * lodAlpha, 8, delta);
    const plateMat = fallbackPlateRef.current?.material as { opacity?: number } | undefined;
    if (plateMat) {
      const plateTarget = usingFallback ? 0.66 * dimFactor * lodAlpha : 0;
      plateMat.opacity = MathUtils.damp(plateMat.opacity ?? 0, plateTarget, 8, delta);
    }
    const discMat = discRef.current?.material as { opacity?: number } | undefined;
    if (discMat) discMat.opacity = MathUtils.damp(discMat.opacity ?? 0.96, 0.96 * dimFactor * hoverBoost * lodAlpha, 9, delta);
    const ringMat = ringRef.current?.material as { opacity?: number } | undefined;
    if (ringMat) ringMat.opacity = MathUtils.damp(ringMat.opacity ?? 0.34, 0.34 * dimFactor * hoverBoost * lodAlpha, 8, delta);
  });

  if (tower.mode !== 'top200') return null;

  return (
    <group ref={groupRef} position={[0, tower.height + 2.8, 0]} renderOrder={6.95}>
      <mesh ref={bodyRef} position={[0, 0, -0.016]} renderOrder={6.951}>
        <primitive attach="geometry" object={TOP_DISC_BODY_GEOMETRY} />
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
      <mesh ref={fallbackPlateRef} position={[0, 0, -0.012]} renderOrder={6.9515}>
        <primitive attach="geometry" object={TOP_DISC_FACE_GEOMETRY} />
        <meshBasicMaterial color="#06080c" transparent opacity={0} toneMapped={false} depthTest depthWrite={false} />
      </mesh>
      <mesh ref={discRef} position={[0, 0, -0.008]} renderOrder={6.952}>
        <primitive attach="geometry" object={TOP_DISC_FACE_GEOMETRY} />
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
        <primitive attach="geometry" object={TOP_DISC_RING_GEOMETRY} />
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
  preset,
  hud
}: {
  tower: TowerDatum | null;
  preset: CryptoCityPreset;
  hud: HoverHudSnapshot;
}) {
  if (!tower || !hud.visible || hud.towerSequence !== tower.sequence) return null;
  const isTopCoins = tower.mode === 'top200';
  const topTicker = getTopCoinTicker(tower.symbol, tower.baseAsset);

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
          border: `1px solid ${withAlpha(preset.theme.hudAccentRgb, 0.55)}`,
          background: 'linear-gradient(180deg, rgba(12,15,20,0.96), rgba(8,10,14,0.92))',
          boxShadow: `0 0 0 1px ${withAlpha(preset.theme.hudAccentRgb, 0.08)} inset, 0 8px 22px rgba(0,0,0,0.35)`,
          color: preset.theme.labelTextPrimary,
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
            borderLeft: `2px solid ${withAlpha(preset.theme.hudAccentRgb, 0.95)}`,
            borderTop: `2px solid ${withAlpha(preset.theme.hudAccentRgb, 0.95)}`
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
          {isTopCoins ? topTicker : fmtUsdCompact(tower.usdNotional)}
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 13,
            fontWeight: 600,
            color: preset.theme.labelTextSecondary,
            letterSpacing: '0.03em'
          }}
        >
          {isTopCoins
            ? `${fmtSignedPct(tower.priceChangePercent ?? 0)} · ${fmtUsdCompact(tower.quoteVolume24h ?? 0)}`
            : `${fmtAssetAmount(tower.btcVolume, preset.assetTicker)}`}
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 11,
            fontWeight: 600,
            color: preset.theme.labelTextMuted,
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
            color: withAlpha(preset.theme.hudAccentRgb, 0.68),
            letterSpacing: '0.04em'
          }}
        >
          {isTopCoins
            ? `rank ${tower.rank ?? '-'} · base ${fmtFixed(tower.baseW, 2)}×${fmtFixed(tower.baseD, 2)}`
            : `base ${fmtFixed(tower.baseW, 2)}×${fmtFixed(tower.baseD, 2)}`}
        </div>
        {ENABLE_DISTRICTS && !isTopCoins ? (
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              fontWeight: 600,
              color: withAlpha(preset.theme.hudAccentRgb, 0.72),
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
          background: `linear-gradient(90deg, ${withAlpha(preset.theme.hudAccentRgb, 0.65)}, ${withAlpha(
            preset.theme.hudAccentRgb,
            0.9
          )})`,
          transformOrigin: '0 50%',
          transform: `rotate(${lineAngle}rad)`,
          boxShadow: `0 0 8px ${withAlpha(preset.theme.hudAccentRgb, 0.35)}`
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
          background: preset.theme.primary,
          boxShadow: `0 0 10px ${withAlpha(preset.theme.hudAccentRgb, 0.75)}`
        }}
      />
    </div>
  );
}

function AnimatedHoloTower({
  tower,
  hoveredTowerSequence,
  selectedTowerSequence,
  discFocusAnchorX,
  discFocusAnchorZ,
  isTallest,
  onHoverTower,
  onSelectTower,
  preset,
  topFx
}: {
  tower: TowerDatum;
  hoveredTowerSequence: number | null;
  selectedTowerSequence: number | null;
  discFocusAnchorX: number;
  discFocusAnchorZ: number;
  isTallest: boolean;
  onHoverTower?: (sequence: number | null) => void;
  onSelectTower?: (sequence: number) => void;
  preset: CryptoCityPreset;
  topFx?: {
    introBootAlpha: number;
    introLifeAlpha: number;
    introProgress: number;
    introActive: boolean;
    storyBeatUntilMs: number;
    clutter: number;
    transitionLoad: number;
  };
}) {
  const groupRef = useRef<Group>(null);
  const coreRefs = useRef<Array<Mesh | null>>([]);
  const shellRefs = useRef<Array<Mesh | null>>([]);
  const edgeRefs = useRef<Array<Mesh | null>>([]);
  const crownRef = useRef<Mesh>(null);
  const topLoserHazeRef = useRef<Mesh>(null);
  const topVolumeBandRef = useRef<Mesh>(null);
  const topGainerHaloRef = useRef<Mesh>(null);
  const sparkleRef = useRef<Mesh>(null);
  const rainRefs = useRef<Array<Mesh | null>>([]);
  const bandRefs = useRef<Array<Mesh | null>>([]);
  const microBandRefs = useRef<Array<Mesh | null>>([]);
  const antennaTipRefs = useRef<Array<Mesh | null>>([]);
  const settledRef = useRef(false);
  const focusMixRef = useRef(0);
  const hoverMixRef = useRef(0);

  const glowColor = useMemo(() => new Color(tower.glowColor), [tower.glowColor]);
  const coreColor = useMemo(() => new Color(tower.coreColor), [tower.coreColor]);
  const districtAccentColor = useMemo(() => new Color(tower.districtAccentColor), [tower.districtAccentColor]);
  const presetPrimaryColor = useMemo(() => new Color(preset.theme.primary), [preset.theme.primary]);
  const presetWarmColor = useMemo(() => new Color(preset.theme.warm), [preset.theme.warm]);
  const presetPaleColor = useMemo(() => new Color(preset.theme.pale), [preset.theme.pale]);
  const strokeColor = useMemo(() => new Color(preset.theme.warm), [preset.theme.warm]);
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
    rainRefs.current.length = 3;
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
  const isSelected = selectedTowerSequence === tower.sequence;
  const focusMode = hoveredTowerSequence != null;

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    focusMixRef.current = MathUtils.damp(focusMixRef.current, focusMode ? 1 : 0, 8.5, delta);
    hoverMixRef.current = MathUtils.damp(hoverMixRef.current, isHovered ? 1 : 0, 11, delta);

    const perfNowMs = performance.now();
    const wallNowMs = Date.now();
    const now = resolveClockNowForEmittedAt(tower.emittedAt, perfNowMs, wallNowMs);
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
      tempColorA.copy(strokeColor).lerp(presetPrimaryColor, hoverMixRef.current * 0.92 + (tower.isHero ? 0.08 : 0))
    );

    const crownMat = crownRef.current?.material as { opacity?: number; color?: Color } | undefined;
    if (crownMat?.color) {
      crownMat.color.copy(
        tempColorA
          .copy(glowColor)
          .lerp(districtAccentColor, 0.14)
          .lerp(presetPrimaryColor, hoverMixRef.current * 0.72)
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
      volumeBandMat.color.copy(tempColorA.copy(presetPaleColor).lerp(presetPrimaryColor, 0.2 + hoverMixRef.current * 0.5));
    }
    if (volumeBandMat) {
      const volumeTarget =
        tower.mode === 'top200' && tower.isTopVolume
          ? 0.3 * birthGlowAlpha * focusDim * MathUtils.lerp(1, 1.1, hoverMixRef.current)
          : 0;
      volumeBandMat.opacity = MathUtils.damp(volumeBandMat.opacity ?? 0, volumeTarget, 9, delta);
    }
    const gainerHaloMat = topGainerHaloRef.current?.material as { opacity?: number; color?: Color } | undefined;
    if (gainerHaloMat?.color) {
      gainerHaloMat.color.copy(tempColorA.copy(presetPaleColor).lerp(presetPrimaryColor, 0.3 + hoverMixRef.current * 0.5));
    }
    if (gainerHaloMat) {
      const pulse = 0.72 + Math.sin(Date.now() * 0.0022 + tower.sequence * 0.12) * 0.18;
      const haloTarget =
        tower.mode === 'top200' && tower.isTopGainer
          ? 0.24 * pulse * birthGlowAlpha * focusDim * MathUtils.lerp(1, 1.1, hoverMixRef.current)
          : 0;
      gainerHaloMat.opacity = MathUtils.damp(gainerHaloMat.opacity ?? 0, haloTarget, 9, delta);
    }
    const sparkleMat = sparkleRef.current?.material as { opacity?: number; color?: Color } | undefined;
    if (sparkleMat?.color) {
      sparkleMat.color.copy(tempColorA.copy(presetWarmColor).lerp(presetPrimaryColor, hoverMixRef.current * 0.4));
    }
    if (sparkleMat) {
      const now = performance.now();
      const left = Math.max(0, (tower.sparkUntilMs ?? 0) - now);
      const t = MathUtils.clamp(left / 900, 0, 1);
      const sparkleTarget = t > 0 ? 0.42 * (0.4 + 0.6 * Math.sin(now * 0.03 + tower.sequence * 0.1)) * focusDim : 0;
      sparkleMat.opacity = MathUtils.damp(sparkleMat.opacity ?? 0, sparkleTarget, 16, delta);
      if (sparkleRef.current) {
        const s = 1 + (1 - t) * 0.65;
        sparkleRef.current.scale.set(s, s, s);
      }
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
        if (tower.isHero && !isHovered) colorTarget.lerp(presetPrimaryColor, 0.04);
        if (isHovered) colorTarget.lerp(presetPrimaryColor, 0.54 * hoverMixRef.current);
        coreMat.color.copy(colorTarget);
      }
      if (coreMat?.emissive) {
        const emissiveTarget = tempColorB.copy(coreColor).lerp(glowColor, 0.18 + tower.heightScore * 0.12);
        if (focusMode && !isHovered) emissiveTarget.multiplyScalar(0.44);
        if (isHovered) emissiveTarget.lerp(presetPrimaryColor, 0.74 * hoverMixRef.current);
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
        shellMat.color.copy(tempColorA.copy(glowColor).lerp(presetPrimaryColor, hoverMixRef.current * 0.85));
      }
      if (shellMat) {
        const shellTarget = GLOW_SHELL_OPACITY * tower.glowStrength * segBoost * birthGlowAlpha * focusDim * hoverBoost;
        shellMat.opacity = MathUtils.damp(shellMat.opacity ?? 0, MathUtils.clamp(shellTarget, 0, 1), 10, delta);
      }

      if (edgeMat?.color) {
        edgeMat.color.copy(tempColorA.copy(strokeColor).lerp(presetPrimaryColor, hoverMixRef.current * 0.95));
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
              .lerp(presetPrimaryColor, hoverMixRef.current * 0.75)
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
        mat.color.copy(
          tempColorA.copy(districtAccentColor).lerp(glowColor, 0.55).lerp(presetPrimaryColor, hoverMixRef.current * 0.3)
        );
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
        mat.color.copy(
          tempColorA.copy(presetPaleColor).lerp(presetPrimaryColor, 0.35 + hoverMixRef.current * 0.45)
        );
      }
      if (mat) {
        mat.opacity = MathUtils.damp(mat.opacity ?? 0, 0.24 * blink * focusDim, 7.5, delta);
      }
    }

    for (let i = 0; i < rainRefs.current.length; i++) {
      const rain = rainRefs.current[i];
      if (!rain) continue;
      const phase = ((Date.now() * 0.00023 + tower.sequence * 0.13 + i * 0.37) % 1 + 1) % 1;
      const sparseWindow = phase < 0.28;
      rain.visible = tower.mode === 'top200' && (tower.rank ?? 999) <= 20 && sparseWindow;
      const mat = rain.material as { opacity?: number; color?: Color } | undefined;
      const fallPhase = ((Date.now() * 0.00032 + tower.sequence * 0.043 + i * 0.31) % 1 + 1) % 1;
      rain.position.y = tower.height + 1.1 + fallPhase * 2.2;
      if (mat?.color) {
        mat.color.copy(tempColorA.copy(presetWarmColor).lerp(presetPrimaryColor, 0.28 + i * 0.06));
      }
      if (mat) {
        const rainTarget = rain.visible ? (1 - fallPhase) * 0.08 * focusDim : 0;
        mat.opacity = MathUtils.damp(mat.opacity ?? 0, rainTarget, 8, delta);
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

      {tower.mode !== 'top200'
        ? bandFractions.map((f, i) => (
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
          ))
        : null}

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

      {tower.mode === 'top200' ? (
        <TopCoinLogoDisc
          tower={tower}
          focusMode={focusMode}
          isHovered={isHovered}
          isSelected={isSelected}
          focusAnchorX={discFocusAnchorX}
          focusAnchorZ={discFocusAnchorZ}
          introLifeAlpha={topFx?.introLifeAlpha ?? 1}
          clutter={topFx?.clutter ?? 0}
          transitionLoad={topFx?.transitionLoad ?? 0}
        />
      ) : null}
      {isTallest && tower.mode !== 'top200' ? (
        <TallestCryptoDecals tower={tower} preset={preset} focusMode={focusMode} isHovered={isHovered} />
      ) : null}
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
      <mesh ref={sparkleRef} position={[0, tower.height + 0.95, 0]} renderOrder={6.76}>
        <sphereGeometry args={[0.18, 10, 10]} />
        <meshBasicMaterial
          color="#fff4cc"
          transparent
          opacity={0}
          toneMapped={false}
          depthTest
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      <mesh
        ref={topGainerHaloRef}
        position={[0, tower.height + 0.24, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        renderOrder={6.745}
        visible={tower.mode === 'top200' && Boolean(tower.isTopGainer)}
      >
        <torusGeometry args={[Math.max(0.44, Math.max(tower.baseW, tower.baseD) * 0.64), Math.max(0.026, Math.max(tower.baseW, tower.baseD) * 0.035), 12, 56]} />
        <meshBasicMaterial
          color="#ffd9a4"
          transparent
          opacity={0}
          toneMapped={false}
          depthTest
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh
          key={`${tower.sequence}-rain-${i}`}
          ref={(el) => {
            rainRefs.current[i] = el;
          }}
          position={[((i - 1) * Math.max(0.2, tower.baseW * 0.14)), tower.height + 1.2 + i * 0.2, 0]}
          renderOrder={6.09}
          visible={false}
        >
          <boxGeometry args={[0.03, 0.45, 0.03]} />
          <meshBasicMaterial
            color="#ffe3bd"
            transparent
            opacity={0}
            toneMapped={false}
            depthWrite={false}
            depthTest
            blending={AdditiveBlending}
          />
        </mesh>
      ))}

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
  preset,
  focusMode = false,
  marketPulse = 0,
  introBootAlpha = 1
}: {
  bounds: SandboxBounds;
  preset: CryptoCityPreset;
  focusMode?: boolean;
  marketPulse?: number;
  introBootAlpha?: number;
}) {
  const boardSize = MathUtils.clamp(Math.max(420, bounds.radius * 8 + 180), 420, 1400);
  const targetGlowRadius = clampFinite(Math.max(30, bounds.radius * RADIAL_GLOW_RADIUS_MULT), 64, 30, boardSize * 0.48);
  const arteryLen = Math.min(boardSize * 0.92, Math.max(140, bounds.radius * 3.6));
  const groundGraphicY = GROUND_GRAPHIC_Y;
  const lineExtent = MathUtils.clamp(Math.max(200, bounds.radius * 4.2), 200, boardSize * 0.94);
  const gridStep = MathUtils.clamp(Math.round(Math.max(10, bounds.radius * 0.16)), 10, 20);
  const windRoseRadius = MathUtils.clamp(Math.max(68, bounds.radius * 2.35), 68, lineExtent * 0.62);
  const glowMeshRef = useRef<Mesh>(null);
  const slabRef = useRef<Mesh>(null);
  const deckRef = useRef<Mesh>(null);
  const graphicsGroupRef = useRef<Group>(null);
  const smoothGlowRadiusRef = useRef(targetGlowRadius);
  const introScaleRef = useRef(1);
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
      uCenterColor: { value: new Color(preset.theme.groundGlowCenter) },
      uRingColor: { value: new Color(preset.theme.groundGlowRingHot) },
      uOpacity: { value: 1.02 }
    }),
    [preset.theme.groundGlowCenter, preset.theme.groundGlowRingHot]
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
    const introBoot = MathUtils.clamp(introBootAlpha, 0, 1);
    const introScaleTarget = MathUtils.lerp(BTC_GROUND_BOOT_START_SCALE, 1, easeOutCubic(introBoot));
    introScaleRef.current = MathUtils.damp(introScaleRef.current, introScaleTarget, 9, delta);
    if (graphicsGroupRef.current) {
      graphicsGroupRef.current.scale.set(introScaleRef.current, 1, introScaleRef.current);
    }

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
      glowMeshRef.current.scale.set(r * 2.2 * introScaleRef.current, r * 2.2 * introScaleRef.current, 1);
      glowUniforms.uOpacity.value =
        MathUtils.lerp(1.08, 0.8, focusMixRef.current) *
        MathUtils.lerp(1 - MARKET_PULSE_GROUND_OPACITY_BREATH, 1 + MARKET_PULSE_GROUND_OPACITY_BREATH, mood) *
        introBoot;
    }
    const slabMat = slabRef.current?.material as { opacity?: number } | undefined;
    if (slabMat) slabMat.opacity = MathUtils.damp(slabMat.opacity ?? 1, MathUtils.lerp(0.2, 1, introBoot), 7, delta);
    const deckMat = deckRef.current?.material as { opacity?: number; emissiveIntensity?: number } | undefined;
    if (deckMat) {
      deckMat.opacity = MathUtils.damp(deckMat.opacity ?? 1, introBoot, 7, delta);
      if (typeof deckMat.emissiveIntensity === 'number') {
        deckMat.emissiveIntensity = MathUtils.damp(deckMat.emissiveIntensity, 0.05 * introBoot, 7, delta);
      }
    }
    glowUniforms.uCenterColor.value.copy(
      tempColorA.set(preset.theme.groundGlowCenter).lerp(tempColorB.set(preset.theme.groundGlowCenterHot), mood * 0.35)
    );
    glowUniforms.uRingColor.value.copy(
      tempColorA.set(preset.theme.groundGlowRing).lerp(tempColorB.set(preset.theme.groundGlowRingHot), 0.55 + mood * 0.3)
    );
  });

  const focusStaticScale = focusMode ? FOCUS_GROUND_DIM : 1;
  const intro = MathUtils.clamp(introBootAlpha, 0, 1);

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

      <mesh ref={slabRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_SLAB_Y, 0]} receiveShadow renderOrder={0}>
        <planeGeometry args={[boardSize, boardSize]} />
        <meshStandardMaterial
          color="#05070b"
          roughness={0.97}
          metalness={0.04}
          transparent
          opacity={MathUtils.lerp(0.2, 1, intro)}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>

      <mesh ref={deckRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_DECK_Y, 0]} renderOrder={0}>
        <planeGeometry args={[boardSize * 0.99, boardSize * 0.99]} />
        <meshStandardMaterial
          color="#080c11"
          roughness={0.9}
          metalness={0.08}
          emissive="#10161f"
          emissiveIntensity={0.05 * intro}
          transparent
          opacity={intro}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>

      <group ref={graphicsGroupRef}>
        {gridLinePairs.map((points, i) => (
          <ScreenSpaceGroundLine
            key={`grid-${i}`}
            points={points}
            y={groundGraphicY + 0.0005}
            color={i % 2 === 0 ? preset.theme.groundGridMajor : preset.theme.groundGridMinor}
            opacity={(i % 4 === 0 ? 0.085 : 0.05) * intro}
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
            color={preset.theme.groundWindDiag}
            opacity={0.24 * intro}
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
            color={i % 2 === 0 ? preset.theme.groundWindAxisPrimary : preset.theme.groundWindAxisSecondary}
            opacity={(i % 2 === 0 ? 0.33 : 0.3) * intro}
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
            color={preset.theme.groundWindCross}
            opacity={0.2 * intro}
            lineWidth={2.4}
            renderOrder={2.12}
            focusMode={focusMode}
            focusDim={FOCUS_GROUND_DIM}
          />
        ))}
        <ScreenSpaceGroundLine
          points={outerRingPoints}
          y={groundGraphicY + 0.0011}
          color={preset.theme.groundWindAxisSecondary}
          opacity={0.24 * intro}
          lineWidth={3.0}
          renderOrder={2.16}
          additive
          focusMode={focusMode}
          focusDim={FOCUS_GROUND_DIM}
        />
        <ScreenSpaceGroundLine
          points={innerRingPoints}
          y={groundGraphicY + 0.00115}
          color={preset.theme.groundArterySecondary}
          opacity={0.14 * intro}
          lineWidth={2.0}
          renderOrder={2.14}
          focusMode={focusMode}
          focusDim={FOCUS_GROUND_DIM}
        />

        <mesh position={[0, groundGraphicY + 0.002, 0]} renderOrder={3}>
          <boxGeometry args={[0.18, 0.01, arteryLen]} />
          <meshBasicMaterial
            color={preset.theme.groundArteryPrimary}
            transparent
            opacity={0.34 * focusStaticScale * intro}
            toneMapped={false}
            depthWrite={false}
            depthTest
          />
        </mesh>
        <mesh position={[0, groundGraphicY + 0.0025, 0]} renderOrder={3}>
          <boxGeometry args={[arteryLen * 0.72, 0.01, 0.16]} />
          <meshBasicMaterial
            color={preset.theme.groundArterySecondary}
            transparent
            opacity={0.18 * focusStaticScale * intro}
            toneMapped={false}
            depthWrite={false}
            depthTest
          />
        </mesh>
        <mesh rotation={[0, Math.PI / 4, 0]} position={[0, groundGraphicY + 0.003, 0]} renderOrder={3}>
          <boxGeometry args={[0.12, 0.008, arteryLen * 0.8]} />
          <meshBasicMaterial
            color={preset.theme.groundArteryPrimary}
            transparent
            opacity={0.2 * focusStaticScale * intro}
            toneMapped={false}
            depthWrite={false}
            depthTest
          />
        </mesh>
        <mesh rotation={[0, -Math.PI / 4, 0]} position={[0, groundGraphicY + 0.003, 0]} renderOrder={3}>
          <boxGeometry args={[0.12, 0.008, arteryLen * 0.62]} />
          <meshBasicMaterial
            color={preset.theme.groundArteryTertiary}
            transparent
            opacity={0.15 * focusStaticScale * intro}
            toneMapped={false}
            depthWrite={false}
            depthTest
          />
        </mesh>
      </group>
    </group>
  );
}

function ParksLayer({
  parks,
  trees,
  preset,
  focusMode = false,
  showFireflies = true
}: {
  parks: ParkDatum[];
  trees: ParkTreeDatum[];
  preset: CryptoCityPreset;
  focusMode?: boolean;
  showFireflies?: boolean;
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
    if (!trunk || !crown || !trunkWire || !crownWire || !crownGlow) return;

    const count = Math.min(trees.length, Math.max(1, trunk.instanceMatrix.count));
    trunk.count = count;
    crown.count = count;
    trunkWire.count = count;
    crownWire.count = count;
    crownGlow.count = count;
    if (firefly) {
      firefly.count = showFireflies
        ? Math.max(1, Math.min(fireflySources.length, Math.max(1, firefly.instanceMatrix.count)))
        : 0;
    }
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
      crown.setColorAt(
        i,
        crownColor
          .set(preset.theme.warm)
          .lerp(new Color(preset.theme.treeGlowLow), 0.18 + tree.tintMix * 0.24)
      );
      scl.set(tree.crownR * 1.06, tree.crownH * 1.03, tree.crownR * 1.06);
      matrix.compose(pos, quat, scl);
      crownWire.setMatrixAt(i, matrix);
      scl.set(tree.crownR * 1.22, tree.crownH * 1.18, tree.crownR * 1.22);
      matrix.compose(pos, quat, scl);
      crownGlow.setMatrixAt(i, matrix);
      crownGlow.setColorAt(
        i,
        crownColor
          .set(preset.theme.treeGlowLow)
          .lerp(new Color(preset.theme.treeGlowHigh), 0.25 + tree.tintMix * 0.35)
      );

      if (showFireflies && firefly && i < firefly.count) {
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
    if (firefly) firefly.instanceMatrix.needsUpdate = true;
    if (trunk.instanceColor) trunk.instanceColor.needsUpdate = true;
    if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
    if (crownGlow.instanceColor) crownGlow.instanceColor.needsUpdate = true;
    if (firefly?.instanceColor) firefly.instanceColor.needsUpdate = true;
  }, [
    fireflySources.length,
    preset.theme.treeGlowHigh,
    preset.theme.treeGlowLow,
    preset.theme.warm,
    showFireflies,
    trees.length
  ]);

  useFrame((_, delta) => {
    focusMixRef.current = MathUtils.damp(focusMixRef.current, focusMode ? 1 : 0, 7.5, delta);
    const dimScale = MathUtils.lerp(1, FOCUS_GROUND_DIM, focusMixRef.current);
    const perfNowMs = performance.now();
    const wallNowMs = Date.now();
    for (let i = 0; i < patchRefs.current.length; i++) {
      const patch = patchRefs.current[i];
      const pathA = pathRefs.current[i * 2];
      const pathB = pathRefs.current[i * 2 + 1];
      const patchMat = patch?.material as { opacity?: number } | undefined;
      const pathAMat = pathA?.material as { opacity?: number } | undefined;
      const pathBMat = pathB?.material as { opacity?: number } | undefined;
      const park = parks[i];
      const parkNowMs = park ? resolveClockNowForEmittedAt(park.emittedAt, perfNowMs, wallNowMs) : perfNowMs;
      const parkElapsed = park ? parkNowMs - park.emittedAt : BIRTH_RISE_MS + BIRTH_GLOW_RAMP_MS;
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
        const birthAt = birth?.emittedAt ?? perfNowMs;
        const treeNowMs = resolveClockNowForEmittedAt(birthAt, perfNowMs, wallNowMs);
        const localDelay = (birth?.localIndex ?? 0) * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 18 : 28);
        const elapsed = treeNowMs - (birthAt + localDelay);
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
      if (crownMat.color) {
        crownMat.color.copy(tempColorA.set(preset.theme.warm).lerp(tempColorB.set(preset.theme.treeGlowLow), focusMixRef.current * 0.35));
      }
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
      const targetOpacity = showFireflies ? base * dimScale : 0;
      fireflyMat.opacity = MathUtils.damp(fireflyMat.opacity ?? base, targetOpacity, 8.5, delta);
    }

    const firefly = fireflyRef.current;
    if (showFireflies && firefly && fireflySources.length > 0) {
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
        const birthAt = birth?.emittedAt ?? perfNowMs;
        const fireflyNowMs = resolveClockNowForEmittedAt(birthAt, perfNowMs, wallNowMs);
        const localDelay = (birth?.localIndex ?? 0) * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 18 : 28);
        const fireflyElapsed = fireflyNowMs - (birthAt + localDelay + BIRTH_GLOW_DELAY_MS);
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
    } else if (firefly) {
      firefly.count = 0;
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
                      color={preset.theme.primary}
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
                      color={preset.theme.primary}
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
                    color={preset.theme.groundArterySecondary}
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
                    color={preset.theme.primary}
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
      {showFireflies ? (
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
      ) : null}
    </group>
  );
}

function TraceStrips({
  traces,
  focusMode = false,
  marketPulse = 0,
  arterial = false,
  introLifeAlpha = 1,
  clutter = 0
}: {
  traces: TraceDatum[];
  focusMode?: boolean;
  marketPulse?: number;
  arterial?: boolean;
  introLifeAlpha?: number;
  clutter?: number;
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
    const clutterFade = MathUtils.lerp(1, 0.86, MathUtils.clamp(clutter, 0, 1));
    const introAlpha = MathUtils.clamp(introLifeAlpha, 0, 1);
    const finalGlowOpacity = glowOpacity * clutterFade * introAlpha;
    const finalCoreOpacity = coreOpacity * clutterFade * introAlpha;
    const perfNowMs = performance.now();
    const wallNowMs = Date.now();
    for (let i = 0; i < traces.length; i++) {
      const trace = traces[i];
      const birthAt = trace?.emittedAt;
      const traceNowMs = birthAt != null ? resolveClockNowForEmittedAt(birthAt, perfNowMs, wallNowMs) : perfNowMs;
      const birthElapsed = birthAt != null ? traceNowMs - birthAt : TRACE_BIRTH_FADE_MS;
      const birthAlpha = easeOutCubic(MathUtils.clamp(birthElapsed / TRACE_BIRTH_FADE_MS, 0, 1));
      const glow = glowRefs.current[i];
      const core = coreRefs.current[i];
      const scan = scanRefs.current[i];
      if (glow) {
        glow.scale.set(glowWidthScale, 1, 1);
        const mat = glow.material as { opacity?: number } | undefined;
        if (mat) mat.opacity = finalGlowOpacity * birthAlpha;
      }
      if (core) {
        core.scale.set(coreWidthScale, 1, 1);
        const mat = core.material as { opacity?: number } | undefined;
        if (mat) mat.opacity = finalCoreOpacity * birthAlpha;
      }
      if (scan && arterial) {
        if (!trace) continue;
        const scanT = (clock.getElapsedTime() * 0.08 + (trace.scanSeed ?? 0)) % 1;
        const z = MathUtils.lerp(-trace.length * 0.42, trace.length * 0.42, scanT);
        scan.position.z = z;
        const mat = scan.material as { opacity?: number } | undefined;
        if (mat) {
          const envelope = 0.35 + 0.65 * Math.sin(scanT * Math.PI);
          mat.opacity = MathUtils.clamp(0.07 * envelope * dimScale * clutterFade * introAlpha * birthAlpha, 0, 0.12);
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
              opacity={0}
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
              opacity={0}
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
                opacity={0}
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
  focusMode = false,
  introLifeAlpha = 1,
  clutter = 0
}: {
  particles: TrafficParticleDatum[];
  focusMode?: boolean;
  introLifeAlpha?: number;
  clutter?: number;
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
    body.count = 0;
    cabin.count = 0;
    bodyWire.count = 0;
    cabinWire.count = 0;
    light.count = 0;
    glow.count = 0;
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
    const introGate = MathUtils.clamp(introLifeAlpha, 0, 1) > 0.01;
    const perfNowMs = performance.now();
    const wallNowMs = Date.now();
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
    const srcCount = introGate ? Math.min(particles.length, capacity) : 0;
    const matrix = tempMatrixRef.current;
    const pos = tempPosRef.current;
    const pos2 = tempPos2Ref.current;
    const pos3 = tempPos3Ref.current;
    const pos4 = tempPos4Ref.current;
    const scl = tempScaleRef.current;
    const quat = trafficQuatRef.current;
    const up = trafficUpRef.current;
    const localOffset = tempOffsetRef.current;
    let visibleCount = 0;
    for (let src = 0; src < srcCount; src++) {
      const p = particles[src];
      if (!p) continue;
      const birthAt = p.emittedAt;
      const particleNowMs = birthAt != null ? resolveClockNowForEmittedAt(birthAt, perfNowMs, wallNowMs) : perfNowMs;
      const birthElapsed = birthAt != null ? particleNowMs - birthAt : TRAFFIC_BIRTH_FADE_MS;
      if (birthElapsed <= 0) continue;
      const birthAlpha = easeOutCubic(MathUtils.clamp(birthElapsed / TRAFFIC_BIRTH_FADE_MS, 0, 1));
      const birthScale = MathUtils.lerp(0.56, 1, birthAlpha);
      const i = visibleCount;
      visibleCount += 1;
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
      const bodyH = Math.max(0.034, p.sizeY * 1.34) * MathUtils.lerp(1, 1.07, visCurve) * birthScale;
      const bodyLen = Math.max(0.26, p.sizeZ * 1.05) * MathUtils.lerp(1.0, 1.35, visCurve) * birthScale;
      const bodyW = Math.max(0.060, p.sizeX * 0.44) * MathUtils.lerp(1.0, 1.05, visCurve) * birthScale;
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
      if (DEBUG_FORCE_TRAFFIC_VIS) {
        light.setColorAt(i, tempColorRef.current.set('#ff3cf0'));
      } else {
        light.setColorAt(i, tempColorRef.current.set('#fffdf0').multiplyScalar(MathUtils.lerp(0.28, 1, birthAlpha)));
      }

      // Soft glow shell around the body for visibility (like the old bright cards), but subtle.
      pos4.copy(pos);
      const glowH = bodyH * MathUtils.lerp(2.1, 3.0, visCurve);
      const glowW = bodyW * MathUtils.lerp(2.2, 3.2, visCurve);
      const glowLen = bodyLen * MathUtils.lerp(2.0, 3.0, visCurve);
      scl.set(glowW, glowH, glowLen);
      matrix.compose(pos4, quat, scl);
      glow.setMatrixAt(i, matrix);
      if (DEBUG_FORCE_TRAFFIC_VIS) {
        glow.setColorAt(i, tempColorRef.current.set('#ff3cf0'));
      } else {
        glow.setColorAt(i, tempColorRef.current.set('#fff2cf').multiplyScalar(MathUtils.lerp(0.24, 1, birthAlpha)));
      }
    }
    body.count = visibleCount;
    cabin.count = visibleCount;
    bodyWire.count = visibleCount;
    cabinWire.count = visibleCount;
    light.count = visibleCount;
    glow.count = visibleCount;
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
    const introAlpha = MathUtils.clamp(introLifeAlpha, 0, 1);
    const clutterFade = MathUtils.lerp(1, 0.88, MathUtils.clamp(clutter, 0, 1));
    const bodyMat = body.material as { color?: Color } | undefined;
    if (bodyMat?.color && !DEBUG_FORCE_TRAFFIC_VIS) {
      bodyMat.color.copy(tempColorA.set('#f4fbff').lerp(tempColorB.set('#43505c'), focusMixRef.current));
    }
    const cabinMat = cabin.material as { color?: Color } | undefined;
    if (cabinMat?.color && !DEBUG_FORCE_TRAFFIC_VIS) {
      cabinMat.color.copy(tempColorA.set('#ffffff').lerp(tempColorB.set('#48525e'), focusMixRef.current * 0.95));
    }
    const bodyWireMat = bodyWire.material as { opacity?: number } | undefined;
    if (bodyWireMat) bodyWireMat.opacity = DEBUG_FORCE_TRAFFIC_VIS ? 0.98 : 0.98 * dimScale * introAlpha * clutterFade;
    const cabinWireMat = cabinWire.material as { opacity?: number } | undefined;
    if (cabinWireMat) cabinWireMat.opacity = DEBUG_FORCE_TRAFFIC_VIS ? 0.96 : 0.96 * dimScale * introAlpha * clutterFade;
    const glowMat = glow.material as { opacity?: number } | undefined;
    if (glowMat) glowMat.opacity = DEBUG_FORCE_TRAFFIC_VIS ? 1 : MathUtils.lerp(0.92, 1.0, visCurve) * dimScale * introAlpha * clutterFade;
    const lightMat = light.material as { opacity?: number } | undefined;
    if (lightMat) {
      lightMat.opacity = DEBUG_FORCE_TRAFFIC_VIS
        ? 1
        : MathUtils.lerp(0.95, 1, visCurve) * Math.max(0.35, dimScale) * introAlpha * clutterFade;
    }
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

type MountainUnit = {
  angle: number;
  radialJitter: number;
  yawJitter: number;
  hT: number;
  wT: number;
  dT: number;
  shoulderDirT: number;
  shoulderScaleT: number;
  shoulderSpreadT: number;
};

function buildMountainUnits(seedOffset: number, count: number) {
  const units: MountainUnit[] = [];
  for (let i = 0; i < count; i++) {
    units.push({
      angle: ((i + 0.5) / count) * Math.PI * 2 + MathUtils.lerp(-0.11, 0.11, hash01(BTC_MOUNTAIN_SEED, seedOffset, i, 11)),
      radialJitter: MathUtils.lerp(-0.09, 0.09, hash01(BTC_MOUNTAIN_SEED, seedOffset, i, 17)),
      yawJitter: MathUtils.lerp(-0.3, 0.3, hash01(BTC_MOUNTAIN_SEED, seedOffset, i, 19)),
      hT: hash01(BTC_MOUNTAIN_SEED, seedOffset, i, 23),
      wT: hash01(BTC_MOUNTAIN_SEED, seedOffset, i, 29),
      dT: hash01(BTC_MOUNTAIN_SEED, seedOffset, i, 31),
      shoulderDirT: hash01(BTC_MOUNTAIN_SEED, seedOffset, i, 37),
      shoulderScaleT: hash01(BTC_MOUNTAIN_SEED, seedOffset, i, 41),
      shoulderSpreadT: hash01(BTC_MOUNTAIN_SEED, seedOffset, i, 43)
    });
  }
  return units;
}

function buildFacetMountainGeometry(kind: 'core' | 'shoulder') {
  const xCount = kind === 'core' ? 10 : 8;
  const zCount = kind === 'core' ? 6 : 5;
  const xSpan = kind === 'core' ? 2.75 : 3.15;
  const zSpan = kind === 'core' ? 1.75 : 1.95;
  const heightGain = kind === 'core' ? 1 : 0.62;
  const footprintGrow = kind === 'core' ? 1.2 : 1.28;
  const topVerts: Array<[number, number, number]> = [];
  const positions: number[] = [];

  const vertexAt = (xi: number, zi: number) => topVerts[zi * xCount + xi];
  const pushTri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };

  for (let zi = 0; zi < zCount; zi++) {
    const zn = zCount <= 1 ? 0 : zi / (zCount - 1);
    const z = MathUtils.lerp(-zSpan, zSpan, zn);
    for (let xi = 0; xi < xCount; xi++) {
      const xn = xCount <= 1 ? 0 : xi / (xCount - 1);
      const x = MathUtils.lerp(-xSpan, xSpan, xn);
      const edgeFadeX = Math.pow(Math.sin(xn * Math.PI), 0.64);
      const edgeFadeZ = Math.pow(Math.sin(zn * Math.PI), 0.82);
      const peakLeft = 1.2 * Math.exp(-((x + xSpan * 0.58) ** 2) / 1.4 - ((z + 0.24) ** 2) / 2.2);
      const peakMid = 1.82 * Math.exp(-((x - 0.18) ** 2) / 0.92 - ((z - 0.08) ** 2) / 1.16);
      const peakRight = 1.34 * Math.exp(-((x - xSpan * 0.54) ** 2) / 1.18 - ((z + 0.28) ** 2) / 1.86);
      const spine = 0.46 * Math.exp(-(z * z) / 3.4) * (0.84 + 0.16 * Math.cos((x + 0.45) * 1.5));
      const shoulderLeft = 0.42 * Math.exp(-((x + xSpan * 0.92) ** 2) / 2.8 - ((z - 0.34) ** 2) / 4.8);
      const shoulderRight = 0.38 * Math.exp(-((x - xSpan * 0.94) ** 2) / 2.4 - ((z + 0.18) ** 2) / 4.1);
      const saddleCut = 0.24 * Math.exp(-((x + 0.82) ** 2) / 0.52 - ((z + 0.02) ** 2) / 0.78);
      const frontBreak = 0.15 * Math.exp(-((x - 0.92) ** 2) / 0.44 - ((z - 0.72) ** 2) / 0.36);
      const terrace = Math.sin((x * 1.12 - z * 0.72) * Math.PI) * 0.06 * (0.35 + edgeFadeZ * 0.65);
      const warpX = x + Math.sin(z * 1.45) * 0.12 + Math.sin(x * 0.8 + z * 0.55) * 0.06;
      const warpZ = z + Math.sin(x * 0.72) * 0.14 - Math.cos(z * 1.22) * 0.05;
      const h = Math.max(
        0,
        (peakLeft + peakMid + peakRight + spine + shoulderLeft + shoulderRight - saddleCut - frontBreak + terrace) *
          heightGain *
          (0.58 + edgeFadeX * 0.42) *
          (0.62 + edgeFadeZ * 0.38)
      );
      topVerts.push([warpX, h, warpZ]);
    }
  }

  for (let zi = 0; zi < zCount - 1; zi++) {
    for (let xi = 0; xi < xCount - 1; xi++) {
      const a = vertexAt(xi, zi);
      const b = vertexAt(xi + 1, zi);
      const c = vertexAt(xi + 1, zi + 1);
      const d = vertexAt(xi, zi + 1);
      pushTri(a, b, c);
      pushTri(a, c, d);
    }
  }

  const perimeter: Array<[number, number]> = [];
  for (let xi = 0; xi < xCount; xi++) perimeter.push([xi, 0]);
  for (let zi = 1; zi < zCount; zi++) perimeter.push([xCount - 1, zi]);
  for (let xi = xCount - 2; xi >= 0; xi--) perimeter.push([xi, zCount - 1]);
  for (let zi = zCount - 2; zi > 0; zi--) perimeter.push([0, zi]);

  const skirtVerts = perimeter.map(([xi, zi]) => {
    const top = vertexAt(xi, zi);
    const outwardX = top[0] * footprintGrow;
    const outwardZ = top[2] * footprintGrow;
    return [outwardX, 0, outwardZ] as [number, number, number];
  });
  const bottomCenter: [number, number, number] = [0, 0, 0];

  for (let i = 0; i < perimeter.length; i++) {
    const j = (i + 1) % perimeter.length;
    const topA = vertexAt(perimeter[i][0], perimeter[i][1]);
    const topB = vertexAt(perimeter[j][0], perimeter[j][1]);
    const skirtA = skirtVerts[i];
    const skirtB = skirtVerts[j];
    pushTri(topA, topB, skirtB);
    pushTri(topA, skirtB, skirtA);
    pushTri(skirtA, skirtB, bottomCenter);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  if (bb) geometry.translate(0, -bb.min.y, 0);
  return geometry;
}

function MountainsBackdrop({
  cityRadius,
  cityScaleMetric,
  preset,
  introBootAlpha
}: {
  cityRadius: number;
  cityScaleMetric: number;
  preset: CryptoCityPreset;
  introBootAlpha: number;
}) {
  const farCoreRef = useRef<ThreeInstancedMesh>(null);
  const farShoulderRef = useRef<ThreeInstancedMesh>(null);
  const farFoothillRef = useRef<ThreeInstancedMesh>(null);
  const midCoreRef = useRef<ThreeInstancedMesh>(null);
  const midShoulderRef = useRef<ThreeInstancedMesh>(null);
  const midFoothillRef = useRef<ThreeInstancedMesh>(null);
  const peakCoreRef = useRef<ThreeInstancedMesh>(null);
  const peakShoulderRef = useRef<ThreeInstancedMesh>(null);
  const peakFoothillRef = useRef<ThreeInstancedMesh>(null);
  const farGroupRef = useRef<Group>(null);
  const midGroupRef = useRef<Group>(null);
  const peakGroupRef = useRef<Group>(null);
  const cityRadiusRef = useRef(cityRadius);
  const cityScaleMetricRef = useRef(cityScaleMetric);
  const introBootAlphaRef = useRef(introBootAlpha);
  const targetRingRef = useRef(
    MathUtils.clamp(
      Math.max(cityRadius * BTC_MOUNTAIN_RING_MULT, BTC_MOUNTAIN_RING_MIN),
      BTC_MOUNTAIN_RING_MIN,
      BTC_MOUNTAIN_RING_MAX
    )
  );
  const targetScaleRef = useRef(MathUtils.clamp(cityScaleMetric * 1.1 + cityRadius * 0.11, 46, 86));
  const smoothRingRef = useRef(targetRingRef.current);
  const smoothScaleRef = useRef(targetScaleRef.current);
  const revealTimeRef = useRef(0);
  const revealMixRef = useRef(0);
  const mountElapsedRef = useRef(0);
  const matrixRef = useRef(new Matrix4());
  const quatRef = useRef(new Quaternion());
  const posRef = useRef(new Vector3());
  const scaleRef = useRef(new Vector3());
  const upRef = useRef(new Vector3(0, 1, 0));

  const coreGeometry = useMemo(() => buildFacetMountainGeometry('core'), []);
  const shoulderGeometry = useMemo(() => buildFacetMountainGeometry('shoulder'), []);
  useEffect(
    () => () => {
      coreGeometry.dispose();
      shoulderGeometry.dispose();
    },
    [coreGeometry, shoulderGeometry]
  );

  const farUnits = useMemo(() => buildMountainUnits(101, BTC_MOUNTAIN_LAYER_FAR_COUNT), []);
  const midUnits = useMemo(() => buildMountainUnits(211, BTC_MOUNTAIN_LAYER_MID_COUNT), []);
  const peakUnits = useMemo(() => buildMountainUnits(307, BTC_MOUNTAIN_LAYER_PEAK_COUNT), []);

  useEffect(() => {
    cityRadiusRef.current = cityRadius;
    cityScaleMetricRef.current = cityScaleMetric;
  }, [cityRadius, cityScaleMetric]);

  useEffect(() => {
    introBootAlphaRef.current = introBootAlpha;
  }, [introBootAlpha]);

  useEffect(() => {
    const updateTargets = () => {
      const nextRing = MathUtils.clamp(
        Math.max(cityRadiusRef.current * BTC_MOUNTAIN_RING_MULT, BTC_MOUNTAIN_RING_MIN),
        BTC_MOUNTAIN_RING_MIN,
        BTC_MOUNTAIN_RING_MAX
      );
      const scaleFromRadius = cityRadiusRef.current * 0.16;
      const scaleFromHeights = cityScaleMetricRef.current * 1.1;
      targetRingRef.current = nextRing;
      targetScaleRef.current = MathUtils.clamp(scaleFromRadius + scaleFromHeights, 46, 86);
    };
    updateTargets();
    const timer = window.setInterval(updateTargets, BTC_MOUNTAIN_METRIC_UPDATE_MS);
    return () => window.clearInterval(timer);
  }, []);

  const applyCoreLayer = (
    mesh: ThreeInstancedMesh | null,
    units: MountainUnit[],
    ring: number,
    layerScale: number,
    yBase: number,
    sxMult: number,
    szMult: number
  ) => {
    if (!mesh) return;
    const matrix = matrixRef.current;
    const quat = quatRef.current;
    const pos = posRef.current;
    const scale = scaleRef.current;
    const up = upRef.current;
    const count = Math.min(units.length, mesh.instanceMatrix.count);
    for (let i = 0; i < count; i++) {
      const unit = units[i];
      const radial = ring * (1 + unit.radialJitter);
      const x = Math.sin(unit.angle) * radial;
      const z = Math.cos(unit.angle) * radial;
      const yaw = unit.angle + Math.PI + unit.yawJitter;
      const h = layerScale * MathUtils.lerp(0.56, 1.12, unit.hT);
      const sx = h * MathUtils.lerp(0.82, 1.62, unit.wT) * sxMult;
      const sz = h * MathUtils.lerp(0.8, 1.58, unit.dT) * szMult;
      quat.setFromAxisAngle(up, yaw);
      pos.set(x, yBase, z);
      scale.set(sx, h, sz);
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  };

  const applyShoulderLayer = (
    mesh: ThreeInstancedMesh | null,
    units: MountainUnit[],
    ring: number,
    layerScale: number,
    yBase: number
  ) => {
    if (!mesh) return;
    const matrix = matrixRef.current;
    const quat = quatRef.current;
    const pos = posRef.current;
    const scale = scaleRef.current;
    const up = upRef.current;
    const count = Math.min(units.length, mesh.instanceMatrix.count);
    for (let i = 0; i < count; i++) {
      const unit = units[i];
      const radial = ring * (1 + unit.radialJitter * 0.86);
      const x = Math.sin(unit.angle) * radial;
      const z = Math.cos(unit.angle) * radial;
      const coreYaw = unit.angle + Math.PI + unit.yawJitter;
      const sideYaw = coreYaw + MathUtils.lerp(-1.05, 1.05, unit.shoulderDirT);
      const hBase = layerScale * MathUtils.lerp(0.44, 0.9, unit.hT);
      const h = hBase * MathUtils.lerp(0.24, 0.42, unit.shoulderScaleT);
      const offset = hBase * MathUtils.lerp(0.52, 1.04, unit.shoulderSpreadT);
      const sx = hBase * MathUtils.lerp(1.72, 3.8, unit.wT) * MathUtils.lerp(1.0, 1.18, unit.shoulderScaleT);
      const sz = hBase * MathUtils.lerp(1.68, 3.6, unit.dT) * MathUtils.lerp(1.0, 1.16, 1 - unit.shoulderScaleT);
      quat.setFromAxisAngle(up, sideYaw);
      pos.set(
        x + Math.sin(sideYaw + Math.PI * 0.5) * offset,
        yBase - hBase * MathUtils.lerp(0.18, 0.32, unit.shoulderScaleT) - h * MathUtils.lerp(0.06, 0.14, unit.shoulderScaleT),
        z + Math.cos(sideYaw + Math.PI * 0.5) * offset
      );
      scale.set(sx, h, sz);
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  };

  const applyFoothillLayer = (
    mesh: ThreeInstancedMesh | null,
    units: MountainUnit[],
    ring: number,
    layerScale: number,
    yBase: number
  ) => {
    if (!mesh) return;
    const matrix = matrixRef.current;
    const quat = quatRef.current;
    const pos = posRef.current;
    const scale = scaleRef.current;
    const up = upRef.current;
    const count = Math.min(units.length, mesh.instanceMatrix.count);
    for (let i = 0; i < count; i++) {
      const unit = units[i];
      const radial = ring * (1 + unit.radialJitter * 0.96);
      const x = Math.sin(unit.angle) * radial;
      const z = Math.cos(unit.angle) * radial;
      const yaw = unit.angle + Math.PI + unit.yawJitter * 0.42;
      const hBase = layerScale * MathUtils.lerp(0.3, 0.58, unit.hT);
      const h = hBase * MathUtils.lerp(0.2, 0.36, unit.shoulderScaleT);
      const spread = hBase * MathUtils.lerp(0.7, 1.3, unit.shoulderSpreadT);
      const sx = hBase * MathUtils.lerp(2.6, 5.8, unit.wT);
      const sz = hBase * MathUtils.lerp(2.5, 5.6, unit.dT);
      quat.setFromAxisAngle(up, yaw);
      pos.set(
        x + Math.sin(yaw + Math.PI * 0.5) * spread * 0.32,
        yBase - hBase * MathUtils.lerp(0.42, 0.72, unit.shoulderScaleT),
        z + Math.cos(yaw + Math.PI * 0.5) * spread * 0.32
      );
      scale.set(sx, h, sz);
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  };

  const applyRevealToGroup = (group: Group | null, reveal: number, drop: number, swell = 1.04) => {
    if (!group) return;
    const eased = easeOutCubic(reveal);
    group.visible = reveal > 0.001;
    group.position.y = -drop * (1 - eased);
    const sxz = MathUtils.lerp(swell, 1, eased);
    const sy = MathUtils.lerp(0.72, 1, eased);
    group.scale.set(sxz, sy, sxz);
  };

  useFrame((_, delta) => {
    mountElapsedRef.current += delta;
    smoothRingRef.current = MathUtils.damp(smoothRingRef.current, targetRingRef.current, 0.92, delta);
    smoothScaleRef.current = MathUtils.damp(smoothScaleRef.current, targetScaleRef.current, 0.95, delta);

    const introGate = smoothstep01(remapClamped(introBootAlphaRef.current, 0.82, 0.995));
    if (introGate > 0.001) {
      revealTimeRef.current += delta * MathUtils.lerp(0.45, 1, introGate);
    } else {
      revealTimeRef.current = 0;
    }

    const revealDur = RUNTIME_QUALITY_CONFIG.reducedMotion ? BTC_MOUNTAIN_REVEAL_FALLBACK_S * 0.7 : BTC_MOUNTAIN_REVEAL_LAYER_DUR_S;
    const farReveal = smoothstep01(remapClamped(revealTimeRef.current, 0, revealDur));
    const midReveal = smoothstep01(
      remapClamped(revealTimeRef.current, BTC_MOUNTAIN_REVEAL_MID_DELAY_S, BTC_MOUNTAIN_REVEAL_MID_DELAY_S + revealDur)
    );
    const peakReveal = smoothstep01(
      remapClamped(revealTimeRef.current, BTC_MOUNTAIN_REVEAL_PEAK_DELAY_S, BTC_MOUNTAIN_REVEAL_PEAK_DELAY_S + revealDur)
    );

    farGroupRef.current?.rotateY(delta * 0.00018);
    midGroupRef.current?.rotateY(-delta * 0.00013);
    peakGroupRef.current?.rotateY(delta * 0.00009);

    const ring = smoothRingRef.current;
    const scale = smoothScaleRef.current;
    applyRevealToGroup(farGroupRef.current, farReveal, scale * 0.24, 1.035);
    applyRevealToGroup(midGroupRef.current, midReveal, scale * 0.3, 1.05);
    applyRevealToGroup(peakGroupRef.current, peakReveal, scale * 0.36, 1.06);
    const farY = GROUND_DECK_Y - scale * 0.56;
    const midY = GROUND_DECK_Y - scale * 0.6;
    const peakY = GROUND_DECK_Y - scale * 0.62;
    applyCoreLayer(farCoreRef.current, farUnits, ring * 1.01, scale * 0.72, farY, 1.3, 1.08);
    applyShoulderLayer(
      farShoulderRef.current,
      farUnits,
      ring * 1.01,
      scale * 0.54,
      farY
    );
    applyFoothillLayer(farFoothillRef.current, farUnits, ring * 1.01, scale * 0.44, farY);
    applyCoreLayer(midCoreRef.current, midUnits, ring * 0.9, scale * 0.64, midY, 1.24, 1.06);
    applyShoulderLayer(
      midShoulderRef.current,
      midUnits,
      ring * 0.9,
      scale * 0.48,
      midY
    );
    applyFoothillLayer(midFoothillRef.current, midUnits, ring * 0.9, scale * 0.4, midY);
    applyCoreLayer(
      peakCoreRef.current,
      peakUnits,
      ring * 1.14,
      scale * 0.74,
      peakY,
      1.18,
      1.02
    );
    applyShoulderLayer(
      peakShoulderRef.current,
      peakUnits,
      ring * 1.14,
      scale * 0.56,
      peakY
    );
    applyFoothillLayer(peakFoothillRef.current, peakUnits, ring * 1.14, scale * 0.46, peakY);
  });

  return (
    <group renderOrder={BTC_MOUNTAIN_RENDER_ORDER}>
      <group ref={farGroupRef} renderOrder={BTC_MOUNTAIN_RENDER_ORDER}>
        <instancedMesh
          ref={farCoreRef}
          args={[coreGeometry, undefined, BTC_MOUNTAIN_LAYER_FAR_COUNT]}
          frustumCulled={false}
          renderOrder={BTC_MOUNTAIN_RENDER_ORDER}
        >
          <meshStandardMaterial
            color={preset.theme.mountainFarCore}
            roughness={0.96}
            metalness={0.03}
            emissive={preset.theme.mountainFarCore}
            emissiveIntensity={0.05}
            flatShading
            side={DoubleSide}
          />
        </instancedMesh>
        <instancedMesh
          ref={farShoulderRef}
          args={[shoulderGeometry, undefined, BTC_MOUNTAIN_LAYER_FAR_COUNT]}
          frustumCulled={false}
          renderOrder={BTC_MOUNTAIN_RENDER_ORDER + 0.01}
        >
          <meshStandardMaterial
            color={preset.theme.mountainFarShoulder}
            roughness={0.98}
            metalness={0.02}
            emissive={preset.theme.mountainFarShoulder}
            emissiveIntensity={0.04}
            flatShading
            side={DoubleSide}
          />
        </instancedMesh>
        <instancedMesh
          ref={farFoothillRef}
          args={[shoulderGeometry, undefined, BTC_MOUNTAIN_LAYER_FAR_COUNT]}
          frustumCulled={false}
          renderOrder={BTC_MOUNTAIN_RENDER_ORDER + 0.005}
        >
          <meshStandardMaterial
            color={preset.theme.mountainFarFoothill}
            roughness={0.99}
            metalness={0.01}
            emissive={preset.theme.mountainFarFoothill}
            emissiveIntensity={0.035}
            flatShading
            side={DoubleSide}
          />
        </instancedMesh>
      </group>
      <group ref={midGroupRef} renderOrder={BTC_MOUNTAIN_RENDER_ORDER + 0.01}>
        <instancedMesh
          ref={midCoreRef}
          args={[coreGeometry, undefined, BTC_MOUNTAIN_LAYER_MID_COUNT]}
          frustumCulled={false}
          renderOrder={BTC_MOUNTAIN_RENDER_ORDER + 0.02}
        >
          <meshStandardMaterial
            color={preset.theme.mountainMidCore}
            roughness={0.95}
            metalness={0.03}
            emissive={preset.theme.mountainMidCore}
            emissiveIntensity={0.06}
            flatShading
            side={DoubleSide}
          />
        </instancedMesh>
        <instancedMesh
          ref={midShoulderRef}
          args={[shoulderGeometry, undefined, BTC_MOUNTAIN_LAYER_MID_COUNT]}
          frustumCulled={false}
          renderOrder={BTC_MOUNTAIN_RENDER_ORDER + 0.03}
        >
          <meshStandardMaterial
            color={preset.theme.mountainMidShoulder}
            roughness={0.97}
            metalness={0.02}
            emissive={preset.theme.mountainMidShoulder}
            emissiveIntensity={0.05}
            flatShading
            side={DoubleSide}
          />
        </instancedMesh>
        <instancedMesh
          ref={midFoothillRef}
          args={[shoulderGeometry, undefined, BTC_MOUNTAIN_LAYER_MID_COUNT]}
          frustumCulled={false}
          renderOrder={BTC_MOUNTAIN_RENDER_ORDER + 0.025}
        >
          <meshStandardMaterial
            color={preset.theme.mountainMidFoothill}
            roughness={0.99}
            metalness={0.01}
            emissive={preset.theme.mountainMidFoothill}
            emissiveIntensity={0.04}
            flatShading
            side={DoubleSide}
          />
        </instancedMesh>
      </group>
      <group ref={peakGroupRef} renderOrder={BTC_MOUNTAIN_RENDER_ORDER - 0.02}>
        <instancedMesh
          ref={peakCoreRef}
          args={[coreGeometry, undefined, BTC_MOUNTAIN_LAYER_PEAK_COUNT]}
          frustumCulled={false}
          renderOrder={BTC_MOUNTAIN_RENDER_ORDER - 0.02}
        >
          <meshStandardMaterial
            color={preset.theme.mountainPeakCore}
            roughness={0.93}
            metalness={0.04}
            emissive={preset.theme.mountainPeakCore}
            emissiveIntensity={0.07}
            flatShading
            side={DoubleSide}
          />
        </instancedMesh>
        <instancedMesh
          ref={peakShoulderRef}
          args={[shoulderGeometry, undefined, BTC_MOUNTAIN_LAYER_PEAK_COUNT]}
          frustumCulled={false}
          renderOrder={BTC_MOUNTAIN_RENDER_ORDER + 0.04}
        >
          <meshStandardMaterial
            color={preset.theme.mountainPeakShoulder}
            roughness={0.96}
            metalness={0.03}
            emissive={preset.theme.mountainPeakShoulder}
            emissiveIntensity={0.06}
            flatShading
            side={DoubleSide}
          />
        </instancedMesh>
        <instancedMesh
          ref={peakFoothillRef}
          args={[shoulderGeometry, undefined, BTC_MOUNTAIN_LAYER_PEAK_COUNT]}
          frustumCulled={false}
          renderOrder={BTC_MOUNTAIN_RENDER_ORDER + 0.035}
        >
          <meshStandardMaterial
            color={preset.theme.mountainPeakFoothill}
            roughness={0.98}
            metalness={0.02}
            emissive={preset.theme.mountainPeakFoothill}
            emissiveIntensity={0.05}
            flatShading
            side={DoubleSide}
          />
        </instancedMesh>
      </group>
    </group>
  );
}

type BirdTowerColumns = {
  x: Float32Array;
  z: Float32Array;
  radius: Float32Array;
  height: Float32Array;
  count: number;
};

function BirdFlock({
  towers,
  cityRadius,
  onBirdCountChange
}: {
  towers: TowerDatum[];
  cityRadius: number;
  onBirdCountChange?: (count: number) => void;
}) {
  const { camera, size } = useThree();
  const meshRef = useRef<ThreeInstancedMesh>(null);
  const towersRef = useRef(towers);
  const cityRadiusRef = useRef(cityRadius);
  const columnsRef = useRef<BirdTowerColumns>({
    x: new Float32Array(0),
    z: new Float32Array(0),
    radius: new Float32Array(0),
    height: new Float32Array(0),
    count: 0
  });
  const bandFloorRef = useRef(4.5);
  const bandLowRef = useRef(7.2);
  const bandMidRef = useRef(10.6);
  const bandHighRef = useRef(13.2);
  const bandCapRef = useRef(16.8);
  const orbitMinRef = useRef(10);
  const orbitMaxRef = useRef(26);
  const targetCountRef = useRef(BTC_BIRD_MIN_COUNT);
  const activeCountRef = useRef(0);
  const reportedCountRef = useRef(-1);
  const adjustBudgetRef = useRef(0);
  const spawnSerialRef = useRef(0);
  const angleRef = useRef(new Float32Array(BTC_BIRD_MAX_INSTANCES));
  const speedRef = useRef(new Float32Array(BTC_BIRD_MAX_INSTANCES));
  const orbitRadiusRef = useRef(new Float32Array(BTC_BIRD_MAX_INSTANCES));
  const orbitTargetRef = useRef(new Float32Array(BTC_BIRD_MAX_INSTANCES));
  const radiusAmpRef = useRef(new Float32Array(BTC_BIRD_MAX_INSTANCES));
  const radiusFreqRef = useRef(new Float32Array(BTC_BIRD_MAX_INSTANCES));
  const bandRef = useRef(new Uint8Array(BTC_BIRD_MAX_INSTANCES));
  const altitudeRef = useRef(new Float32Array(BTC_BIRD_MAX_INSTANCES));
  const flapPhaseRef = useRef(new Float32Array(BTC_BIRD_MAX_INSTANCES));
  const flapSpeedRef = useRef(new Float32Array(BTC_BIRD_MAX_INSTANCES));
  const sizeRef = useRef(new Float32Array(BTC_BIRD_MAX_INSTANCES));
  const rerouteAtRef = useRef(new Float32Array(BTC_BIRD_MAX_INSTANCES));
  const prevXRef = useRef(new Float32Array(BTC_BIRD_MAX_INSTANCES));
  const prevYRef = useRef(new Float32Array(BTC_BIRD_MAX_INSTANCES));
  const prevZRef = useRef(new Float32Array(BTC_BIRD_MAX_INSTANCES));
  const matrixRef = useRef(new Matrix4());
  const posRef = useRef(new Vector3());
  const scaleRef = useRef(new Vector3());
  const quatRef = useRef(new Quaternion());
  const upRef = useRef(new Vector3(0, 1, 0));

  const geometry = useMemo(() => {
    const g = new ConeGeometry(0.16, 0.42, 3, 1);
    g.rotateX(Math.PI * 0.5);
    g.translate(0, 0, 0.14);
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    towersRef.current = towers;
  }, [towers]);
  useEffect(() => {
    cityRadiusRef.current = cityRadius;
  }, [cityRadius]);

  const ensureColumnCapacity = (count: number) => {
    const cols = columnsRef.current;
    if (cols.x.length >= count) return;
    cols.x = new Float32Array(count);
    cols.z = new Float32Array(count);
    cols.radius = new Float32Array(count);
    cols.height = new Float32Array(count);
  };

  const recomputeMetrics = () => {
    const src = towersRef.current;
    const towerCount = src.length;
    const heights: number[] = [];
    heights.length = towerCount;
    for (let i = 0; i < towerCount; i++) {
      heights[i] = Math.max(0, src[i]?.height ?? 0);
    }
    heights.sort((a, b) => a - b);
    const p50 = percentileFromSorted(heights, 0.5);
    const p75 = percentileFromSorted(heights, 0.75);
    const p90 = percentileFromSorted(heights, 0.9);
    const skylineAnchor = Math.max(p75, p90 * 0.92);
    const floor = Math.max(3.8, p50 * 0.38 + 2.2);
    const low = MathUtils.clamp(p50 * 0.52 + 2.5, floor + 0.6, Math.max(floor + 2.8, skylineAnchor * 0.78 + 2.2));
    const mid = MathUtils.clamp(p75 * 0.72 + 3.0, low + 0.9, Math.max(low + 2.4, skylineAnchor * 0.9 + 2.8));
    const high = Math.max(mid + 1.1, skylineAnchor + 3.8);
    const cap = Math.max(high + 1.6, skylineAnchor + 8.6);
    bandFloorRef.current = floor;
    bandLowRef.current = low;
    bandMidRef.current = mid;
    bandHighRef.current = high;
    bandCapRef.current = cap;

    const cityR = Math.max(18, cityRadiusRef.current);
    const orbitCore = cityR * 0.48;
    const orbitSpreadInner = Math.max(5.5, Math.min(18, cityR * 0.16));
    const orbitSpreadOuter = Math.max(8, Math.min(26, cityR * 0.22));
    const orbitMin = Math.max(8.5, orbitCore - orbitSpreadInner);
    const orbitMax = Math.max(orbitMin + 7.5, orbitCore + orbitSpreadOuter);
    orbitMinRef.current = orbitMin;
    orbitMaxRef.current = orbitMax;

    if (towerCount < BTC_BIRD_START_TOWER_COUNT) {
      targetCountRef.current = 0;
    } else {
      const desiredCount = BTC_BIRD_BASE_COUNT + towerCount * BTC_BIRD_GROWTH_PER_TOWER + cityR * BTC_BIRD_GROWTH_BY_CITY_RADIUS;
      targetCountRef.current = MathUtils.clamp(
        Math.round(desiredCount),
        BTC_BIRD_MIN_COUNT,
        BTC_BIRD_MAX_COUNT
      );
    }

    ensureColumnCapacity(towerCount);
    const cols = columnsRef.current;
    cols.count = towerCount;
    for (let i = 0; i < towerCount; i++) {
      const tower = src[i];
      const radius = Math.min(
        BTC_BIRD_AVOID_RADIUS_MAX,
        Math.max(tower.baseW, tower.baseD, tower.footprintX, tower.footprintZ) * 0.58 + BTC_BIRD_AVOID_PAD
      );
      cols.x[i] = tower.x;
      cols.z[i] = tower.z;
      cols.radius[i] = radius;
      cols.height[i] = Math.max(0, tower.height);
    }
  };

  const reseedBird = (idx: number, nowMs: number, keepAngle = false) => {
    const serial = spawnSerialRef.current++;
    const orbitMin = orbitMinRef.current;
    const orbitMax = orbitMaxRef.current;
    const floor = bandFloorRef.current;
    const cap = bandCapRef.current;
    const low = bandLowRef.current;
    const mid = bandMidRef.current;
    const high = bandHighRef.current;
    const dir = hash01(serial, idx, 11) < 0.5 ? -1 : 1;
    const bandPick = hash01(serial, idx, 17);
    bandRef.current[idx] = bandPick < 0.34 ? 0 : bandPick < 0.8 ? 1 : 2;
    if (!keepAngle) {
      angleRef.current[idx] = hash01(serial, idx, 23) * Math.PI * 2;
    }
    speedRef.current[idx] = dir * MathUtils.lerp(0.08, 0.17, hash01(serial, idx, 29));
    orbitTargetRef.current[idx] = MathUtils.lerp(orbitMin * 1.02, orbitMax * 0.96, hash01(serial, idx, 31));
    orbitRadiusRef.current[idx] = orbitTargetRef.current[idx];
    radiusAmpRef.current[idx] = MathUtils.lerp(0.24, 1.1, hash01(serial, idx, 37));
    radiusFreqRef.current[idx] = MathUtils.lerp(0.26, 0.88, hash01(serial, idx, 41));
    flapPhaseRef.current[idx] = hash01(serial, idx, 43) * Math.PI * 2;
    flapSpeedRef.current[idx] = MathUtils.lerp(5.6, 8.4, hash01(serial, idx, 47));
    sizeRef.current[idx] = MathUtils.lerp(BTC_BIRD_SIZE_MIN, BTC_BIRD_SIZE_MAX, hash01(serial, idx, 53));
    const bandAlt = bandRef.current[idx] === 0 ? low : bandRef.current[idx] === 1 ? mid : high;
    const alt = MathUtils.clamp(bandAlt + MathUtils.lerp(-0.7, 0.7, hash01(serial, idx, 59)), floor, cap);
    altitudeRef.current[idx] = alt;
    rerouteAtRef.current[idx] = nowMs + MathUtils.lerp(9000, 20000, hash01(serial, idx, 61));
    const orbit = orbitRadiusRef.current[idx];
    const x = Math.sin(angleRef.current[idx]) * orbit;
    const z = Math.cos(angleRef.current[idx]) * orbit;
    prevXRef.current[idx] = x;
    prevYRef.current[idx] = alt;
    prevZRef.current[idx] = z;
  };

  const rerouteBird = (idx: number, nowMs: number) => {
    const serial = spawnSerialRef.current++;
    const orbitMin = orbitMinRef.current;
    const orbitMax = orbitMaxRef.current;
    orbitTargetRef.current[idx] = MathUtils.lerp(orbitMin * 1.02, orbitMax * 0.96, hash01(serial, idx, 71));
    radiusAmpRef.current[idx] = MathUtils.lerp(0.2, 1.05, hash01(serial, idx, 73));
    radiusFreqRef.current[idx] = MathUtils.lerp(0.24, 0.9, hash01(serial, idx, 79));
    const bandPick = hash01(serial, idx, 83);
    bandRef.current[idx] = bandPick < 0.32 ? 0 : bandPick < 0.8 ? 1 : 2;
    rerouteAtRef.current[idx] = nowMs + MathUtils.lerp(10_000, 22_000, hash01(serial, idx, 89));
  };

  useEffect(() => {
    recomputeMetrics();
    activeCountRef.current = 0;
    reportedCountRef.current = -1;
    onBirdCountChange?.(activeCountRef.current);
    const timer = window.setInterval(recomputeMetrics, BTC_BIRD_METRIC_UPDATE_MS);
    return () => {
      window.clearInterval(timer);
      onBirdCountChange?.(0);
    };
  }, [onBirdCountChange]);

  useFrame(({ clock }, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const nowMs = performance.now();
    const nowSec = clock.getElapsedTime();
    const targetCount = targetCountRef.current;
    const minActiveCount = targetCount > 0 ? BTC_BIRD_MIN_COUNT : 0;
    adjustBudgetRef.current += delta * BTC_BIRD_COUNT_ADJUST_PER_SEC;
    while (adjustBudgetRef.current >= 1) {
      if (activeCountRef.current < targetCount) {
        reseedBird(activeCountRef.current, nowMs);
        activeCountRef.current += 1;
        adjustBudgetRef.current -= 1;
        continue;
      }
      if (activeCountRef.current > targetCount && activeCountRef.current > minActiveCount) {
        activeCountRef.current -= 1;
        adjustBudgetRef.current -= 1;
        continue;
      }
      break;
    }

    const cols = columnsRef.current;
    const floor = bandFloorRef.current;
    const low = bandLowRef.current;
    const mid = bandMidRef.current;
    const high = bandHighRef.current;
    const cap = bandCapRef.current;
    const orbitMin = orbitMinRef.current;
    const orbitMax = orbitMaxRef.current;
    const matrix = matrixRef.current;
    const pos = posRef.current;
    const scale = scaleRef.current;
    const quat = quatRef.current;
    const up = upRef.current;
    const perspective = camera as { fov?: number };
    const fovDeg = perspective.fov ?? 50;
    const tanHalfFov = Math.tan(MathUtils.degToRad(fovDeg * 0.5));
    const viewportHeight = Math.max(320, size.height);
    const camPos = camera.position;
    const citySizeBoost = MathUtils.clamp(1 + cityRadiusRef.current * BTC_BIRD_CITY_SIZE_GAIN, 1, 2.4);

    for (let i = 0; i < activeCountRef.current; i++) {
      if (nowMs >= rerouteAtRef.current[i]) {
        rerouteBird(i, nowMs);
      }
      angleRef.current[i] += speedRef.current[i] * delta;
      orbitRadiusRef.current[i] = MathUtils.damp(orbitRadiusRef.current[i], orbitTargetRef.current[i], 0.9, delta);
      const weave = Math.sin(nowSec * radiusFreqRef.current[i] + flapPhaseRef.current[i] * 0.9) * radiusAmpRef.current[i];
      let radius = orbitRadiusRef.current[i] + weave;
      radius = MathUtils.clamp(radius, orbitMin, orbitMax);
      let x = Math.sin(angleRef.current[i]) * radius;
      let z = Math.cos(angleRef.current[i]) * radius;
      let repelX = 0;
      let repelZ = 0;
      let altitudeLift = 0;

      for (let c = 0; c < cols.count; c++) {
        const dx = x - cols.x[c];
        const dz = z - cols.z[c];
        const avoidR = cols.radius[c];
        const avoidRSq = avoidR * avoidR;
        const dSq = dx * dx + dz * dz;
        if (dSq >= avoidRSq) continue;
        const d = Math.sqrt(Math.max(1e-6, dSq));
        const k = (avoidR - d) / avoidR;
        const invD = 1 / d;
        repelX += dx * invD * k;
        repelZ += dz * invD * k;
        if (altitudeRef.current[i] < cols.height[c] + BTC_BIRD_CLEARANCE_Y) {
          altitudeLift = Math.max(
            altitudeLift,
            (cols.height[c] + BTC_BIRD_CLEARANCE_Y - altitudeRef.current[i]) * BTC_BIRD_ALTITUDE_LIFT_HEIGHT_GAIN +
              k * BTC_BIRD_ALTITUDE_LIFT_PROX_GAIN
          );
        }
      }

      x += repelX * BTC_BIRD_REPEL_STRENGTH * delta;
      z += repelZ * BTC_BIRD_REPEL_STRENGTH * delta;
      const rNow = Math.hypot(x, z);
      if (rNow > 1e-5) {
        const clampedR = MathUtils.clamp(rNow, orbitMin, orbitMax);
        const scaleR = clampedR / rNow;
        x *= scaleR;
        z *= scaleR;
      }
      angleRef.current[i] = dampAngleRad(angleRef.current[i], Math.atan2(x, z), 2.4, delta);

      const bandAlt = bandRef.current[i] === 0 ? low : bandRef.current[i] === 1 ? mid : high;
      const altitudeWave = Math.sin(nowSec * (0.42 + radiusFreqRef.current[i] * 0.38) + flapPhaseRef.current[i]) * 0.52;
      const targetAltitude = MathUtils.clamp(bandAlt + altitudeWave + altitudeLift, floor, cap);
      const dampedAltitude = MathUtils.damp(
        altitudeRef.current[i],
        targetAltitude,
        altitudeLift > 0 ? BTC_BIRD_ALTITUDE_DAMP_LIFT : BTC_BIRD_ALTITUDE_DAMP_BASE,
        delta
      );
      const maxAltitudeStep =
        (altitudeLift > 0 ? BTC_BIRD_MAX_ALTITUDE_STEP_LIFT : BTC_BIRD_MAX_ALTITUDE_STEP_BASE) * Math.max(0, delta);
      altitudeRef.current[i] += MathUtils.clamp(dampedAltitude - altitudeRef.current[i], -maxAltitudeStep, maxAltitudeStep);
      altitudeRef.current[i] = MathUtils.clamp(altitudeRef.current[i], floor, cap);

      if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(altitudeRef.current[i])) {
        reseedBird(i, nowMs, true);
        continue;
      }

      const vx = x - prevXRef.current[i];
      const vy = altitudeRef.current[i] - prevYRef.current[i];
      const vz = z - prevZRef.current[i];
      prevXRef.current[i] = x;
      prevYRef.current[i] = altitudeRef.current[i];
      prevZRef.current[i] = z;
      const yaw = Math.hypot(vx, vz) > 1e-6 ? Math.atan2(vx, vz) : angleRef.current[i] + Math.PI * 0.5;
      quat.setFromAxisAngle(up, yaw);

      const flap = Math.sin(nowSec * flapSpeedRef.current[i] + flapPhaseRef.current[i]);
      const distToCam = Math.hypot(camPos.x - x, camPos.y - altitudeRef.current[i], camPos.z - z);
      const worldPerPx = (2 * Math.max(1, distToCam) * tanHalfFov) / viewportHeight;
      const minSizeForScreen = worldPerPx * BTC_BIRD_MIN_SCREEN_PX;
      const birdSize = Math.min(BTC_BIRD_SIZE_DYNAMIC_MAX, Math.max(sizeRef.current[i] * citySizeBoost, minSizeForScreen));
      const pitchScale = 1 + MathUtils.clamp(vy * BTC_BIRD_PITCH_SCALE_GAIN, -0.06, 0.07);
      pos.set(x, altitudeRef.current[i], z);
      scale.set(birdSize * 1.05, birdSize * (0.63 + flap * 0.1) * pitchScale, birdSize * (1.22 + flap * 0.05));
      matrix.compose(pos, quat, scale);
      mesh.setMatrixAt(i, matrix);
    }

    mesh.count = activeCountRef.current;
    mesh.instanceMatrix.needsUpdate = true;
    if (reportedCountRef.current !== activeCountRef.current) {
      reportedCountRef.current = activeCountRef.current;
      onBirdCountChange?.(activeCountRef.current);
    }
  });

  return (
    <group>
      <instancedMesh ref={meshRef} args={[geometry, undefined, BTC_BIRD_MAX_INSTANCES]} renderOrder={BTC_BIRD_RENDER_ORDER} frustumCulled={false}>
        <meshBasicMaterial
          color="#fff0d7"
          transparent
          opacity={BTC_BIRD_OPACITY}
          toneMapped={false}
          side={DoubleSide}
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

function useBtcGroundIntroBootAlpha() {
  const [alpha, setAlpha] = useState(() => (BTC_GROUND_BOOT_MS <= 0 ? 1 : 0));

  useEffect(() => {
    if (BTC_GROUND_BOOT_MS <= 0) {
      setAlpha(1);
      return;
    }

    let raf = 0;
    const startAt = performance.now();

    const tick = (now: number) => {
      const t = MathUtils.clamp((now - startAt) / BTC_GROUND_BOOT_MS, 0, 1);
      const next = easeOutCubic(t);
      setAlpha((prev) => (Math.abs(prev - next) > 0.001 ? next : prev));
      if (t < 1) {
        raf = window.requestAnimationFrame(tick);
      }
    };

    setAlpha(0);
    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, []);

  return alpha;
}

function MarketMoodLightRig({ mood = 0.5 }: { mood?: number }) {
  const ambientRef = useRef<{ intensity: number; color: Color } | null>(null);
  const hemiRef = useRef<{ intensity: number; color: Color } | null>(null);
  const keyRef = useRef<{ intensity: number; color: Color } | null>(null);
  const fillRef = useRef<{ intensity: number; color: Color } | null>(null);
  const moodRef = useRef(mood);

  useFrame((_, delta) => {
    moodRef.current = MathUtils.damp(moodRef.current, mood, 2.2, delta);
    const m = MathUtils.clamp(moodRef.current, 0, 1);
    const breadthSigned = m * 2 - 1;
    const coolTint = tempColorA.set('#9ec6ef');
    const warmTint = tempColorB.set('#f4d0a8');
    const mixedTint = tempColorC.copy(coolTint).lerp(warmTint, MathUtils.clamp(0.5 - breadthSigned * 0.25, 0, 1));

    if (ambientRef.current) {
      ambientRef.current.intensity = MathUtils.lerp(0.28, 0.38, Math.abs(breadthSigned));
      ambientRef.current.color.copy(mixedTint);
    }
    if (hemiRef.current) {
      hemiRef.current.intensity = MathUtils.lerp(0.3, 0.42, Math.abs(breadthSigned));
      hemiRef.current.color.copy(tempColorA.copy(coolTint).lerp(warmTint, MathUtils.clamp(0.5 - breadthSigned * 0.2, 0, 1)));
    }
    if (keyRef.current) {
      keyRef.current.intensity = MathUtils.lerp(0.66, 0.8, Math.abs(breadthSigned));
      keyRef.current.color.copy(
        tempColorA.copy(tempColorB.set('#d6e8ff')).lerp(tempColorC.set('#ffd5a8'), MathUtils.clamp(0.5 - breadthSigned * 0.22, 0, 1))
      );
    }
    if (fillRef.current) {
      fillRef.current.intensity = MathUtils.lerp(0.28, 0.38, Math.abs(breadthSigned));
      fillRef.current.color.copy(
        tempColorA.copy(tempColorB.set('#7fd3ff')).lerp(tempColorC.set('#f8bd88'), MathUtils.clamp(0.5 - breadthSigned * 0.22, 0, 1))
      );
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef as never} intensity={0.32} color="#9bb8d6" />
      <hemisphereLight ref={hemiRef as never} args={['#9cc4ee', '#090b10', 0.34]} />
      <directionalLight
        ref={keyRef as never}
        position={[10, 18, 8]}
        intensity={0.72}
        color="#d6e8ff"
        castShadow={RUNTIME_QUALITY_CONFIG.shadows}
      />
      <directionalLight ref={fillRef as never} position={[-14, 20, -10]} intensity={0.34} color="#7fd3ff" />
    </>
  );
}

function SandboxScene({
  mode,
  preset,
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
  topFx,
  groundIntroBootAlpha,
  hoveredTowerSequence,
  selectedTowerSequence,
  tallestTowerSequence,
  onHoverTowerChange,
  onSelectTowerChange,
  onHoverHudUpdate,
  onCameraDebug,
  onBirdCountChange,
  cameraInteractionLocked = false,
  cinematicFlyoverTargets = [],
  cinematicFlyoverSignal = 0,
  onCinematicFlyoverActiveChange,
  resetCameraSignal = 0,
  zoomInCameraSignal = 0,
  zoomOutCameraSignal = 0
}: {
  mode: CityMode;
  preset: CryptoCityPreset;
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
  topFx?: {
    introBootAlpha: number;
    introLifeAlpha: number;
    introProgress: number;
    introActive: boolean;
    storyBeatUntilMs: number;
    clutter: number;
    transitionLoad: number;
  };
  groundIntroBootAlpha?: number;
  hoveredTowerSequence: number | null;
  selectedTowerSequence: number | null;
  tallestTowerSequence: number | null;
  onHoverTowerChange?: (sequence: number | null) => void;
  onSelectTowerChange?: (sequence: number | null) => void;
  onHoverHudUpdate?: (snapshot: HoverHudSnapshot) => void;
  onCameraDebug?: (snapshot: CameraDebugSnapshot) => void;
  onBirdCountChange?: (count: number) => void;
  cameraInteractionLocked?: boolean;
  cinematicFlyoverTargets?: readonly CinematicFlyoverTarget[];
  cinematicFlyoverSignal?: number;
  onCinematicFlyoverActiveChange?: (active: boolean) => void;
  resetCameraSignal?: number;
  zoomInCameraSignal?: number;
  zoomOutCameraSignal?: number;
}) {
  const fx = topFx ?? {
    introBootAlpha: 1,
    introLifeAlpha: 1,
    introProgress: 1,
    introActive: false,
    storyBeatUntilMs: 0,
    clutter: 0,
    transitionLoad: 0
  };
  const hoveredTower = useMemo(
    () => (hoveredTowerSequence == null ? null : towers.find((tower) => tower.sequence === hoveredTowerSequence) ?? null),
    [hoveredTowerSequence, towers]
  );
  const mountainScaleMetric = useMemo(() => {
    if (towers.length === 0) return 10;
    const heights = towers.map((tower) => Math.max(0, tower.height));
    heights.sort((a, b) => a - b);
    return percentileFromSorted(heights, 0.75);
  }, [towers]);
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
  const discFocusAnchor = useMemo(
    () =>
      selectedTower
        ? { x: selectedTower.x, z: selectedTower.z }
        : hoveredTower
          ? { x: hoveredTower.x, z: hoveredTower.z }
          : { x: 0, z: 0 },
    [hoveredTower, selectedTower]
  );
  const focusMode = hoveredTowerSequence != null;
  const introNetworkAlpha = topFx ? smoothstep01(remapClamped(fx.introLifeAlpha, 0.02, 0.98)) : 1;
  const transitionLoad = MathUtils.clamp(fx.transitionLoad ?? 0, 0, 1);
  const transitionHideNetwork = transitionLoad > 0.08 || introNetworkAlpha <= 0.01;
  const tracesRender = useMemo(() => {
    if (transitionHideNetwork) return [] as TraceDatum[];
    return traces;
  }, [traces, transitionHideNetwork]);
  const arterialTracesRender = useMemo(() => {
    if (transitionHideNetwork) return [] as TraceDatum[];
    return arterialTraces;
  }, [arterialTraces, transitionHideNetwork]);
  const trafficRender = useMemo(() => {
    if (transitionHideNetwork) return [] as TrafficParticleDatum[];
    return trafficParticles;
  }, [trafficParticles, transitionHideNetwork]);
  const showParksLayer = true;
  const showParkFireflies = !topFx || (!fx.introActive && fx.introProgress >= 0.995);
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
    if (cameraInteractionLocked) return;
    hoverIntentRef.current = sequence;
    hoverLastSeenAtRef.current = performance.now();
  };
  const requestSelectTower = (sequence: number) => {
    if (cameraInteractionLocked) return;
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
      camera={{ position: [20, 12, 20], fov: 50, near: 0.15, far: 1200 }}
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
      {topFx ? (
        <MarketMoodLightRig mood={marketMoodTarget} />
      ) : (
        <>
          <ambientLight intensity={0.32} color={preset.theme.pale} />
          <hemisphereLight args={[preset.theme.warm, '#090b10', 0.34]} />
          <directionalLight
            position={[10, 18, 8]}
            intensity={0.72}
            color={preset.theme.warm}
            castShadow={RUNTIME_QUALITY_CONFIG.shadows}
          />
          <directionalLight position={[-14, 20, -10]} intensity={0.34} color={preset.theme.primary} />
        </>
      )}
      <MinimalOrbitRig
        bounds={bounds}
        focusTarget={focusTarget}
        onClearFocusTarget={() => onSelectTowerChange?.(null)}
        onCameraDebug={onCameraDebug}
        flyoverTargets={cinematicFlyoverTargets}
        flyoverSignal={cinematicFlyoverSignal}
        onFlyoverActiveChange={onCinematicFlyoverActiveChange}
        storyBeatUntilMs={fx.storyBeatUntilMs}
        resetSignal={resetCameraSignal}
        zoomInSignal={zoomInCameraSignal}
        zoomOutSignal={zoomOutCameraSignal}
      />

      <CircuitBoardGround
        bounds={bounds}
        preset={preset}
        focusMode={focusMode}
        marketPulse={marketMoodTarget}
        introBootAlpha={groundIntroBootAlpha ?? fx.introBootAlpha}
      />
      {isCryptoCityMode(mode) ? (
        <MountainsBackdrop
          cityRadius={bounds.radius}
          cityScaleMetric={mountainScaleMetric}
          preset={preset}
          introBootAlpha={groundIntroBootAlpha ?? fx.introBootAlpha}
        />
      ) : null}
      <DistrictBoundariesLayer districts={districts} focusMode={focusMode} />
      <ShockwaveLayer shockwaves={shockwaves} focusMode={focusMode} />
      {showParksLayer ? (
        <ParksLayer parks={parks} trees={parkTrees} preset={preset} focusMode={focusMode} showFireflies={showParkFireflies} />
      ) : null}
      <TraceStrips
        traces={tracesRender}
        focusMode={focusMode}
        marketPulse={marketMoodTarget}
        introLifeAlpha={fx.introLifeAlpha}
        clutter={fx.clutter}
      />
      <TraceStrips
        traces={arterialTracesRender}
        focusMode={focusMode}
        marketPulse={marketMoodTarget}
        arterial
        introLifeAlpha={fx.introLifeAlpha}
        clutter={fx.clutter}
      />
      <TrafficParticles particles={trafficRender} focusMode={focusMode} introLifeAlpha={fx.introLifeAlpha} clutter={fx.clutter} />
      {isCryptoCityMode(mode) ? <BirdFlock towers={towers} cityRadius={bounds.radius} onBirdCountChange={onBirdCountChange} /> : null}
      <HoverProjectionTracker tower={hoveredTower} onHudUpdate={onHoverHudUpdate} />

      {/* Render band 6: tower bodies and holo layers remain the top visual anchors */}
      <group renderOrder={6}>
        {towers.map((tower) => (
          <AnimatedHoloTower
            key={tower.sequence}
            tower={tower}
            hoveredTowerSequence={hoveredTowerSequence}
            selectedTowerSequence={selectedTowerSequence}
            discFocusAnchorX={discFocusAnchor.x}
            discFocusAnchorZ={discFocusAnchor.z}
            isTallest={tallestTowerSequence === tower.sequence}
            onHoverTower={requestHoverTower}
            onSelectTower={requestSelectTower}
            preset={preset}
            topFx={fx}
          />
        ))}
      </group>

      {tallestTower && tallestTower.mode !== 'top200' ? (
        <TallestBeacon
          tower={tallestTower}
          preset={preset}
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

export function BtcSpotBuysSandbox({
  mode,
  preset,
  cryptoSelection,
  onModeChange
}: {
  mode: CityMode;
  preset: CryptoCityPreset;
  cryptoSelection: CryptoCityMode;
  onModeChange?: (nextMode: CityMode) => void;
}) {
  const { events } = useBlockEventStore();
  const btcData = useAppendOnlyTowers(events, preset);
  const active = btcData;
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
    tallestTowerSequence
  } = active;
  const [, setCameraDebug] = useState<CameraDebugSnapshot>({ camDist: 0, visCurve: 0 });
  const [hoveredTowerSequence, setHoveredTowerSequence] = useState<number | null>(null);
  const [selectedTowerSequence, setSelectedTowerSequence] = useState<number | null>(null);
  const [hoverHud, setHoverHud] = useState<HoverHudSnapshot>(HOVER_HUD_HIDDEN);
  const [resetCameraSignal, setResetCameraSignal] = useState(0);
  const [zoomInCameraSignal, setZoomInCameraSignal] = useState(0);
  const [zoomOutCameraSignal, setZoomOutCameraSignal] = useState(0);
  const [cinematicFlyoverTargets, setCinematicFlyoverTargets] = useState<CinematicFlyoverTarget[]>([]);
  const [cinematicFlyoverSignal, setCinematicFlyoverSignal] = useState(0);
  const [cinematicFlyoverActive, setCinematicFlyoverActive] = useState(false);
  const btcGroundIntroBootAlpha = useBtcGroundIntroBootAlpha();
  const topFx = undefined;
  const metricPanel = useMemo(() => deriveBtcCityMetrics({ towers, events, preset }), [events, preset, towers]);
  const cinematicFlyoverEnabled = btcGroundIntroBootAlpha >= 0.995 && towers.length >= 10;

  useEffect(() => {
    setHoveredTowerSequence(null);
    setSelectedTowerSequence(null);
    setHoverHud(HOVER_HUD_HIDDEN);
    setCinematicFlyoverActive(false);
    setCinematicFlyoverTargets([]);
    setResetCameraSignal((current) => current + 1);
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

  const hoveredTower = useMemo(
    () => (hoveredTowerSequence == null ? null : towers.find((tower) => tower.sequence === hoveredTowerSequence) ?? null),
    [hoveredTowerSequence, towers]
  );

  const handleResetCamera = () => {
    setHoveredTowerSequence(null);
    setSelectedTowerSequence(null);
    setHoverHud(HOVER_HUD_HIDDEN);
    setCinematicFlyoverActive(false);
    setResetCameraSignal((current) => current + 1);
  };

  const handleCinematicFlyover = () => {
    if (!cinematicFlyoverEnabled) return;
    const nextTargets = pickCinematicFlyoverTargets(towers);
    if (nextTargets.length === 0) return;
    setHoveredTowerSequence(null);
    setSelectedTowerSequence(null);
    setHoverHud(HOVER_HUD_HIDDEN);
    setCinematicFlyoverActive(true);
    setCinematicFlyoverTargets(nextTargets);
    setCinematicFlyoverSignal((current) => current + 1);
  };

  return (
    <div className="minimal-viz">
      <SandboxScene
        mode={mode}
        preset={preset}
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
        topFx={topFx}
        groundIntroBootAlpha={btcGroundIntroBootAlpha}
        hoveredTowerSequence={hoveredTowerSequence}
        selectedTowerSequence={selectedTowerSequence}
        tallestTowerSequence={tallestTowerSequence}
        cameraInteractionLocked={cinematicFlyoverActive}
        cinematicFlyoverTargets={cinematicFlyoverTargets}
        cinematicFlyoverSignal={cinematicFlyoverSignal}
        onCinematicFlyoverActiveChange={setCinematicFlyoverActive}
        resetCameraSignal={resetCameraSignal}
        zoomInCameraSignal={zoomInCameraSignal}
        zoomOutCameraSignal={zoomOutCameraSignal}
        onHoverTowerChange={setHoveredTowerSequence}
        onSelectTowerChange={setSelectedTowerSequence}
        onHoverHudUpdate={setHoverHud}
        onCameraDebug={setCameraDebug}
      />
      <HoverHudOverlay tower={hoveredTower} preset={preset} hud={hoverHud} />
      <Web3CitiesUi
        mode={mode}
        cryptoSelection={cryptoSelection}
        onModeChange={onModeChange}
        metricPanel={metricPanel}
        onCinematicFlyover={handleCinematicFlyover}
        cinematicFlyoverEnabled={cinematicFlyoverEnabled}
        cinematicFlyoverActive={cinematicFlyoverActive}
        onResetCamera={handleResetCamera}
        onZoomIn={() => setZoomInCameraSignal((current) => current + 1)}
        onZoomOut={() => setZoomOutCameraSignal((current) => current + 1)}
      />
    </div>
  );
}
