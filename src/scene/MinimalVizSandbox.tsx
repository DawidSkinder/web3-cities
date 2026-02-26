import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Group, InstancedMesh as ThreeInstancedMesh, Mesh } from 'three';
import {
  AdditiveBlending,
  ACESFilmicToneMapping,
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
  Vector3
} from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { useBlockEventStore } from '../data/trades/blockEventStore';
import type { BlockEvent } from '../data/trades/types';
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
  btcVolume: number;
  usdNotional: number;
  averagePrice: number;
  tradeCount: number;
  windowStart: number;
  windowEnd: number;
  emittedAt: number;
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
  meanLogV: number;
  varLogV: number;
  meanI: number;
  varI: number;
};

type HeightDebugSnapshot = {
  sequence: number;
  totalVolume: number;
  logV: number;
  intensity: number;
  scoreV: number;
  scoreI: number;
  score: number;
  height: number;
  isHero: boolean;
  heroMult: number;
  heroMode: 'none' | 'roll' | 'guarantee';
  baseW: number;
  baseD: number;
  meanLogV: number;
  stdLogV: number;
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
  trafficParticles: TrafficParticleDatum[];
  parks: ParkDatum[];
  parkTrees: ParkTreeDatum[];
  traceKeySet: Set<string>;
  lastSequence: number;
  bounds: SandboxBounds;
  ema: EmaStats;
  latestHeightDebug: HeightDebugSnapshot | null;
  nextParkAtCount: number;
  towersSinceHero: number;
  heroEligibleSinceLast: number;
  tallestTowerSequence: number | null;
  tallestTowerHeight: number;
  parksAttempted: number;
  parksPlaced: number;
  lastParkSkipReason: string;
};

type CameraMode = 'auto' | 'user' | 'returning';

type OrbitState = {
  angle: number;
  distance: number;
  elevation: number;
  lookY: number;
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SPIRAL_STEP = 3.35;
const MIN_HEIGHT = 2.5;
const MAX_HEIGHT = 36;
const HERO_MAX_HEIGHT = 72;
const HEIGHT_GAMMA = 1.15;
const TOWER_FOOTPRINT = 1.1;
const IDLE_DELAY_MS = 6000;
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
const EMA_ALPHA_VOL = 0.08;
const EMA_ALPHA_INT = 0.08;
const EMA_STD_EPS = 0.045;
const ZV_MIN = -2.5;
const ZV_MAX = 3.5;
const ZI_MIN = -2.5;
const ZI_MAX = 3.5;
const SCORE_WEIGHT_VOL = 0.78;
const SCORE_WEIGHT_INT = 0.22;
const RADIAL_GLOW_RADIUS_MULT = 1.6;
const RADIAL_GLOW_DAMP = 1.6;
const MIN_BASE = 0.62;
const MAX_BASE = 1.9;
const BASE_GAMMA = 0.72;
const ASPECT_MIN = 0.75;
const ASPECT_MAX = 1.35;
const TAPER_MAX = 0.18;
const HERO_SCORE_MIN = 0.88;
const HERO_PROB_BASE = 0.032;
const HERO_HEIGHT_MULT_MIN = 1.8;
const HERO_HEIGHT_MULT_MAX = 2.45;
const HERO_BASE_MULT_MIN = 1.35;
const HERO_BASE_MULT_MAX = 1.9;
const HERO_GUARANTEE_GAP = 56;
const HERO_GUARANTEE_MIN_ELIGIBLE = 2;
const VIS_NEAR_DIST = 34;
const VIS_FAR_DIST = 170;
const FOCUS_NON_HOVER_DIM = 0.22;
const FOCUS_GROUND_DIM = 0.64;
const FOCUS_TRACE_DIM = 0.22;
const FOCUS_TRAFFIC_DIM = 0.24;
const HOVER_ORANGE_BOOST = 1.22;
const HOVER_LABEL_WIDTH_PX = 220;
const HOVER_LABEL_HEIGHT_PX = 78;
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
const PARK_CADENCE_BASE = 80;
const PARK_CADENCE_JITTER = 20;
const PARK_BASE_CLEARANCE = 1.2;

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
  const baseRaw = MathUtils.lerp(MIN_BASE, MAX_BASE, Math.pow(scoreLike, BASE_GAMMA));
  const superTallBoost =
    scoreLike > 0.8 ? MathUtils.lerp(0, 0.34, MathUtils.clamp((scoreLike - 0.8) / 0.2, 0, 1)) : 0;
  const jitter = MathUtils.lerp(0.9, 1.1, hash01(sequence, 109));
  const base = MathUtils.clamp((baseRaw + superTallBoost) * jitter, MIN_BASE, MAX_BASE * 1.08);
  const tallAspectBias = MathUtils.clamp((scoreLike - 0.65) / 0.35, 0, 1);
  const aspectMin = MathUtils.lerp(ASPECT_MIN, 0.82, tallAspectBias);
  const aspectMax = MathUtils.lerp(ASPECT_MAX, 1.48, tallAspectBias);
  const aspect = MathUtils.lerp(aspectMin, aspectMax, hash01(sequence, 111));
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
  return {
    processedSequences: new Set<number>(),
    towers: [],
    traces: [],
    trafficParticles: [],
    parks: [],
    parkTrees: [],
    traceKeySet: new Set<string>(),
    lastSequence: 0,
    bounds: {
      radius: 18,
      maxY: 10
    },
    ema: {
      initialized: false,
      meanLogV: 0,
      varLogV: 1,
      meanI: 0.4,
      varI: 0.08
    },
    latestHeightDebug: null,
    nextParkAtCount: PARK_CADENCE_BASE + Math.round((hash01(1, 7009) * 2 - 1) * PARK_CADENCE_JITTER),
    towersSinceHero: 0,
    heroEligibleSinceLast: 0,
    tallestTowerSequence: null,
    tallestTowerHeight: 0,
    parksAttempted: 0,
    parksPlaced: 0,
    lastParkSkipReason: 'none'
  };
}

