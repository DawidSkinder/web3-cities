import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Group, Mesh } from 'three';
import {
  AdditiveBlending,
  ACESFilmicToneMapping,
  Color,
  MathUtils,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3
} from 'three';
import { useBlockEventStore } from '../data/trades/blockEventStore';
import type { BlockEvent } from '../data/trades/types';
import { RUNTIME_QUALITY_CONFIG } from './runtimeQuality';

type TowerDatum = {
  sequence: number;
  x: number;
  z: number;
  height: number;
  archetypeId: 0 | 1 | 2 | 3;
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
  capGlowBoost: number;
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

type TowerSegmentSpec = {
  id: string;
  y: number;
  height: number;
  sx: number;
  sz: number;
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
  baseW: number;
  baseD: number;
  meanLogV: number;
  stdLogV: number;
  meanI: number;
  stdI: number;
};

type AccumState = {
  processedSequences: Set<number>;
  towers: TowerDatum[];
  traces: TraceDatum[];
  trafficParticles: TrafficParticleDatum[];
  traceKeySet: Set<string>;
  lastSequence: number;
  bounds: SandboxBounds;
  ema: EmaStats;
  latestHeightDebug: HeightDebugSnapshot | null;
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
const MAX_HEIGHT = 30;
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

function clampFinite(value: number, fallback: number, min?: number, max?: number) {
  const safe = Number.isFinite(value) ? value : fallback;
  return MathUtils.clamp(safe, min ?? safe, max ?? safe);
}

const compactNumber = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2
});

function fmtCompact(v: number) {
  if (!Number.isFinite(v)) return '0';
  return compactNumber.format(Math.max(0, v));
}

function fmtFixed(v: number, digits = 2) {
  if (!Number.isFinite(v)) return '0';
  return v.toFixed(digits);
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
  archetypeId: 0 | 1 | 2 | 3;
  baseW: number;
  baseD: number;
  footprintX: number;
  footprintZ: number;
  taper: number;
  podiumRatio: number;
  crownRatio: number;
} {
  const archetypePick = hash01(sequence, 101);
  const archetypeId: 0 | 1 | 2 | 3 =
    archetypePick < 0.34 ? 0 : archetypePick < 0.62 ? 1 : archetypePick < 0.84 ? 2 : 3;

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
    latestHeightDebug: null
  };
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
    const y = 0.018 + i * 0.001;

    const traceId = `T-${traceKey}`;
    state.traces.push({
      id: traceId,
      aSequence: aSeq,
      bSequence: bSeq,
      midX: seg.midX,
      midZ: seg.midZ,
      length: Math.max(0.9, seg.length - TOWER_FOOTPRINT * 0.7),
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
        ax: tower.x,
        az: tower.z,
        bx: neighbor.x,
        bz: neighbor.z,
        yaw: seg.yaw,
        y: y + 0.008,
        speed,
        phase,
        color: `#${particleColor.getHexString()}`,
        sizeX: 0.085 + hash01(aSeq, bSeq, p, 47) * 0.03,
        sizeY: 0.05,
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

  const height = MathUtils.clamp(MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * Math.pow(score, HEIGHT_GAMMA), MIN_HEIGHT, MAX_HEIGHT);

  const dominance = MathUtils.clamp(clampFinite(event.metrics.imbalance, 0), -1, 1);
  const imbalance = Math.abs(dominance);
  const dominance01 = (dominance + 1) * 0.5;
  const glow = BTC_SELL_WARM.clone().lerp(BTC_PALE_AMBER, 0.38).lerp(BTC_ORANGE, dominance01);
  const core = CORE_GRAPHITE.clone().lerp(CORE_GRAPHITE_HI, 0.2 + imbalance * 0.22);
  const glowStrength = MathUtils.clamp(0.7 + intensity * 0.45 + imbalance * 0.55, 0.75, 1.55);
  const bandCount = (2 + Math.min(2, Math.floor(imbalance * 3))) as 2 | 3 | 4;
  const capGlowBoost = MathUtils.lerp(0.9, 1.35, Math.pow(score, 1.05));
  const shape = buildTowerShapeParams(event.sequence, score);

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
    baseW: shape.baseW,
    baseD: shape.baseD,
    meanLogV: ema.meanLogV,
    stdLogV: emaStd(ema.varLogV),
    meanI: ema.meanI,
    stdI: emaStd(ema.varI)
  };

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
    capGlowBoost,
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
    bounds: accumRef.current.bounds,
    latestHeightDebug: accumRef.current.latestHeightDebug
  };
}