function nextParkInterval(seed: number) {
  return PARK_CADENCE_BASE + Math.round((hash01(seed, 7021) * 2 - 1) * PARK_CADENCE_JITTER);
}

function parkConflictsTower(x: number, z: number, w: number, d: number, tower: TowerDatum) {
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

function appendPark(state: AccumState, seed: number) {
  state.parksAttempted += 1;
  if (state.towers.length < 16) {
    state.lastParkSkipReason = 'too-early';
    return false;
  }

  const cityRadius = Math.max(18, state.bounds.radius);
  const sizeScale = MathUtils.lerp(0.95, 1.3, MathUtils.clamp(cityRadius / 160, 0, 1));
  const w = MathUtils.lerp(4.8, 8.8, hash01(seed, 7101)) * sizeScale;
  const d = MathUtils.lerp(4.4, 8.4, hash01(seed, 7109)) * sizeScale;
  const yaw = hash01(seed, 7117) * Math.PI;
  const spawnRadius = MathUtils.clamp(cityRadius * MathUtils.lerp(0.35, 0.9, hash01(seed, 7123)), 8, cityRadius * 0.96);

  let chosenX = 0;
  let chosenZ = 0;
  let placed = false;
  let fallbackBest: { x: number; z: number; penalty: number } | null = null;
  for (let attempt = 0; attempt < 24; attempt++) {
    const a = hash01(seed, attempt, 7131) * Math.PI * 2;
    const r = Math.sqrt(hash01(seed, attempt, 7139)) * spawnRadius;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.hypot(x, z) > cityRadius * 0.98) continue;
    let blocked = false;
    let penalty = 0;
    for (let i = 0; i < state.towers.length; i++) {
      const other = state.towers[i];
      if (!other) continue;
      if (parkConflictsTower(x, z, w, d, other)) {
        blocked = true;
        const dx = Math.abs(x - other.x);
        const dz = Math.abs(z - other.z);
        penalty += Math.max(0, (w + d) * 0.25 - Math.min(dx, dz));
      }
    }
    for (let i = 0; i < state.parks.length; i++) {
      const otherPark = state.parks[i];
      if (!otherPark) continue;
      if (parkConflictsPark(x, z, w, d, otherPark)) {
        blocked = true;
        penalty += 0.6;
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

  const patchColor = new Color('#172018')
    .lerp(new Color('#1b2318'), hash01(seed, 7201))
    .lerp(new Color('#101812'), hash01(seed, 7207) * 0.4);
  const edgeColor = new Color('#c89a54').lerp(new Color('#f7931a'), 0.18 + hash01(seed, 7211) * 0.25);

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
      trunkH: MathUtils.lerp(0.22, 0.42, hash01(seed, i, 7261)),
      crownH: MathUtils.lerp(0.38, 0.78, hash01(seed, i, 7267)),
      crownR: MathUtils.lerp(0.18, 0.34, hash01(seed, i, 7273)),
      tintMix: hash01(seed, i, 7281)
    });
  }

  state.parks.push({
    id: `park-${state.towers.length}-${seed}`,
    x: chosenX,
    z: chosenZ,
    w,
    d,
    yaw,
    patchColor: `#${patchColor.getHexString()}`,
    edgeColor: `#${edgeColor.getHexString()}`,
    treeStart,
    treeCount: state.parkTrees.length - treeStart
  });
  state.parksPlaced += 1;

  return true;
}