function MinimalOrbitRig({ bounds }: { bounds: SandboxBounds }) {
  const { camera, gl } = useThree();
  const initializedRef = useRef(false);
  const modeRef = useRef<CameraMode>('auto');
  const lastInteractionRef = useRef(0);

  const actualRef = useRef<OrbitState>({ angle: 0, distance: 28, elevation: 12, lookY: 4 });
  const controlRef = useRef<OrbitState>({ angle: 0, distance: 28, elevation: 12, lookY: 4 });
  const autoRef = useRef<OrbitState>({ angle: 0, distance: 28, elevation: 12, lookY: 4 });

  const keysRef = useRef<Record<string, boolean>>({});
  const dragRef = useRef({ dragging: false, pointerId: -1, lastX: 0, lastY: 0 });

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
  } else {
    const crownH = MathUtils.clamp(h * tower.crownRatio, 0.35, h * 0.18);
    const shaftH = Math.max(0.6, h - crownH);
    const lowerH = shaftH * 0.68;
    const upperH = Math.max(0.4, shaftH - lowerH);
    pushSegment('lower', lowerH, fx * 1.04, fz * 1.04);
    pushSegment('upper', upperH, fx * (0.92 - taperAmt * 0.35), fz * (0.92 - taperAmt * 0.35));
    pushSegment('crown-block', crownH, fx * (0.72 - taperAmt * 0.2), fz * (0.72 - taperAmt * 0.2));
  }

  if (segments.length > 0) {
    segments[segments.length - 1].isTop = true;
  }

  return segments;
}