function maybeAppendPark(state: AccumState, seed: number) {
  const towerCount = state.towers.length;
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
  const usdNotional = totalVolume * averagePrice;
  const logV = Math.log1p(totalVolume);

  const ema = state.ema;
  if (!ema.initialized) {
    ema.initialized = true;
    ema.meanLogV = logV;
    ema.varLogV = Math.max(0.08, EMA_STD_EPS * EMA_STD_EPS);
    ema.meanI = intensity;
    ema.varI = Math.max(0.02, EMA_STD_EPS * EMA_STD_EPS);
  }

  const preMeanLogV = ema.meanLogV;
  const preStdLogV = emaStd(ema.varLogV);
  const preMeanI = ema.meanI;
  const preStdI = emaStd(ema.varI);

  const zV = MathUtils.clamp((logV - preMeanLogV) / preStdLogV, ZV_MIN, ZV_MAX);
  const zI = MathUtils.clamp((intensity - preMeanI) / preStdI, ZI_MIN, ZI_MAX);
  const scoreV = smoothstep01(remapClamped(zV, ZV_MIN, ZV_MAX));
  const scoreI = smoothstep01(remapClamped(zI, ZI_MIN, ZI_MAX));

  let score = SCORE_WEIGHT_VOL * scoreV + SCORE_WEIGHT_INT * scoreI;
  if (scoreV > 0.85) {
    score += 0.1 * ((scoreV - 0.85) / 0.15);
  }
  score = MathUtils.clamp(score, 0, 1);

  let height = MathUtils.clamp(MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * Math.pow(score, HEIGHT_GAMMA), MIN_HEIGHT, MAX_HEIGHT);

  const dominance = MathUtils.clamp(clampFinite(event.metrics.imbalance, 0), -1, 1);
  const imbalance = Math.abs(dominance);
  const dominance01 = (dominance + 1) * 0.5;
  const glow = BTC_SELL_WARM.clone().lerp(BTC_PALE_AMBER, 0.38).lerp(BTC_ORANGE, dominance01);
  const core = CORE_GRAPHITE.clone().lerp(CORE_GRAPHITE_HI, 0.2 + imbalance * 0.22);
  let glowStrength = MathUtils.clamp(0.7 + intensity * 0.45 + imbalance * 0.55, 0.75, 1.55);
  let bandCount = (2 + Math.min(2, Math.floor(imbalance * 3))) as 2 | 3 | 4;
  let capGlowBoost = MathUtils.lerp(0.9, 1.35, Math.pow(score, 1.05));
  const heroRoll = hash01(event.sequence, 1901);
  const heroProbBoost = MathUtils.clamp((score - HERO_SCORE_MIN) / Math.max(0.0001, 1 - HERO_SCORE_MIN), 0, 1);
  const heroProb = HERO_PROB_BASE * MathUtils.lerp(0.75, 1.85, heroProbBoost);
  const heroCandidate = score > HERO_SCORE_MIN;
  const heroRollHit = heroCandidate && heroRoll < heroProb;
  const heroGuarantee =
    heroCandidate &&
    state.towersSinceHero >= HERO_GUARANTEE_GAP &&
    state.heroEligibleSinceLast >= HERO_GUARANTEE_MIN_ELIGIBLE;
  const isHero = heroRollHit || heroGuarantee;
  const heroMode: 'none' | 'roll' | 'guarantee' = heroRollHit ? 'roll' : heroGuarantee ? 'guarantee' : 'none';
  const heroMult = isHero
    ? MathUtils.lerp(HERO_HEIGHT_MULT_MIN, HERO_HEIGHT_MULT_MAX, hash01(event.sequence, 1907))
    : 1;
  const heroBaseMult = isHero ? MathUtils.lerp(HERO_BASE_MULT_MIN, HERO_BASE_MULT_MAX, hash01(event.sequence, 1913)) : 1;
  height = MathUtils.clamp(height * heroMult, MIN_HEIGHT, HERO_MAX_HEIGHT);

  const shape = buildTowerShapeParams(event.sequence, score);
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
    const radialLen = Math.max(0.0001, Math.hypot(x, z));
    const dirX = x / radialLen;
    const dirZ = z / radialLen;
    const sampleCount = Math.min(18, state.towers.length);
    for (let i = 0; i < sampleCount; i++) {
      const other = state.towers[state.towers.length - 1 - i];
      if (!other) continue;
      const dx = x - other.x;
      const dz = z - other.z;
      const dist = Math.hypot(dx, dz);
      const otherR = Math.max(other.baseW, other.baseD) * 0.65;
      const thisR = Math.max(shape.baseW, shape.baseD) * 0.68;
      const minDist = otherR + thisR + 0.28;
      if (dist < minDist) {
        const push = minDist - dist + 0.04;
        x += dirX * push;
        z += dirZ * push;
      }
    }
  }

  const nextLog = updateEma(ema.meanLogV, ema.varLogV, logV, EMA_ALPHA_VOL);
  ema.meanLogV = nextLog.mean;
  ema.varLogV = nextLog.variance;
  const nextI = updateEma(ema.meanI, ema.varI, intensity, EMA_ALPHA_INT);
  ema.meanI = nextI.mean;
  ema.varI = nextI.variance;

  state.latestHeightDebug = {
    sequence: event.sequence,
    totalVolume,
    logV,
    intensity,
    scoreV,
    scoreI,
    score,
    height,
    isHero,
    heroMult,
    heroMode,
    baseW: shape.baseW,
    baseD: shape.baseD,
    meanLogV: ema.meanLogV,
    stdLogV: emaStd(ema.varLogV),
    meanI: ema.meanI,
    stdI: emaStd(ema.varI)
  };

  state.towersSinceHero += 1;
  if (heroCandidate) state.heroEligibleSinceLast += 1;
  if (isHero) {
    state.towersSinceHero = 0;
    state.heroEligibleSinceLast = 0;
  }

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
    btcVolume: totalVolume,
    usdNotional,
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
      target.towers.push(tower);
      appendTracesForNewTower(target, tower);
      target.processedSequences.add(event.sequence);
      target.lastSequence = Math.max(target.lastSequence, event.sequence);
      target.bounds.radius = Math.max(target.bounds.radius, Math.hypot(tower.x, tower.z) + 8);
      target.bounds.maxY = Math.max(target.bounds.maxY, tower.height + 2.5);
      if (
        target.tallestTowerSequence == null ||
        tower.height > target.tallestTowerHeight ||
        (Math.abs(tower.height - target.tallestTowerHeight) < 0.0001 && tower.sequence > (target.tallestTowerSequence ?? 0))
      ) {
        target.tallestTowerSequence = tower.sequence;
        target.tallestTowerHeight = tower.height;
      }
      maybeAppendPark(target, tower.sequence);
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
    trafficParticles: accumRef.current.trafficParticles,
    parks: accumRef.current.parks,
    parkTrees: accumRef.current.parkTrees,
    bounds: accumRef.current.bounds,
    latestHeightDebug: accumRef.current.latestHeightDebug,
    tallestTowerSequence: accumRef.current.tallestTowerSequence,
    tallestTowerHeight: accumRef.current.tallestTowerHeight,
    parksAttempted: accumRef.current.parksAttempted,
    parksPlaced: accumRef.current.parksPlaced,
    lastParkSkipReason: accumRef.current.lastParkSkipReason
  };
}