function AnimatedHoloTower({ tower }: { tower: TowerDatum }) {
  const groupRef = useRef<Group>(null);
  const shellRefs = useRef<Array<Mesh | null>>([]);
  const edgeRefs = useRef<Array<Mesh | null>>([]);
  const crownRef = useRef<Mesh>(null);
  const bandRefs = useRef<Array<Mesh | null>>([]);
  const settledRef = useRef(false);

  const glowColor = useMemo(() => new Color(tower.glowColor), [tower.glowColor]);
  const coreColor = useMemo(() => new Color(tower.coreColor), [tower.coreColor]);
  const segments = useMemo(() => buildTowerSegments(tower), [tower]);
  const topSegment = segments[segments.length - 1] ?? null;
  const bandFractions = useMemo(() => {
    const base = [0.2, 0.42, 0.66, 0.86];
    const wobble = ((tower.sequence % 17) - 8) * 0.0025;
    return base.map((v, i) => MathUtils.clamp(v + wobble * (i + 1), 0.12, 0.92));
  }, [tower.sequence]);

  useEffect(() => {
    shellRefs.current.length = segments.length;
    edgeRefs.current.length = segments.length;
    bandRefs.current.length = bandFractions.length;
  }, [segments.length, bandFractions.length]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    if (settledRef.current) return;

    const now = Date.now();
    const elapsed = now - tower.emittedAt;
    const riseT = MathUtils.clamp(elapsed / BIRTH_RISE_MS, 0, 1);
    const riseScaleY = Math.max(0.0001, easeOutBack(riseT, BIRTH_OVERSHOOT));
    group.scale.y = riseScaleY;

    const glowT = MathUtils.clamp((elapsed - BIRTH_GLOW_DELAY_MS) / BIRTH_GLOW_RAMP_MS, 0, 1);
    const glowAlpha = easeOutCubic(glowT);

    const crownMat = crownRef.current?.material as { opacity?: number } | undefined;
    if (crownMat) crownMat.opacity = MathUtils.clamp(CROWN_OPACITY * tower.glowStrength * tower.capGlowBoost * glowAlpha, 0, 1);

    for (let i = 0; i < segments.length; i++) {
      const shell = shellRefs.current[i];
      const edge = edgeRefs.current[i];
      const segBoost = segments[i]?.isTop ? 1.08 : 1;
      const shellMat = shell?.material as { opacity?: number } | undefined;
      const edgeMat = edge?.material as { opacity?: number } | undefined;
      if (shellMat) shellMat.opacity = MathUtils.clamp(GLOW_SHELL_OPACITY * tower.glowStrength * segBoost * glowAlpha, 0, 1);
      if (edgeMat) edgeMat.opacity = MathUtils.clamp(GLOW_EDGE_OPACITY * tower.glowStrength * segBoost * glowAlpha, 0, 1);
    }

    for (let i = 0; i < bandRefs.current.length; i++) {
      const band = bandRefs.current[i];
      if (!band) continue;
      band.visible = i < tower.bandCount;
      const mat = band.material as { opacity?: number } | undefined;
      if (mat) {
        const localFade = 0.9 - i * 0.08;
        mat.opacity = MathUtils.clamp(BAND_OPACITY * tower.glowStrength * glowAlpha * localFade, 0, 1);
      }
    }

    if (riseT >= 1 && glowT >= 1) {
      group.scale.y = 1;
      settledRef.current = true;
    }
  });

  return (
    <group ref={groupRef} position={[tower.x, 0, tower.z]} scale={[1, 0.0001, 1]}>
      {segments.map((seg, i) => (
        <group key={`${tower.sequence}-seg-${seg.id}-${i}`} position={[0, seg.y, 0]}>
          <mesh castShadow={RUNTIME_QUALITY_CONFIG.shadows} receiveShadow={RUNTIME_QUALITY_CONFIG.shadows}>
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
          <mesh
            ref={(el) => {
              shellRefs.current[i] = el;
            }}
            scale={[GLOW_SHELL_SCALE, 1.002, GLOW_SHELL_SCALE]}
          >
            <boxGeometry args={[seg.sx, seg.height, seg.sz]} />
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
          <mesh
            ref={(el) => {
              edgeRefs.current[i] = el;
            }}
            scale={[GLOW_EDGE_SCALE, 1.006, GLOW_EDGE_SCALE]}
          >
            <boxGeometry args={[seg.sx, seg.height, seg.sz]} />
            <meshBasicMaterial
              color={glowColor}
              wireframe
              transparent
              opacity={0}
              toneMapped={false}
              depthTest
              depthWrite={false}
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

      <mesh ref={crownRef} position={[0, tower.height + 0.08, 0]}>
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

function CircuitBoardGround({ bounds }: { bounds: SandboxBounds }) {
  const boardSize = MathUtils.clamp(Math.max(420, bounds.radius * 8 + 180), 420, 1400);
  const targetGlowRadius = clampFinite(Math.max(30, bounds.radius * RADIAL_GLOW_RADIUS_MULT), 64, 30, boardSize * 0.48);
  const panelStep = 24;
  const arteryLen = Math.min(boardSize * 0.92, Math.max(140, bounds.radius * 3.6));
  const glowMeshRef = useRef<Mesh>(null);
  const ringRef = useRef<Mesh>(null);
  const smoothGlowRadiusRef = useRef(targetGlowRadius);
  const glowGeometry = useMemo(() => new PlaneGeometry(1, 1, 1, 1), []);
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
  const panelOffsets = useMemo(() => {
    const values: number[] = [];
    const half = boardSize * 0.5;
    for (let v = -half; v <= half; v += panelStep) {
      values.push(v);
    }
    return values;
  }, [boardSize]);

  useEffect(() => {
    return () => {
      glowGeometry.dispose();
      glowMaterial.dispose();
    };
  }, [glowGeometry, glowMaterial]);

  useFrame(({ clock }, delta) => {
    const safeTarget = clampFinite(targetGlowRadius, smoothGlowRadiusRef.current || 64, 30, boardSize * 0.48);
    if (!Number.isFinite(smoothGlowRadiusRef.current)) {
      smoothGlowRadiusRef.current = safeTarget;
    }
    smoothGlowRadiusRef.current = MathUtils.damp(smoothGlowRadiusRef.current, safeTarget, RADIAL_GLOW_DAMP, delta);
    const r = MathUtils.clamp(smoothGlowRadiusRef.current, 30, boardSize * 0.48);
    if (glowMeshRef.current) {
      glowMeshRef.current.scale.set(r * 2.2, r * 2.2, 1);
      glowUniforms.uOpacity.value = 0.86;
    }
    if (ringRef.current) {
      ringRef.current.scale.set(r * 0.9, r * 0.9, 1);
      const pulse = RUNTIME_QUALITY_CONFIG.reducedMotion ? 0 : Math.sin(clock.getElapsedTime() * 0.22) * 0.02;
      const mat = ringRef.current.material as { opacity?: number } | undefined;
      if (mat) {
        mat.opacity = 0.08 + pulse;
      }
    }
  });

  return (
    <group>
      <mesh
        ref={glowMeshRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.05, 0]}
        scale={[targetGlowRadius * 2.2, targetGlowRadius * 2.2, 1]}
        renderOrder={1}
        geometry={glowGeometry}
        material={glowMaterial}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.065, 0]} receiveShadow renderOrder={0}>
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

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} renderOrder={0}>
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

      {panelOffsets.map((x) => (
        <mesh key={`panel-v-${x}`} position={[x, -0.038, 0]} renderOrder={2}>
          <boxGeometry args={[0.08, 0.006, boardSize * 0.94]} />
          <meshBasicMaterial color="#101821" transparent opacity={0.26} toneMapped={false} depthWrite={false} depthTest />
        </mesh>
      ))}
      {panelOffsets.map((z) => (
        <mesh key={`panel-h-${z}`} position={[0, -0.038, z]} renderOrder={2}>
          <boxGeometry args={[boardSize * 0.94, 0.006, 0.08]} />
          <meshBasicMaterial color="#101821" transparent opacity={0.22} toneMapped={false} depthWrite={false} depthTest />
        </mesh>
      ))}

      <gridHelper
        args={[boardSize * 0.95, Math.max(48, Math.round(boardSize / 5)), new Color('#1f2833'), new Color('#121922')]}
        position={[0, -0.03, 0]}
        renderOrder={2}
        material-transparent
        material-opacity={0.09}
        material-depthWrite={false}
        material-depthTest={true}
        material-toneMapped={false}
        material-blending={AdditiveBlending}
      />

      <mesh
        ref={ringRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.026, 0]}
        scale={[targetGlowRadius * 0.9, targetGlowRadius * 0.9, 1]}
        renderOrder={3}
      >
        <ringGeometry args={[0.96, 1, 96]} />
        <meshBasicMaterial
          color="#F7931A"
          transparent
          opacity={0.08}
          toneMapped={false}
          depthWrite={false}
          depthTest
          blending={AdditiveBlending}
        />
      </mesh>

      <mesh position={[0, -0.024, 0]} renderOrder={3}>
        <boxGeometry args={[0.18, 0.01, arteryLen]} />
        <meshBasicMaterial color="#F7931A" transparent opacity={0.22} toneMapped={false} depthWrite={false} depthTest />
      </mesh>
      <mesh position={[0, -0.023, 0]} renderOrder={3}>
        <boxGeometry args={[arteryLen * 0.72, 0.01, 0.16]} />
        <meshBasicMaterial color="#f4e8d6" transparent opacity={0.11} toneMapped={false} depthWrite={false} depthTest />
      </mesh>
      <mesh rotation={[0, Math.PI / 4, 0]} position={[0, -0.022, 0]} renderOrder={3}>
        <boxGeometry args={[0.12, 0.008, arteryLen * 0.8]} />
        <meshBasicMaterial color="#F7931A" transparent opacity={0.09} toneMapped={false} depthWrite={false} depthTest />
      </mesh>
      <mesh rotation={[0, -Math.PI / 4, 0]} position={[0, -0.022, 0]} renderOrder={3}>
        <boxGeometry args={[0.12, 0.008, arteryLen * 0.62]} />
        <meshBasicMaterial color="#ffe7c4" transparent opacity={0.07} toneMapped={false} depthWrite={false} depthTest />
      </mesh>
    </group>
  );
}

function TraceStrips({ traces }: { traces: TraceDatum[] }) {
  return (
    <group>
      {traces.map((trace) => (
        <group key={trace.id} position={[trace.midX, trace.y, trace.midZ]} rotation={[0, trace.yaw, 0]} renderOrder={4}>
          <mesh renderOrder={4}>
            <boxGeometry args={[trace.glowWidth, 0.012, trace.length]} />
            <meshBasicMaterial
              color={trace.glowColor}
              transparent
              opacity={0.11}
              toneMapped={false}
              depthWrite={false}
              depthTest
              blending={AdditiveBlending}
            />
          </mesh>
          <mesh position={[0, 0.004, 0]} renderOrder={4}>
            <boxGeometry args={[trace.width, 0.014, trace.length]} />
            <meshBasicMaterial
              color={trace.coreColor}
              transparent
              opacity={0.58}
              toneMapped={false}
              depthWrite={false}
              depthTest
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function TrafficParticles({ particles }: { particles: TrafficParticleDatum[] }) {
  const refs = useRef<Array<Mesh | null>>([]);

  useEffect(() => {
    refs.current.length = particles.length;
  }, [particles.length]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    for (let i = 0; i < particles.length; i++) {
      const mesh = refs.current[i];
      const p = particles[i];
      if (!mesh || !p) continue;
      const u = (p.phase + t * p.speed) % 1;
      mesh.position.set(MathUtils.lerp(p.ax, p.bx, u), p.y, MathUtils.lerp(p.az, p.bz, u));
      mesh.rotation.set(0, p.yaw, 0);
    }
  });

  return (
    <group>
      {particles.map((p, i) => (
        <mesh
          key={p.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[p.ax, p.y, p.az]}
          renderOrder={5}
        >
          <boxGeometry args={[p.sizeX, p.sizeY, p.sizeZ]} />
          <meshBasicMaterial
            color={p.color}
            transparent
            opacity={0.74}
            toneMapped={false}
            depthWrite={false}
            depthTest
            blending={AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

function SandboxScene({
  towers,
  traces,
  trafficParticles,
  bounds
}: {
  towers: TowerDatum[];
  traces: TraceDatum[];
  trafficParticles: TrafficParticleDatum[];
  bounds: SandboxBounds;
}) {
  return (
    <Canvas
      camera={{ position: [20, 12, 20], fov: 50, near: 0.15, far: 420 }}
      dpr={[1, RUNTIME_QUALITY_CONFIG.dprCap]}
      gl={{ antialias: RUNTIME_QUALITY_CONFIG.antialias, alpha: false, powerPreference: 'high-performance' }}
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
      <MinimalOrbitRig bounds={bounds} />

      <CircuitBoardGround bounds={bounds} />
      <TraceStrips traces={traces} />
      <TrafficParticles particles={trafficParticles} />

      <group renderOrder={6}>
        {towers.map((tower) => (
          <AnimatedHoloTower key={tower.sequence} tower={tower} />
        ))}
      </group>
    </Canvas>
  );
}

export function MinimalVizSandbox() {
  const { events, latest } = useBlockEventStore();
  const { towers, traces, trafficParticles, bounds, latestHeightDebug } = useAppendOnlyTowers(events);

  const overlay = useMemo(
    () => ({
      feedMode: latest?.feedMode ?? 'auto',
      latestSequence: latest?.sequence ?? 0,
      towerCount: towers.length,
      traceCount: traces.length,
      trafficCount: trafficParticles.length,
      cityRadius: bounds.radius,
      glowRadius: Math.max(30, bounds.radius * RADIAL_GLOW_RADIUS_MULT)
    }),
    [latest, towers.length, traces.length, trafficParticles.length, bounds.radius]
  );

  return (
    <div className="minimal-viz">
      <SandboxScene towers={towers} traces={traces} trafficParticles={trafficParticles} bounds={bounds} />
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
            <span>CityRadius</span>
            <span>{fmtFixed(overlay.cityRadius, 1)}</span>
          </div>
          <div className="minimal-viz__row">
            <span>GlowRadius</span>
            <span>{fmtFixed(overlay.glowRadius, 1)}</span>
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