function MinimalOrbitRig({
  bounds,
  onCameraDebug
}: {
  bounds: SandboxBounds;
  onCameraDebug?: (snapshot: CameraDebugSnapshot) => void;
}) {
  const { camera, gl } = useThree();
  const initializedRef = useRef(false);
  const modeRef = useRef<CameraMode>('auto');
  const lastInteractionRef = useRef(0);

  const actualRef = useRef<OrbitState>({ angle: 0, distance: 28, elevation: 12, lookY: 4 });
  const controlRef = useRef<OrbitState>({ angle: 0, distance: 28, elevation: 12, lookY: 4 });
  const autoRef = useRef<OrbitState>({ angle: 0, distance: 28, elevation: 12, lookY: 4 });

  const keysRef = useRef<Record<string, boolean>>({});
  const dragRef = useRef({ dragging: false, pointerId: -1, lastX: 0, lastY: 0 });
  const debugEmitAtRef = useRef(0);

  useEffect(() => {
    const canvas = gl.domElement;

    const markInteraction = () => {
      lastInteractionRef.current = performance.now();
      if (modeRef.current !== 'user') modeRef.current = 'user';
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dragRef.current.dragging = true;
      dragRef.current.pointerId = event.pointerId;
      dragRef.current.lastX = event.clientX;
      dragRef.current.lastY = event.clientY;
      canvas.setPointerCapture?.(event.pointerId);
      markInteraction();
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag.dragging || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      const control = controlRef.current;
      const precision = keysRef.current.ShiftLeft || keysRef.current.ShiftRight ? 0.45 : 1;
      control.angle = control.angle - dx * 0.0042 * precision;
      control.elevation += dy * -0.035 * precision;
      control.lookY += dy * -0.016 * precision;
      markInteraction();
      event.preventDefault();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (dragRef.current.pointerId !== event.pointerId) return;
      dragRef.current.dragging = false;
      dragRef.current.pointerId = -1;
      canvas.releasePointerCapture?.(event.pointerId);
      markInteraction();
    };

    const onWheel = (event: WheelEvent) => {
      const control = controlRef.current;
      const precision = keysRef.current.ShiftLeft || keysRef.current.ShiftRight ? 0.55 : 1;
      control.distance += event.deltaY * 0.016 * precision;
      markInteraction();
      event.preventDefault();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      keysRef.current[event.code] = true;
      if (event.code === 'KeyR') {
        modeRef.current = 'returning';
        lastInteractionRef.current = performance.now();
        event.preventDefault();
        return;
      }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(event.code)) {
        markInteraction();
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
  }, [gl]);

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    const radius = Math.max(18, bounds.radius);
    const maxY = Math.max(8, bounds.maxY);
    const orbitScale = RUNTIME_QUALITY_CONFIG.cameraOrbitSpeedScale;
    const driftScale = RUNTIME_QUALITY_CONFIG.cameraDriftScale;

    const auto = autoRef.current;
    auto.angle = t * 0.18 * orbitScale + Math.sin(t * 0.1 * orbitScale) * (0.06 * driftScale);
    auto.distance = MathUtils.clamp(18 + radius * 1.65 + maxY * 0.55, 24, 170);
    auto.elevation = MathUtils.clamp(8 + maxY * 0.9 + radius * 0.22, 10, 72);
    auto.lookY = MathUtils.clamp(1.5 + maxY * 0.45, 2, 30);

    const keys = keysRef.current;
    const anyMovementKey = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD || keys.KeyQ || keys.KeyE;
    if (anyMovementKey) {
      modeRef.current = 'user';
      lastInteractionRef.current = performance.now();
    }

    if (modeRef.current === 'user') {
      const idleMs = performance.now() - lastInteractionRef.current;
      if (!dragRef.current.dragging && idleMs > IDLE_DELAY_MS) modeRef.current = 'returning';
    }

    const control = controlRef.current;
    const actual = actualRef.current;
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastInteractionRef.current = performance.now();
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
      control.angle = auto.angle;
      control.distance = auto.distance;
      control.elevation = auto.elevation;
      control.lookY = auto.lookY;
    }

    if (modeRef.current === 'user' || modeRef.current === 'returning') {
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

    if (modeRef.current === 'returning') {
      control.angle = MathUtils.damp(control.angle, auto.angle, 1.15, delta);
      control.distance = MathUtils.damp(control.distance, auto.distance, 1.15, delta);
      control.elevation = MathUtils.damp(control.elevation, auto.elevation, 1.1, delta);
      control.lookY = MathUtils.damp(control.lookY, auto.lookY, 1.1, delta);
      const d =
        Math.abs(control.angle - auto.angle) +
        Math.abs(control.distance - auto.distance) +
        Math.abs(control.elevation - auto.elevation) +
        Math.abs(control.lookY - auto.lookY);
      if (d < 0.9 && !dragRef.current.dragging) modeRef.current = 'auto';
    }

    control.distance = MathUtils.clamp(control.distance, 8, Math.max(34, radius * 3 + 24));
    control.elevation = MathUtils.clamp(control.elevation, 4, Math.max(18, maxY + radius * 0.45 + 10));
    control.lookY = MathUtils.clamp(control.lookY, 0.8, Math.max(26, maxY + 8));

    actual.angle = MathUtils.damp(actual.angle, control.angle, modeRef.current === 'auto' ? 1.6 : 2.2, delta);
    actual.distance = MathUtils.damp(actual.distance, control.distance, modeRef.current === 'auto' ? 1.5 : 2.1, delta);
    actual.elevation = MathUtils.damp(actual.elevation, control.elevation, modeRef.current === 'auto' ? 1.45 : 2.0, delta);
    actual.lookY = MathUtils.damp(actual.lookY, control.lookY, modeRef.current === 'auto' ? 1.4 : 1.9, delta);

    tempDir.set(Math.sin(actual.angle), 0, Math.cos(actual.angle));
    desiredPosition.copy(tempDir).multiplyScalar(actual.distance).setY(actual.elevation);
    desiredTarget.set(0, actual.lookY, 0);

    if (smoothPosition.lengthSq() === 0 && smoothTarget.lengthSq() === 0) {
      smoothPosition.copy(desiredPosition);
      smoothTarget.copy(desiredTarget);
    }

    smoothPosition.x = MathUtils.damp(smoothPosition.x, desiredPosition.x, modeRef.current === 'auto' ? 1.8 : 2.4, delta);
    smoothPosition.y = MathUtils.damp(smoothPosition.y, desiredPosition.y, modeRef.current === 'auto' ? 1.8 : 2.4, delta);
    smoothPosition.z = MathUtils.damp(smoothPosition.z, desiredPosition.z, modeRef.current === 'auto' ? 1.8 : 2.4, delta);

    smoothTarget.y = MathUtils.damp(smoothTarget.y, desiredTarget.y, modeRef.current === 'auto' ? 1.75 : 2.2, delta);
    smoothTarget.x = 0;
    smoothTarget.z = 0;

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
  const h = Math.max(MIN_HEIGHT, tower.height);
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
    ctx.fillStyle = 'rgba(10,13,18,0.78)';
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(247,147,26,0.72)';
    ctx.stroke();

    ctx.font = '700 142px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 16;
    ctx.shadowColor = 'rgba(247,147,26,0.55)';
    ctx.strokeStyle = 'rgba(247,147,26,0.95)';
    ctx.lineWidth = 7;
    ctx.strokeText('₿', 0, 8);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(18,22,28,0.95)';
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
              color="#171d25"
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
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: '0.01em'
          }}
        >
          {fmtUsdCompact(tower.usdNotional)}
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
          {fmtBtc(tower.btcVolume)} BTC
        </div>
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
  onHoverTower
}: {
  tower: TowerDatum;
  hoveredTowerSequence: number | null;
  isTallest: boolean;
  onHoverTower?: (sequence: number | null) => void;
}) {
  const groupRef = useRef<Group>(null);
  const coreRefs = useRef<Array<Mesh | null>>([]);
  const shellRefs = useRef<Array<Mesh | null>>([]);
  const edgeRefs = useRef<Array<Mesh | null>>([]);
  const crownRef = useRef<Mesh>(null);
  const bandRefs = useRef<Array<Mesh | null>>([]);
  const settledRef = useRef(false);
  const focusMixRef = useRef(0);
  const hoverMixRef = useRef(0);

  const glowColor = useMemo(() => new Color(tower.glowColor), [tower.glowColor]);
  const coreColor = useMemo(() => new Color(tower.coreColor), [tower.coreColor]);
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

  useEffect(() => {
    coreRefs.current.length = segments.length;
    shellRefs.current.length = segments.length;
    edgeRefs.current.length = segments.length;
    bandRefs.current.length = bandFractions.length;
  }, [segments.length, bandFractions.length]);

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
      crownMat.color.copy(tempColorA.copy(glowColor).lerp(BTC_ORANGE, hoverMixRef.current * 0.72));
    }
    if (crownMat) {
      const crownTarget =
        CROWN_OPACITY * tower.glowStrength * tower.capGlowBoost * birthGlowAlpha * focusDim * hoverBoost * (isTallest ? 1.06 : 1);
      crownMat.opacity = MathUtils.damp(crownMat.opacity ?? 0, MathUtils.clamp(crownTarget, 0, 1), 10, delta);
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
          mat.color.copy(tempColorA.copy(glowColor).lerp(BTC_ORANGE, hoverMixRef.current * 0.75));
        }
        const bandTarget = BAND_OPACITY * tower.glowStrength * birthGlowAlpha * localFade * focusDim * hoverBoost;
        mat.opacity = MathUtils.damp(mat.opacity ?? 0, MathUtils.clamp(bandTarget, 0, 1), 10, delta);
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

      {isTallest ? <TallestBtcDecals tower={tower} focusMode={focusMode} isHovered={isHovered} /> : null}

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
  focusMode = false
}: {
  bounds: SandboxBounds;
  focusMode?: boolean;
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
      uOpacity: { value: 0.86 }
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
    const safeTarget = clampFinite(targetGlowRadius, smoothGlowRadiusRef.current || 64, 30, boardSize * 0.48);
    if (!Number.isFinite(smoothGlowRadiusRef.current)) {
      smoothGlowRadiusRef.current = safeTarget;
    }
    smoothGlowRadiusRef.current = MathUtils.damp(smoothGlowRadiusRef.current, safeTarget, RADIAL_GLOW_DAMP, delta);
    const r = MathUtils.clamp(smoothGlowRadiusRef.current, 30, boardSize * 0.48);
    if (glowMeshRef.current) {
      glowMeshRef.current.scale.set(r * 2.2, r * 2.2, 1);
      glowUniforms.uOpacity.value = MathUtils.lerp(0.86, 0.62, focusMixRef.current);
    }
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
          opacity={i % 4 === 0 ? 0.055 : 0.035}
          lineWidth={i % 4 === 0 ? 1.1 : 0.8}
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
          opacity={0.18}
          lineWidth={2.2}
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
          opacity={i % 2 === 0 ? 0.22 : 0.2}
          lineWidth={3.1}
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
          opacity={0.14}
          lineWidth={2.0}
          renderOrder={2.12}
          focusMode={focusMode}
          focusDim={FOCUS_GROUND_DIM}
        />
      ))}
      <ScreenSpaceGroundLine
        points={outerRingPoints}
        y={groundGraphicY + 0.0011}
        color="#F7931A"
        opacity={0.16}
        lineWidth={2.6}
        renderOrder={2.16}
        additive
        focusMode={focusMode}
        focusDim={FOCUS_GROUND_DIM}
      />
      <ScreenSpaceGroundLine
        points={innerRingPoints}
        y={groundGraphicY + 0.00115}
        color="#f2e4cf"
        opacity={0.09}
        lineWidth={1.7}
        renderOrder={2.14}
        focusMode={focusMode}
        focusDim={FOCUS_GROUND_DIM}
      />

      <mesh position={[0, groundGraphicY + 0.002, 0]} renderOrder={3}>
        <boxGeometry args={[0.18, 0.01, arteryLen]} />
        <meshBasicMaterial
          color="#F7931A"
          transparent
          opacity={0.22 * focusStaticScale}
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
          opacity={0.11 * focusStaticScale}
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
          opacity={0.12 * focusStaticScale}
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
          opacity={0.095 * focusStaticScale}
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
  const fireflyRef = useRef<ThreeInstancedMesh>(null);
  const focusMixRef = useRef(0);
  const matrixRef = useRef(new Matrix4());
  const posRef = useRef(new Vector3());
  const sclRef = useRef(new Vector3());
  const quatRef = useRef(new Quaternion());
  const upRef = useRef(new Vector3(0, 1, 0));
  const crownColorRef = useRef(new Color());
  const trunkColorRef = useRef(new Color());

  useEffect(() => {
    patchRefs.current.length = parks.length;
    pathRefs.current.length = parks.length * 2;
  }, [parks.length]);

  useEffect(() => {
    const trunk = trunkRef.current;
    const crown = crownRef.current;
    const firefly = fireflyRef.current;
    if (!trunk || !crown || !firefly) return;

    const count = Math.min(trees.length, Math.max(1, trunk.instanceMatrix.count));
    trunk.count = count;
    crown.count = count;
    firefly.count = count;
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
      trunk.setColorAt(i, trunkColor.set('#2a241a').lerp(new Color('#3a2d1f'), tree.tintMix * 0.45));

      pos.set(tree.x, TREE_BASE_Y + tree.trunkH + tree.crownH * 0.5, tree.z);
      scl.set(tree.crownR, tree.crownH, tree.crownR);
      matrix.compose(pos, quat, scl);
      crown.setMatrixAt(i, matrix);
      crown.setColorAt(i, crownColor.set('#1a2418').lerp(new Color('#2b3321'), tree.tintMix));

      const fx = tree.x + (hash01(i, 9021) - 0.5) * tree.crownR * 0.9;
      const fz = tree.z + (hash01(i, 9029) - 0.5) * tree.crownR * 0.9;
      const fy = TREE_BASE_Y + tree.trunkH + tree.crownH * MathUtils.lerp(0.45, 0.82, hash01(i, 9037));
      pos.set(fx, fy, fz);
      scl.set(0.035 + hash01(i, 9041) * 0.025, 0.035 + hash01(i, 9047) * 0.03, 0.035 + hash01(i, 9053) * 0.025);
      matrix.compose(pos, quat, scl);
      firefly.setMatrixAt(i, matrix);
      firefly.setColorAt(i, crownColor.set('#94ffc7').lerp(new Color('#b6ffdf'), hash01(i, 9059)));
    }

    trunk.instanceMatrix.needsUpdate = true;
    crown.instanceMatrix.needsUpdate = true;
    firefly.instanceMatrix.needsUpdate = true;
    if (trunk.instanceColor) trunk.instanceColor.needsUpdate = true;
    if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
    if (firefly.instanceColor) firefly.instanceColor.needsUpdate = true;
  }, [trees.length]);

  useFrame((_, delta) => {
    focusMixRef.current = MathUtils.damp(focusMixRef.current, focusMode ? 1 : 0, 7.5, delta);
    const dimScale = MathUtils.lerp(1, FOCUS_GROUND_DIM, focusMixRef.current);
    for (let i = 0; i < patchRefs.current.length; i++) {
      const patch = patchRefs.current[i];
      const pathA = pathRefs.current[i * 2];
      const pathB = pathRefs.current[i * 2 + 1];
      const patchMat = patch?.material as { opacity?: number } | undefined;
      const pathAMat = pathA?.material as { opacity?: number } | undefined;
      const pathBMat = pathB?.material as { opacity?: number } | undefined;
      if (patchMat) patchMat.opacity = MathUtils.damp(patchMat.opacity ?? 0.92, 0.92 * dimScale, 8.5, delta);
      if (pathAMat) pathAMat.opacity = MathUtils.damp(pathAMat.opacity ?? 0.14, 0.14 * dimScale, 8.5, delta);
      if (pathBMat) pathBMat.opacity = MathUtils.damp(pathBMat.opacity ?? 0.1, 0.1 * dimScale, 8.5, delta);
    }

    const trunkMat = trunkRef.current?.material as { opacity?: number; color?: Color } | undefined;
    if (trunkMat) {
      trunkMat.opacity = MathUtils.damp(trunkMat.opacity ?? 0.96, 0.96 * dimScale, 8.5, delta);
      if (trunkMat.color) trunkMat.color.copy(tempColorA.set('#2e261c').lerp(tempColorB.set('#211d18'), focusMixRef.current * 0.7));
    }
    const crownMat = crownRef.current?.material as { opacity?: number; color?: Color } | undefined;
    if (crownMat) {
      crownMat.opacity = MathUtils.damp(crownMat.opacity ?? 0.94, 0.94 * dimScale, 8.5, delta);
      if (crownMat.color) crownMat.color.copy(tempColorA.set('#27301f').lerp(tempColorB.set('#1a2016'), focusMixRef.current * 0.8));
    }
    const fireflyMat = fireflyRef.current?.material as { opacity?: number } | undefined;
    if (fireflyMat) {
      fireflyMat.opacity = MathUtils.damp(fireflyMat.opacity ?? 0.24, 0.24 * dimScale, 8.5, delta);
    }
  });

  return (
    <group>
      {parks.map((park, parkIndex) => {
        const lineLen = Math.min(park.w, park.d) * MathUtils.lerp(0.42, 0.78, hash01(parkIndex, park.w, park.d, 8011));
        return (
          <group
            key={park.id}
            position={[park.x, PARK_PATCH_Y, park.z]}
            rotation={[-Math.PI / 2, park.yaw, 0]}
            renderOrder={2.55}
          >
            <mesh
              ref={(el) => {
                patchRefs.current[parkIndex] = el;
              }}
              renderOrder={2.55}
            >
              <planeGeometry args={[park.w, park.d]} />
              <meshStandardMaterial
                color={park.patchColor}
                roughness={0.97}
                metalness={0.03}
                emissive="#101710"
                emissiveIntensity={0.025}
                transparent
                opacity={0.92}
                depthTest
                depthWrite
                polygonOffset
                polygonOffsetFactor={-1}
                polygonOffsetUnits={-1}
              />
            </mesh>
            <mesh position={[0, 0.004, 0]} renderOrder={2.57}>
              <planeGeometry args={[park.w * 1.03, park.d * 1.03]} />
              <meshBasicMaterial
                color="#63d89b"
                transparent
                opacity={0.06}
                toneMapped={false}
                depthTest
                depthWrite={false}
                blending={AdditiveBlending}
                polygonOffset
                polygonOffsetFactor={-1}
                polygonOffsetUnits={-1}
              />
            </mesh>

            <mesh position={[0, 0.003, 0]} renderOrder={2.58}>
              <boxGeometry args={[park.w * 0.98, 0.01, 0.04]} />
              <meshBasicMaterial
                color={park.edgeColor}
                transparent
                opacity={0.08}
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
                opacity={0.08}
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
                opacity={0.08}
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
                opacity={0.08}
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
                color="#f7d8ac"
                transparent
                opacity={0.14}
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
                opacity={0.1}
                toneMapped={false}
                depthTest
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={-1}
                polygonOffsetUnits={-2}
              />
            </mesh>
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
          opacity={0.94}
          toneMapped={false}
          depthTest
          depthWrite
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
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
  focusMode = false
}: {
  traces: TraceDatum[];
  focusMode?: boolean;
}) {
  const { camera } = useThree();
  const glowRefs = useRef<Array<Mesh | null>>([]);
  const coreRefs = useRef<Array<Mesh | null>>([]);
  const focusMixRef = useRef(0);

  useEffect(() => {
    glowRefs.current.length = traces.length;
    coreRefs.current.length = traces.length;
  }, [traces.length]);

  useFrame((_, delta) => {
    const visCurve = distanceVisibilityCurve(camera.position.length());
    focusMixRef.current = MathUtils.damp(focusMixRef.current, focusMode ? 1 : 0, 7.5, delta);
    const glowWidthScale = MathUtils.lerp(1, 2.4, visCurve);
    const coreWidthScale = MathUtils.lerp(1, 1.95, visCurve);
    const dimScale = MathUtils.lerp(1, FOCUS_TRACE_DIM, focusMixRef.current);
    const glowOpacity = MathUtils.lerp(0.13, 0.22, visCurve) * dimScale;
    const coreOpacity = MathUtils.lerp(0.62, 0.82, visCurve) * dimScale;
    for (let i = 0; i < traces.length; i++) {
      const glow = glowRefs.current[i];
      const core = coreRefs.current[i];
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
    }
  });

  return (
    <group>
      {/* Render band 4: depth-tested traces above ground graphics, below traffic/towers */}
      {traces.map((trace, i) => (
        <group key={trace.id} position={[trace.midX, trace.y, trace.midZ]} rotation={[0, trace.yaw, 0]} renderOrder={4}>
          <mesh
            position={[0, -0.0016, 0]}
            renderOrder={4}
            ref={(el) => {
              glowRefs.current[i] = el;
            }}
          >
            <boxGeometry args={[trace.glowWidth, 0.012, trace.length]} />
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
            renderOrder={4.1}
            ref={(el) => {
              coreRefs.current[i] = el;
            }}
          >
            <boxGeometry args={[trace.width, 0.014, trace.length]} />
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

function SandboxScene({
  towers,
  traces,
  trafficParticles,
  parks,
  parkTrees,
  bounds,
  hoveredTowerSequence,
  tallestTowerSequence,
  onHoverTowerChange,
  onHoverHudUpdate,
  onCameraDebug
}: {
  towers: TowerDatum[];
  traces: TraceDatum[];
  trafficParticles: TrafficParticleDatum[];
  parks: ParkDatum[];
  parkTrees: ParkTreeDatum[];
  bounds: SandboxBounds;
  hoveredTowerSequence: number | null;
  tallestTowerSequence: number | null;
  onHoverTowerChange?: (sequence: number | null) => void;
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

  useFrame(() => {
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
  });

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
      <ambientLight intensity={0.32} color="#9bb8d6" />
      <hemisphereLight args={['#9cc4ee', '#090b10', 0.34]} />
      <directionalLight position={[10, 18, 8]} intensity={0.72} color="#d6e8ff" castShadow={RUNTIME_QUALITY_CONFIG.shadows} />
      <directionalLight position={[-14, 20, -10]} intensity={0.34} color="#7fd3ff" />
      <MinimalOrbitRig bounds={bounds} onCameraDebug={onCameraDebug} />

      <CircuitBoardGround bounds={bounds} focusMode={focusMode} />
      <ParksLayer parks={parks} trees={parkTrees} focusMode={focusMode} />
      <TraceStrips traces={traces} focusMode={focusMode} />
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
    </Canvas>
  );
}

export function MinimalVizSandbox() {
  const { events, latest } = useBlockEventStore();
  const {
    towers,
    traces,
    trafficParticles,
    parks,
    parkTrees,
    bounds,
    latestHeightDebug,
    tallestTowerSequence,
    tallestTowerHeight,
    parksAttempted,
    parksPlaced,
    lastParkSkipReason
  } = useAppendOnlyTowers(events);
  const [cameraDebug, setCameraDebug] = useState<CameraDebugSnapshot>({ camDist: 0, visCurve: 0 });
  const [hoveredTowerSequence, setHoveredTowerSequence] = useState<number | null>(null);
  const [hoverHud, setHoverHud] = useState<HoverHudSnapshot>(HOVER_HUD_HIDDEN);

  useEffect(() => {
    if (hoveredTowerSequence == null) return;
    if (!towers.some((tower) => tower.sequence === hoveredTowerSequence)) {
      setHoveredTowerSequence(null);
    }
  }, [hoveredTowerSequence, towers]);

  useEffect(() => {
    if (hoveredTowerSequence == null && hoverHud.visible) {
      setHoverHud(HOVER_HUD_HIDDEN);
    }
  }, [hoveredTowerSequence, hoverHud.visible]);

  const hoveredTower = useMemo(
    () => (hoveredTowerSequence == null ? null : towers.find((tower) => tower.sequence === hoveredTowerSequence) ?? null),
    [hoveredTowerSequence, towers]
  );

  const overlay = useMemo(
    () => ({
      feedMode: latest?.feedMode ?? 'auto',
      latestSequence: latest?.sequence ?? 0,
      towerCount: towers.length,
      traceCount: traces.length,
      trafficCount: trafficParticles.length,
      parkCount: parks.length,
      parksAttempted,
      parksPlaced,
      lastParkSkipReason,
      cityRadius: bounds.radius,
      glowRadius: Math.max(30, bounds.radius * RADIAL_GLOW_RADIUS_MULT),
      camDist: cameraDebug.camDist,
      visCurve: cameraDebug.visCurve,
      hoveredTowerSequence,
      tallestTowerSequence,
      tallestTowerHeight
    }),
    [
      latest,
      towers.length,
      traces.length,
      trafficParticles.length,
      parks.length,
      parksAttempted,
      parksPlaced,
      lastParkSkipReason,
      bounds.radius,
      cameraDebug.camDist,
      cameraDebug.visCurve,
      hoveredTowerSequence,
      tallestTowerSequence,
      tallestTowerHeight
    ]
  );

  return (
    <div className="minimal-viz">
      <SandboxScene
        towers={towers}
        traces={traces}
        trafficParticles={trafficParticles}
        parks={parks}
        parkTrees={parkTrees}
        bounds={bounds}
        hoveredTowerSequence={hoveredTowerSequence}
        tallestTowerSequence={tallestTowerSequence}
        onHoverTowerChange={setHoveredTowerSequence}
        onHoverHudUpdate={setHoverHud}
        onCameraDebug={setCameraDebug}
      />
      <HoverHudOverlay tower={hoveredTower} hud={hoverHud} />
      <div className="minimal-viz__overlay" aria-hidden="true">
        <div className="minimal-viz__panel">
          <div className="minimal-viz__title">Sandbox</div>
          <div className="minimal-viz__row">
            <span>Feed</span>
            <span>{overlay.feedMode}</span>
          </div>
          <div className="minimal-viz__row">
            <span>Latest Seq</span>
            <span>{overlay.latestSequence}</span>
          </div>
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
            <span>Parks</span>
            <span>{overlay.parkCount}</span>
          </div>
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
          {latestHeightDebug ? (
            <>
              <div className="minimal-viz__row">
                <span>Vol</span>
                <span>{fmtCompact(latestHeightDebug.totalVolume)}</span>
              </div>
              <div className="minimal-viz__row">
                <span>logV</span>
                <span>{fmtFixed(latestHeightDebug.logV, 2)}</span>
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
                <span>EMA V</span>
                <span>
                  {fmtFixed(latestHeightDebug.meanLogV, 2)}/{fmtFixed(latestHeightDebug.stdLogV, 2)}
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
