import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { InstancedMesh } from 'three';
import { AdditiveBlending, Color, MathUtils, Object3D } from 'three';
import { useBlockEventStore } from '../data/trades/blockEventStore';
import type { BlockEvent } from '../data/trades/types';
import {
  clearHoveredTowerInstance,
  publishCitySceneData,
  setHoveredTowerInstance,
  useCitySceneStore
} from './citySceneStore';
import { RUNTIME_QUALITY_CONFIG } from './runtimeQuality';
import { DEBUG_VIEW_ENABLED } from './viewFlags';

type SolidInstance = {
  position: [number, number, number];
  rotationY: number;
  size: [number, number, number];
  color: Color;
  birthAtMs: number;
  riseDelayMs: number;
  riseDurationMs: number;
  districtSeq?: number;
};

type LightInstance = SolidInstance & {
  opacity: number;
  pulseAmp?: number;
  pulseSpeed?: number;
  pulsePhase?: number;
  slideAxis?: 'x' | 'z';
  slideSpan?: number;
  slideSpeed?: number;
  slidePhase?: number;
};

type TowerHoverMeta = {
  buildingId: string;
  districtId: string;
  sequence: number;
  tier: 'podium' | 'shaft' | 'spire';
  tierHeight: number;
  totalHeight: number;
  buyVolume: number;
  sellVolume: number;
  intensity: number;
  tradeCount: number;
  dominance: number;
  timestamp: number;
  source: string;
};

type DistrictRecord = {
  sequence: number;
  centerX: number;
  centerZ: number;
  radialDistance: number;
  parentIndex: number | null;
  linkAIndex: number | null;
  linkBIndex: number | null;
  nodeY: number;
  plotW: number;
  plotD: number;
  yaw: number;
};

type MutableBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
  frontierX: number;
  frontierZ: number;
  frontierSeq: number;
};

type CityAccumState = {
  districts: DistrictRecord[];
  processedSequences: Set<number>;
  lastProcessedSequence: number;
  shadowPads: LightInstance[];
  districtPlinths: SolidInstance[];
  districtDecks: SolidInstance[];
  traceDecks: SolidInstance[];
  traceLights: LightInstance[];
  nodeLights: LightInstance[];
  pulseLights: LightInstance[];
  towerCores: SolidInstance[];
  towerWireframes: LightInstance[];
  towerBands: LightInstance[];
  towerCaps: LightInstance[];
  trafficLights: LightInstance[];
  towerMeta: TowerHoverMeta[];
  bounds: MutableBounds | null;
};

const TIER_SCALE =
  RUNTIME_QUALITY_CONFIG.tier === 'low' ? 0.62 : RUNTIME_QUALITY_CONFIG.tier === 'medium' ? 0.82 : 1;
const HISTORY_CAP_DISTRICTS = Math.max(48, Math.min(180, RUNTIME_QUALITY_CONFIG.historyCap * 3));
const MAX_SHADOW_PAD_INSTANCES = Math.max(96, Math.floor(700 * TIER_SCALE));
const MAX_DISTRICT_PLINTH_INSTANCES = Math.max(96, Math.floor(700 * TIER_SCALE));
const MAX_DISTRICT_DECK_INSTANCES = Math.max(220, Math.floor(1600 * TIER_SCALE));
const MAX_TRACE_DECK_INSTANCES = Math.max(240, Math.floor(2000 * TIER_SCALE));
const MAX_TRACE_LIGHT_INSTANCES = Math.max(320, Math.floor(2800 * TIER_SCALE));
const MAX_NODE_LIGHT_INSTANCES = Math.max(220, Math.floor(1400 * TIER_SCALE));
const MAX_PULSE_LIGHT_INSTANCES = Math.max(220, Math.floor(1600 * TIER_SCALE));
const MAX_TOWER_CORE_INSTANCES = Math.max(420, Math.floor(3200 * TIER_SCALE));
const MAX_TOWER_WIREFRAME_INSTANCES = MAX_TOWER_CORE_INSTANCES;
const MAX_TOWER_BAND_INSTANCES = Math.max(380, Math.floor(3000 * TIER_SCALE));
const MAX_TOWER_CAP_INSTANCES = Math.max(320, Math.floor(2200 * TIER_SCALE));
const MAX_TRAFFIC_LIGHT_INSTANCES = Math.max(100, Math.floor(1800 * TIER_SCALE));

const OUTER_FRONTIER_COUNT = 12;
const PLACEMENT_ATTEMPTS = 26;
const MIN_DISTRICT_DISTANCE = 10.5;
const BASE_STEP_MIN = 11.5;
const BASE_STEP_MAX = 20.5;
const OUTWARD_BIAS = 0.58;

const tempObject = new Object3D();
let invalidWarnCount = 0;
let runtimeWarnCount = 0;
let hoverWarnCount = 0;

function warnInvalid(kind: string, seq: number, reason: string) {
  if (invalidWarnCount >= 60) return;
  invalidWarnCount += 1;
  console.warn(`[BTC Spot City][holo-v3] skipped ${kind} seq=${seq}: ${reason}`);
}

function warnRuntime(kind: string, error: unknown) {
  if (runtimeWarnCount >= 12) return;
  runtimeWarnCount += 1;
  console.warn(`[BTC Spot City][holo-v3] ${kind}: ${error instanceof Error ? error.message : String(error)}`);
}

function warnHover(error: unknown) {
  if (hoverWarnCount >= 8) return;
  hoverWarnCount += 1;
  console.warn(`[BTC Spot City][holo-v3] hover: ${error instanceof Error ? error.message : String(error)}`);
}

function clampFinite(value: number, fallback: number, min?: number, max?: number) {
  const safe = Number.isFinite(value) ? value : fallback;
  return MathUtils.clamp(safe, min ?? safe, max ?? safe);
}

function easeOutCubic(v: number) {
  const t = MathUtils.clamp(v, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function isFiniteTuple3(v: [number, number, number]) {
  return Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
}

function validateSolid(kind: string, sequence: number, item: SolidInstance) {
  if (!isFiniteTuple3(item.position) || !isFiniteTuple3(item.size)) {
    warnInvalid(kind, sequence, 'invalid transform');
    return false;
  }
  if (!Number.isFinite(item.rotationY)) {
    warnInvalid(kind, sequence, 'invalid rotation');
    return false;
  }
  if (item.size[0] <= 0 || item.size[1] <= 0 || item.size[2] <= 0) {
    warnInvalid(kind, sequence, 'non-positive size');
    return false;
  }
  return true;
}

function validateLight(kind: string, sequence: number, item: LightInstance) {
  if (!validateSolid(kind, sequence, item)) return false;
  if (!Number.isFinite(item.opacity) || item.opacity <= 0) {
    warnInvalid(kind, sequence, 'invalid opacity');
    return false;
  }
  return true;
}

function pushSolid(target: SolidInstance[], maxCount: number, kind: string, sequence: number, item: SolidInstance) {
  if (target.length >= maxCount) return false;
  if (!validateSolid(kind, sequence, item)) return false;
  target.push(item);
  return true;
}

function pushLight(target: LightInstance[], maxCount: number, kind: string, sequence: number, item: LightInstance) {
  if (target.length >= maxCount) return false;
  if (!validateLight(kind, sequence, item)) return false;
  target.push(item);
  return true;
}

function createEmptyAccumState(): CityAccumState {
  return {
    districts: [],
    processedSequences: new Set<number>(),
    lastProcessedSequence: 0,
    shadowPads: [],
    districtPlinths: [],
    districtDecks: [],
    traceDecks: [],
    traceLights: [],
    nodeLights: [],
    pulseLights: [],
    towerCores: [],
    towerWireframes: [],
    towerBands: [],
    towerCaps: [],
    trafficLights: [],
    towerMeta: [],
    bounds: null
  };
}

function hashSeed(sequence: number, windowStart: number) {
  let h = (sequence * 0x9e3779b1) ^ (windowStart | 0);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return (((r ^ (r >>> 14)) >>> 0) / 4294967296);
  };
}

function rotateLocal(x: number, z: number, yaw: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c - z * s, x * s + z * c];
}

function updateBoundsWithBox(bounds: MutableBounds | null, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const halfX = Math.max(0.001, sx * 0.5);
  const halfY = Math.max(0.001, sy * 0.5);
  const halfZ = Math.max(0.001, sz * 0.5);
  const next = bounds ?? {
    minX: x - halfX,
    maxX: x + halfX,
    minZ: z - halfZ,
    maxZ: z + halfZ,
    maxY: y + halfY,
    frontierX: x,
    frontierZ: z,
    frontierSeq: 1
  };
  next.minX = Math.min(next.minX, x - halfX);
  next.maxX = Math.max(next.maxX, x + halfX);
  next.minZ = Math.min(next.minZ, z - halfZ);
  next.maxZ = Math.max(next.maxZ, z + halfZ);
  next.maxY = Math.max(next.maxY, y + halfY);
  return next;
}

function segmentYawLength(fromX: number, fromZ: number, toX: number, toZ: number) {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const length = Math.hypot(dx, dz);
  return {
    yaw: Math.atan2(dx, dz),
    length,
    midX: (fromX + toX) * 0.5,
    midZ: (fromZ + toZ) * 0.5
  };
}

function choosePlacement(state: CityAccumState, event: BlockEvent, rng: () => number): DistrictRecord {
  if (state.districts.length === 0) {
    return {
      sequence: event.sequence,
      centerX: 0,
      centerZ: 0,
      radialDistance: 0,
      parentIndex: null,
      linkAIndex: null,
      linkBIndex: null,
      nodeY: 0.06,
      plotW: 8,
      plotD: 8,
      yaw: 0
    };
  }

  const districts = state.districts;
  const indices = districts.map((_, i) => i);
  indices.sort((a, b) => {
    const dr = districts[b].radialDistance - districts[a].radialDistance;
    return dr !== 0 ? dr : a - b;
  });
  const frontierPool = indices.slice(0, Math.min(OUTER_FRONTIER_COUNT, indices.length));
  const parentIndex = frontierPool[Math.min(frontierPool.length - 1, Math.floor(rng() * frontierPool.length))];
  const parent = districts[parentIndex];

  const m = event.metrics;
  const intensity = MathUtils.clamp(clampFinite(m.intensity, 0), 0, 1);
  const totalVolume = Math.max(0, clampFinite(m.totalVolume, 0, 0, 10_000_000));
  const tradeCount = Math.max(0, clampFinite(m.tradeCount, 0, 0, 300000));
  const volumeSignal = MathUtils.clamp(Math.log1p(totalVolume * 100) / 6.5, 0, 1);
  const densitySignal = MathUtils.clamp(Math.log1p(tradeCount) / 6.2, 0, 1);

  let stepMin = BASE_STEP_MIN + volumeSignal * 2.2 + densitySignal * 1.1;
  let stepMax = BASE_STEP_MAX + volumeSignal * 5.4 + intensity * 2.6;

  let best: { x: number; z: number; radius: number; score: number } | null = null;
  const parentOutward = Math.atan2(parent.centerZ || 0.0001, parent.centerX || 0.0001);

  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
    if (attempt > 0 && attempt % 7 === 0) {
      stepMin *= 0.96;
      stepMax *= 1.12;
    }

    const outwardMode = rng() < OUTWARD_BIAS;
    const angle = outwardMode
      ? parentOutward + (rng() - 0.5) * Math.PI * (1.1 + rng() * 0.8)
      : rng() * Math.PI * 2;
    const dist = MathUtils.lerp(stepMin, stepMax, rng());
    const x = parent.centerX + Math.cos(angle) * dist;
    const z = parent.centerZ + Math.sin(angle) * dist;

    let minDist = Number.POSITIVE_INFINITY;
    let valid = true;
    for (let i = 0; i < districts.length; i++) {
      const d = districts[i];
      const dd = Math.hypot(x - d.centerX, z - d.centerZ);
      if (dd < MIN_DISTRICT_DISTANCE) {
        valid = false;
        break;
      }
      minDist = Math.min(minDist, dd);
    }
    if (!valid) continue;

    const radius = Math.hypot(x, z);
    const parentRadius = parent.radialDistance;
    const outwardGain = radius - parentRadius;
    const score = minDist * 1.1 + outwardGain * 0.45 + (rng() - 0.5) * 0.3;
    if (!best || score > best.score) {
      best = { x, z, radius, score };
    }
  }

  if (!best) {
    const fallbackAngle = rng() * Math.PI * 2;
    const fallbackDist = stepMax * 1.15;
    const x = parent.centerX + Math.cos(fallbackAngle) * fallbackDist;
    const z = parent.centerZ + Math.sin(fallbackAngle) * fallbackDist;
    best = { x, z, radius: Math.hypot(x, z), score: 0 };
  }

  let linkBIndex: number | null = null;
  if (districts.length >= 4 && rng() > 0.42) {
    let nearest = -1;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < districts.length; i++) {
      if (i === parentIndex) continue;
      const d = districts[i];
      const dd = Math.hypot(best.x - d.centerX, best.z - d.centerZ);
      if (dd < nearestDist) {
        nearestDist = dd;
        nearest = i;
      }
    }
    if (nearest >= 0 && nearestDist < stepMax * 1.6) {
      linkBIndex = nearest;
    }
  }

  return {
    sequence: event.sequence,
    centerX: best.x,
    centerZ: best.z,
    radialDistance: best.radius,
    parentIndex,
    linkAIndex: parentIndex,
    linkBIndex,
    nodeY: 0.06,
    plotW: 8,
    plotD: 8,
    yaw: rng() * Math.PI * 2
  };
}

function appendTraceSegment(
  state: CityAccumState,
  event: BlockEvent,
  from: DistrictRecord,
  to: DistrictRecord,
  dominanceColor: Color,
  recencyBoost: number,
  rng: () => number,
  birthAtMs: number
) {
  const seg = segmentYawLength(from.centerX, from.centerZ, to.centerX, to.centerZ);
  if (!Number.isFinite(seg.length) || seg.length < 0.8) return;

  const clearLength = Math.max(0.6, seg.length - 1.2);
  const traceY = 0.012;
  const lineY = 0.026;
  const pulseScale = RUNTIME_QUALITY_CONFIG.pulseMotionScale;
  const motionScale = RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.4 : 1;
  const trafficDensityScale =
    (RUNTIME_QUALITY_CONFIG.tier === 'low' ? 0.45 : RUNTIME_QUALITY_CONFIG.tier === 'medium' ? 0.78 : 1) *
    (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.55 : 1);

  pushSolid(state.traceDecks, MAX_TRACE_DECK_INSTANCES, 'trace-deck', event.sequence, {
    position: [seg.midX, traceY, seg.midZ],
    rotationY: seg.yaw,
    size: [1.35, 0.018, clearLength],
    color: new Color('#071018'),
    birthAtMs,
    riseDelayMs: 30,
    riseDurationMs: Math.round(620 * RUNTIME_QUALITY_CONFIG.birthDurationScale),
    districtSeq: event.sequence
  });

  pushLight(state.traceLights, MAX_TRACE_LIGHT_INSTANCES, 'trace-line', event.sequence, {
    position: [seg.midX, lineY, seg.midZ],
    rotationY: seg.yaw,
    size: [0.08, 0.018, clearLength * 0.96],
    color: new Color('#7cf0ff').lerp(dominanceColor, 0.16).multiplyScalar(1.02 + recencyBoost * 0.55),
    opacity: 0.52 + recencyBoost * 0.28,
    birthAtMs,
    riseDelayMs: 110,
    riseDurationMs: Math.round(780 * RUNTIME_QUALITY_CONFIG.birthDurationScale),
    pulseAmp: 0.06 * pulseScale,
    pulseSpeed: 0.12 * Math.max(0.05, pulseScale),
    pulsePhase: event.sequence * 0.17
  });

  pushLight(state.traceLights, MAX_TRACE_LIGHT_INSTANCES, 'trace-side', event.sequence, {
    position: [seg.midX, lineY - 0.002, seg.midZ],
    rotationY: seg.yaw,
    size: [0.22, 0.016, clearLength * 0.94],
    color: new Color('#17384d').lerp(dominanceColor, 0.08),
    opacity: 0.2 + recencyBoost * 0.08,
    birthAtMs,
    riseDelayMs: 130,
    riseDurationMs: Math.round(760 * RUNTIME_QUALITY_CONFIG.birthDurationScale)
  });

  const pulseCount = Math.max(1, Math.round((clearLength / 14) * (RUNTIME_QUALITY_CONFIG.tier === 'low' ? 1 : 1.6)));
  for (let i = 0; i < pulseCount; i++) {
    const seedShift = i * 13 + event.sequence * 31;
    pushLight(state.pulseLights, MAX_PULSE_LIGHT_INSTANCES, 'trace-pulse', event.sequence, {
      position: [seg.midX, lineY + 0.01, seg.midZ],
      rotationY: seg.yaw,
      size: [0.12, 0.04, 0.24],
      color: new Color('#b9fbff').lerp(dominanceColor, 0.1),
      opacity: 0.72,
      birthAtMs,
      riseDelayMs: 180 + i * 26,
      riseDurationMs: Math.round(700 * RUNTIME_QUALITY_CONFIG.birthDurationScale),
      pulseAmp: 0.1 * pulseScale,
      pulseSpeed: 0.18 * Math.max(0.05, pulseScale),
      pulsePhase: seedShift * 0.05,
      slideAxis: 'z',
      slideSpan: Math.max(1.4, clearLength * 0.92),
      slideSpeed: (0.025 + rng() * 0.04) * motionScale,
      slidePhase: rng()
    });
  }

  const carCount = Math.max(
    RUNTIME_QUALITY_CONFIG.reducedMotion ? 0 : 2,
    Math.round((1.5 + clearLength * 0.2) * trafficDensityScale)
  );
  for (let i = 0; i < carCount; i++) {
    const headlight = rng() > 0.82 ? new Color('#ffbf66') : rng() > 0.5 ? new Color('#f6fcff') : new Color('#8cf2ff');
    pushLight(state.trafficLights, MAX_TRAFFIC_LIGHT_INSTANCES, 'traffic', event.sequence, {
      position: [seg.midX, lineY + 0.016, seg.midZ],
      rotationY: seg.yaw,
      size: [0.13, 0.05, 0.18],
      color: headlight,
      opacity: 0.96,
      birthAtMs,
      riseDelayMs: 200 + i * 18,
      riseDurationMs: Math.round(620 * RUNTIME_QUALITY_CONFIG.birthDurationScale),
      slideAxis: 'z',
      slideSpan: Math.max(1.4, clearLength * 0.92),
      slideSpeed: (0.018 + rng() * 0.032) * motionScale,
      slidePhase: rng(),
      pulseAmp: 0.05 * pulseScale,
      pulseSpeed: 0.16 * Math.max(0.05, pulseScale),
      pulsePhase: event.sequence * 0.11 + i * 0.23
    });
  }

  state.bounds = updateBoundsWithBox(state.bounds, seg.midX, traceY, seg.midZ, 1.4, 0.05, clearLength + 0.4);
}

function appendDistrictFromEvent(state: CityAccumState, event: BlockEvent) {
  const seed = hashSeed(event.sequence, event.windowStart);
  const rng = mulberry32(seed);
  const birthAtMs = Math.max(0, clampFinite(event.emittedAt, Date.now()));
  const m = event.metrics;

  const intensity = MathUtils.clamp(clampFinite(m.intensity, 0), 0, 1);
  const dominance = MathUtils.clamp(clampFinite(m.imbalance, 0), -1, 1);
  const tradeCount = Math.max(0, Math.floor(clampFinite(m.tradeCount, 0, 0, 300000)));
  const avgTradeSize = Math.max(0, clampFinite(m.averageTradeSize, 0, 0, 5000));
  const totalVolume = Math.max(0, clampFinite(m.totalVolume, 0, 0, 10_000_000));

  const volumeSignal = MathUtils.clamp(Math.log1p(totalVolume * 100) / 6.4, 0, 1);
  const countSignal = MathUtils.clamp(Math.log1p(tradeCount) / 6.1, 0, 1);
  const sizeSignal = MathUtils.clamp(Math.log1p(avgTradeSize * 1000) / 4.7, 0, 1);

  const placement = choosePlacement(state, event, rng);
  const districtIndex = state.districts.length;
  const districtId = `D-${event.sequence}`;
  const recencyBoost = 0.35 + Math.min(1, districtIndex / Math.max(1, HISTORY_CAP_DISTRICTS)) * 0.65;

  const buyTint = new Color('#58e7ff');
  const sellTint = new Color('#ffad63');
  const dominanceColor = sellTint.clone().lerp(buyTint, (dominance + 1) * 0.5);
  const neutralWire = new Color('#b9f0ff');

  const plotW = clampFinite(6.8 + volumeSignal * 6.4 + intensity * 1.8, 9, 6.4, 17);
  const plotD = clampFinite(6.4 + volumeSignal * 5.8 + intensity * 1.8, 8.6, 6.1, 16);
  const plinthH = clampFinite(0.28 + volumeSignal * 0.34 + intensity * 0.2, 0.5, 0.24, 1.3);
  const deckH = 0.04;
  const nodeRadius = clampFinite(0.7 + volumeSignal * 0.45 + intensity * 0.3, 1.0, 0.75, 1.7);
  const yaw = placement.yaw;

  placement.plotW = plotW;
  placement.plotD = plotD;
  placement.nodeY = plinthH + 0.03;
  state.districts.push(placement);

  pushLight(state.shadowPads, MAX_SHADOW_PAD_INSTANCES, 'contact-pad', event.sequence, {
    position: [placement.centerX, 0.004, placement.centerZ],
    rotationY: yaw,
    size: [plotW * 1.25, 0.012, plotD * 1.25],
    color: new Color('#000000'),
    opacity: 0.18,
    birthAtMs,
    riseDelayMs: 0,
    riseDurationMs: Math.round(700 * RUNTIME_QUALITY_CONFIG.birthDurationScale),
    districtSeq: event.sequence
  });

  pushSolid(state.districtPlinths, MAX_DISTRICT_PLINTH_INSTANCES, 'district-plinth', event.sequence, {
    position: [placement.centerX, plinthH * 0.5 - 0.015, placement.centerZ],
    rotationY: yaw,
    size: [plotW, plinthH, plotD],
    color: new Color('#071018').lerp(dominanceColor, 0.04),
    birthAtMs,
    riseDelayMs: 0,
    riseDurationMs: Math.round(760 * RUNTIME_QUALITY_CONFIG.birthDurationScale),
    districtSeq: event.sequence
  });

  // Circuit deck pattern: cross + perimeter traces (as visible board node field)
  const deckY = plinthH + deckH * 0.5;
  const traceDeckColor = new Color('#08111a');
  const laneColor = new Color('#76f2ff').lerp(dominanceColor, 0.16);
  const accentColor = new Color('#c8fbff').lerp(dominanceColor, 0.18);
  const lineThickness = clampFinite(0.08 + intensity * 0.03, 0.1, 0.07, 0.16);

  const localDecks = [
    { lx: 0, lz: 0, sx: plotW - 0.35, sz: 0.24, rot: yaw },
    { lx: 0, lz: 0, sx: 0.24, sz: plotD - 0.35, rot: yaw }
  ];
  for (let i = 0; i < localDecks.length; i++) {
    const d = localDecks[i];
    pushSolid(state.districtDecks, MAX_DISTRICT_DECK_INSTANCES, 'district-deck', event.sequence, {
      position: [placement.centerX + d.lx, deckY, placement.centerZ + d.lz],
      rotationY: d.rot,
      size: [d.sx, deckH, d.sz],
      color: traceDeckColor.clone(),
      birthAtMs,
      riseDelayMs: 40 + i * 20,
      riseDurationMs: Math.round(620 * RUNTIME_QUALITY_CONFIG.birthDurationScale),
      districtSeq: event.sequence
    });
  }

  const edgeX = plotW * 0.5 - 0.16;
  const edgeZ = plotD * 0.5 - 0.16;
  const perimeter = [
    { lx: 0, lz: edgeZ, sx: plotW - 0.26, sz: 0.14 },
    { lx: 0, lz: -edgeZ, sx: plotW - 0.26, sz: 0.14 },
    { lx: edgeX, lz: 0, sx: 0.14, sz: plotD - 0.26 },
    { lx: -edgeX, lz: 0, sx: 0.14, sz: plotD - 0.26 }
  ];
  for (let i = 0; i < perimeter.length; i++) {
    const seg = perimeter[i];
    const [rx, rz] = rotateLocal(seg.lx, seg.lz, yaw);
    pushSolid(state.districtDecks, MAX_DISTRICT_DECK_INSTANCES, 'district-deck', event.sequence, {
      position: [placement.centerX + rx, deckY + 0.002, placement.centerZ + rz],
      rotationY: yaw,
      size: [seg.sx, 0.025, seg.sz],
      color: traceDeckColor.clone().multiplyScalar(1.04),
      birthAtMs,
      riseDelayMs: 60 + i * 14,
      riseDurationMs: Math.round(640 * RUNTIME_QUALITY_CONFIG.birthDurationScale),
      districtSeq: event.sequence
    });

    pushLight(state.traceLights, MAX_TRACE_LIGHT_INSTANCES, 'district-trace-perimeter', event.sequence, {
      position: [placement.centerX + rx, plinthH + 0.028, placement.centerZ + rz],
      rotationY: yaw,
      size: [Math.max(0.12, seg.sx), 0.02, Math.max(0.12, seg.sz)],
      color: laneColor.clone().multiplyScalar(0.86 + recencyBoost * 0.34),
      opacity: 0.28 + intensity * 0.12,
      birthAtMs,
      riseDelayMs: 110 + i * 16,
      riseDurationMs: Math.round(760 * RUNTIME_QUALITY_CONFIG.birthDurationScale),
      pulseAmp: 0.04 * RUNTIME_QUALITY_CONFIG.pulseMotionScale,
      pulseSpeed: 0.1 * Math.max(0.05, RUNTIME_QUALITY_CONFIG.pulseMotionScale),
      pulsePhase: event.sequence * 0.21 + i * 0.3
    });
  }

  pushLight(state.nodeLights, MAX_NODE_LIGHT_INSTANCES, 'district-node-core', event.sequence, {
    position: [placement.centerX, plinthH + 0.032, placement.centerZ],
    rotationY: yaw,
    size: [nodeRadius * 1.05, 0.06, nodeRadius * 1.05],
    color: new Color('#8df4ff').lerp(dominanceColor, 0.12).multiplyScalar(1.0 + recencyBoost * 0.45),
    opacity: 0.74,
    birthAtMs,
    riseDelayMs: 100,
    riseDurationMs: Math.round(760 * RUNTIME_QUALITY_CONFIG.birthDurationScale),
    pulseAmp: (0.1 + intensity * 0.08) * RUNTIME_QUALITY_CONFIG.pulseMotionScale,
    pulseSpeed: (0.16 + intensity * 0.12) * Math.max(0.05, RUNTIME_QUALITY_CONFIG.pulseMotionScale),
    pulsePhase: event.sequence * 0.13
  });
  pushLight(state.nodeLights, MAX_NODE_LIGHT_INSTANCES, 'district-node-ring', event.sequence, {
    position: [placement.centerX, plinthH + 0.026, placement.centerZ],
    rotationY: yaw,
    size: [nodeRadius * 1.9, 0.03, nodeRadius * 1.9],
    color: new Color('#46dfff').lerp(dominanceColor, 0.22).multiplyScalar(0.9 + recencyBoost * 0.5),
    opacity: 0.34 + intensity * 0.12,
    birthAtMs,
    riseDelayMs: 130,
    riseDurationMs: Math.round(820 * RUNTIME_QUALITY_CONFIG.birthDurationScale),
    pulseAmp: 0.05 * RUNTIME_QUALITY_CONFIG.pulseMotionScale,
    pulseSpeed: 0.09 * Math.max(0.05, RUNTIME_QUALITY_CONFIG.pulseMotionScale),
    pulsePhase: event.sequence * 0.09
  });

  state.bounds = updateBoundsWithBox(state.bounds, placement.centerX, plinthH * 0.5, placement.centerZ, plotW, plinthH, plotD);
  state.bounds = updateBoundsWithBox(state.bounds, placement.centerX, plinthH + 0.03, placement.centerZ, nodeRadius * 2, 0.08, nodeRadius * 2);

  const connectIndexes = [placement.linkAIndex, placement.linkBIndex].filter((v): v is number => v != null && v >= 0);
  for (let i = 0; i < connectIndexes.length; i++) {
    const target = state.districts[connectIndexes[i]];
    if (!target) continue;
    appendTraceSegment(state, event, target, placement, dominanceColor, recencyBoost, rng, birthAtMs);
  }

  // Building generation: holographic towers (core + wireframe + bands + caps)
  const towerDensity = RUNTIME_QUALITY_CONFIG.districtDensityScale;
  const detailDensity = RUNTIME_QUALITY_CONFIG.detailDensityScale;
  const buildableX = plotW * 0.34;
  const buildableZ = plotD * 0.34;
  const centerReserve = Math.max(1.35, nodeRadius * 1.35);
  const majorCount = Math.max(2, Math.min(6, Math.round((2.4 + countSignal * 1.9 + volumeSignal * 1.8) * towerDensity)));
  const minorCount = Math.max(1, Math.min(4, Math.round((0.8 + intensity * 1.1 + countSignal * 0.8) * towerDensity)));
  const totalCandidates = majorCount + minorCount;
  const accepted: Array<[number, number]> = [];

  for (let t = 0; t < totalCandidates; t++) {
    if (state.towerCores.length >= MAX_TOWER_CORE_INSTANCES) break;
    const isMajor = t < majorCount;
    const seedT = Math.floor(rng() * 1_000_000) + t * 97;
    const ang = rng() * Math.PI * 2;
    const radial = MathUtils.lerp(0.2, 1, Math.pow(rng(), 0.75));
    const lx = Math.cos(ang) * buildableX * radial;
    const lz = Math.sin(ang) * buildableZ * radial;
    if (Math.abs(lx) < centerReserve * 0.55 || Math.abs(lz) < centerReserve * 0.55) continue;

    const minSpacing = (isMajor ? 1.25 : 0.95) + (1 - towerDensity) * 0.55;
    let tooClose = false;
    for (let i = 0; i < accepted.length; i++) {
      const p = accepted[i];
      if (Math.hypot(lx - p[0], lz - p[1]) < minSpacing) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    accepted.push([lx, lz]);

    const [rx, rz] = rotateLocal(lx, lz, yaw);
    const x = placement.centerX + rx;
    const z = placement.centerZ + rz;

    const footprintW = clampFinite((isMajor ? 0.7 : 0.5) + rng() * (isMajor ? 0.6 : 0.35) + volumeSignal * 0.2, 0.9, 0.35, 2.2);
    const footprintD = clampFinite((isMajor ? 0.65 : 0.46) + rng() * (isMajor ? 0.55 : 0.32) + volumeSignal * 0.2, 0.85, 0.35, 2.2);
    const centralWeight = 1 - Math.min(1, Math.hypot(lx / Math.max(0.001, buildableX), lz / Math.max(0.001, buildableZ)));
    const verticalBias = clampFinite(1 + dominance * 0.34 + sizeSignal * 0.18, 1, 0.75, 1.65);

    const podiumH = clampFinite(0.55 + (isMajor ? 0.35 : 0.18) + intensity * 0.35 + volumeSignal * 0.2, 0.9, 0.38, 2.3);
    const shaftH = clampFinite((2.1 + centralWeight * (7.4 + intensity * 8.4) + countSignal * 2.8) * verticalBias, 6, 1.6, 24);
    const hasSpire = isMajor && (rng() > 0.42 || intensity > 0.58);
    const spireH = hasSpire ? clampFinite(0.8 + centralWeight * (4.5 + intensity * 5.5) + sizeSignal * 1.4, 2.5, 0.5, 12) : 0;
    const totalHeight = podiumH + shaftH + spireH;

    const buildingId = `D-${event.sequence}-B-${t}`;
    const towerYaw = yaw + (rng() - 0.5) * 0.12;
    const baseY = plinthH;
    const riseDelay = Math.floor((t * (22 + intensity * 18)) * RUNTIME_QUALITY_CONFIG.birthDurationScale);
    const riseDur = Math.floor((760 + (1 - centralWeight) * 380 + intensity * 240) * RUNTIME_QUALITY_CONFIG.birthDurationScale);

    const coreBody = new Color('#07131a');
    const coreAccent = new Color('#0d2330').lerp(dominanceColor, 0.09 + intensity * 0.06);
    const wireBase = neutralWire.clone().lerp(dominanceColor, 0.24 + intensity * 0.16).multiplyScalar(0.8 + recencyBoost * 0.6);
    const wireTop = new Color('#e9ffff').lerp(dominanceColor, 0.12).multiplyScalar(0.95 + recencyBoost * 0.85);

    const tiers: Array<{ tier: 'podium' | 'shaft' | 'spire'; h: number; sx: number; sz: number; y: number; color: Color }> = [
      {
        tier: 'podium',
        h: podiumH,
        sx: footprintW * 1.1,
        sz: footprintD * 1.1,
        y: baseY + podiumH * 0.5,
        color: coreBody.clone().lerp(coreAccent, 0.45)
      },
      {
        tier: 'shaft',
        h: shaftH,
        sx: footprintW * (0.72 + rng() * 0.1),
        sz: footprintD * (0.72 + rng() * 0.1),
        y: baseY + podiumH + shaftH * 0.5,
        color: coreBody.clone().lerp(coreAccent, 0.65)
      }
    ];
    if (hasSpire && spireH > 0.2) {
      tiers.push({
        tier: 'spire',
        h: spireH,
        sx: Math.max(0.16, footprintW * 0.3),
        sz: Math.max(0.16, footprintD * 0.3),
        y: baseY + podiumH + shaftH + spireH * 0.5,
        color: coreBody.clone().lerp(coreAccent, 0.82)
      });
    }

    for (let k = 0; k < tiers.length; k++) {
      const tier = tiers[k];
      const coreAdded = pushSolid(state.towerCores, MAX_TOWER_CORE_INSTANCES, 'tower-core', event.sequence, {
        position: [x, tier.y, z],
        rotationY: towerYaw,
        size: [tier.sx, tier.h, tier.sz],
        color: tier.color,
        birthAtMs,
        riseDelayMs: riseDelay + k * 36,
        riseDurationMs: Math.max(260, riseDur - k * 60),
        districtSeq: event.sequence
      });

      if (coreAdded) {
        state.towerMeta.push({
          buildingId,
          districtId,
          sequence: event.sequence,
          tier: tier.tier,
          tierHeight: tier.h,
          totalHeight,
          buyVolume: m.buyVolume,
          sellVolume: m.sellVolume,
          intensity,
          tradeCount,
          dominance,
          timestamp: event.windowEnd,
          source: event.source
        });
      }

      pushLight(state.towerWireframes, MAX_TOWER_WIREFRAME_INSTANCES, 'tower-wire', event.sequence, {
        position: [x, tier.y, z],
        rotationY: towerYaw,
        size: [tier.sx * 1.02, tier.h * 1.005, tier.sz * 1.02],
        color: (k === tiers.length - 1 ? wireTop : wireBase).clone(),
        opacity: MathUtils.clamp((0.45 + intensity * 0.18) * (0.78 + recencyBoost * 0.35), 0.28, 0.95),
        birthAtMs,
        riseDelayMs: riseDelay + 70 + k * 32,
        riseDurationMs: Math.max(260, riseDur - 20),
        pulseAmp: 0.05 * RUNTIME_QUALITY_CONFIG.pulseMotionScale,
        pulseSpeed: 0.12 * Math.max(0.05, RUNTIME_QUALITY_CONFIG.pulseMotionScale),
        pulsePhase: event.sequence * 0.13 + seedT * 0.0007,
        districtSeq: event.sequence
      });

      if (detailDensity > 0.35) {
        const bandCount = tier.tier === 'shaft' ? (isMajor ? 2 : 1) : 1;
        for (let b = 0; b < bandCount; b++) {
          const bandY = tier.y - tier.h * 0.45 + (tier.h * (0.25 + (b + 1) / (bandCount + 1) * 0.55));
          pushLight(state.towerBands, MAX_TOWER_BAND_INSTANCES, 'tower-band', event.sequence, {
            position: [x, bandY, z],
            rotationY: towerYaw,
            size: [Math.max(0.14, tier.sx * 0.96), 0.03, Math.max(0.14, tier.sz * 0.96)],
            color: wireBase.clone().lerp(dominanceColor, 0.12 + b * 0.06).multiplyScalar(0.9 + recencyBoost * 0.4),
            opacity: 0.18 + intensity * 0.08,
            birthAtMs,
            riseDelayMs: riseDelay + 110 + b * 24,
            riseDurationMs: Math.max(260, riseDur - 40),
            pulseAmp: 0.03 * RUNTIME_QUALITY_CONFIG.pulseMotionScale,
            pulseSpeed: 0.1 * Math.max(0.05, RUNTIME_QUALITY_CONFIG.pulseMotionScale),
            pulsePhase: event.sequence * 0.21 + b * 0.4,
            districtSeq: event.sequence
          });
        }
      }
    }

    pushLight(state.towerCaps, MAX_TOWER_CAP_INSTANCES, 'tower-cap', event.sequence, {
      position: [x, baseY + totalHeight + 0.05, z],
      rotationY: towerYaw,
      size: [Math.max(0.16, footprintW * 0.88), 0.06, Math.max(0.16, footprintD * 0.88)],
      color: wireTop.clone().lerp(dominanceColor, 0.16).multiplyScalar(1 + recencyBoost * 0.55),
      opacity: MathUtils.clamp(0.24 + intensity * 0.18, 0.16, 0.6),
      birthAtMs,
      riseDelayMs: riseDelay + 180,
      riseDurationMs: Math.max(280, riseDur - 30),
      pulseAmp: (0.06 + intensity * 0.07) * RUNTIME_QUALITY_CONFIG.pulseMotionScale,
      pulseSpeed: 0.12 * Math.max(0.05, RUNTIME_QUALITY_CONFIG.pulseMotionScale),
      pulsePhase: event.sequence * 0.12 + t * 0.2,
      districtSeq: event.sequence
    });

    state.bounds = updateBoundsWithBox(state.bounds, x, baseY + totalHeight * 0.5, z, footprintW * 1.3, totalHeight, footprintD * 1.3);
  }

  if (state.bounds) {
    state.bounds.frontierX = placement.centerX;
    state.bounds.frontierZ = placement.centerZ;
    state.bounds.frontierSeq = event.sequence;
  }

  state.lastProcessedSequence = Math.max(state.lastProcessedSequence, event.sequence);
}

function trimAccumulatedState(state: CityAccumState) {
  // Keep deterministic append-only behavior during normal runs; only trim when far beyond cap.
  if (state.districts.length <= HISTORY_CAP_DISTRICTS) {
    return;
  }

  const minVisibleSeq = state.districts[state.districts.length - HISTORY_CAP_DISTRICTS].sequence;
  state.districts = state.districts.filter((d) => d.sequence >= minVisibleSeq);

  const keepBySeq = <T extends { districtSeq?: number }>(items: T[]) => items.filter((i) => (i.districtSeq ?? minVisibleSeq) >= minVisibleSeq);
  state.shadowPads = keepBySeq(state.shadowPads);
  state.districtPlinths = keepBySeq(state.districtPlinths);
  state.districtDecks = keepBySeq(state.districtDecks);
  state.traceDecks = keepBySeq(state.traceDecks);
  state.traceLights = keepBySeq(state.traceLights);
  state.nodeLights = keepBySeq(state.nodeLights);
  state.pulseLights = keepBySeq(state.pulseLights);
  state.towerCores = keepBySeq(state.towerCores);
  state.towerWireframes = keepBySeq(state.towerWireframes);
  state.towerBands = keepBySeq(state.towerBands);
  state.towerCaps = keepBySeq(state.towerCaps);
  state.trafficLights = keepBySeq(state.trafficLights);
  state.towerMeta = state.towerMeta.filter((m) => m.sequence >= minVisibleSeq);

  // Reindex parent/link references for future placements while preserving positions of retained districts.
  const seqToIndex = new Map<number, number>();
  for (let i = 0; i < state.districts.length; i++) seqToIndex.set(state.districts[i].sequence, i);
  for (let i = 0; i < state.districts.length; i++) {
    const d = state.districts[i];
    const parentSeq = d.parentIndex != null ? state.districts[d.parentIndex]?.sequence : null;
    const linkASeq = d.linkAIndex != null ? state.districts[d.linkAIndex]?.sequence : null;
    const linkBSeq = d.linkBIndex != null ? state.districts[d.linkBIndex]?.sequence : null;
    d.parentIndex = parentSeq != null ? (seqToIndex.get(parentSeq) ?? null) : null;
    d.linkAIndex = linkASeq != null ? (seqToIndex.get(linkASeq) ?? null) : null;
    d.linkBIndex = linkBSeq != null ? (seqToIndex.get(linkBSeq) ?? null) : null;
  }

  // Recompute bounds from remaining towers/plinths (rare path).
  state.bounds = null;
  for (const item of state.districtPlinths) {
    state.bounds = updateBoundsWithBox(state.bounds, item.position[0], item.position[1], item.position[2], item.size[0], item.size[1], item.size[2]);
  }
  for (const item of state.traceDecks) {
    state.bounds = updateBoundsWithBox(state.bounds, item.position[0], item.position[1], item.position[2], item.size[0], item.size[1], item.size[2]);
  }
  for (const item of state.towerCores) {
    state.bounds = updateBoundsWithBox(state.bounds, item.position[0], item.position[1], item.position[2], item.size[0], item.size[1], item.size[2]);
  }
  const latest = state.districts[state.districts.length - 1];
  if (state.bounds && latest) {
    state.bounds.frontierX = latest.centerX;
    state.bounds.frontierZ = latest.centerZ;
    state.bounds.frontierSeq = latest.sequence;
  }
}

function applySolidInstances(mesh: InstancedMesh | null, items: SolidInstance[], nowMs: number) {
  if (!mesh) return;
  const capacity = mesh.instanceMatrix?.count ?? mesh.count ?? 0;
  const count = Math.min(capacity, items.length);
  for (let i = 0; i < count; i++) {
    const item = items[i];
    const ageMs = nowMs - item.birthAtMs - item.riseDelayMs;
    const alive = ageMs < 0 ? 0 : easeOutCubic(ageMs / Math.max(1, item.riseDurationMs));
    const sx = Math.max(0.0001, item.size[0]);
    const sy = Math.max(0.0001, item.size[1] * alive);
    const sz = Math.max(0.0001, item.size[2]);
    const y = item.position[1] - item.size[1] * 0.5 + sy * 0.5;
    if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sz) || !Number.isFinite(y)) continue;
    tempObject.position.set(item.position[0], y, item.position[2]);
    tempObject.rotation.set(0, item.rotationY, 0);
    tempObject.scale.set(sx, sy, sz);
    tempObject.updateMatrix();
    mesh.setMatrixAt(i, tempObject.matrix);
  }
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
}

function applyLightInstances(mesh: InstancedMesh | null, items: LightInstance[], nowMs: number) {
  if (!mesh) return;
  const capacity = mesh.instanceMatrix?.count ?? mesh.count ?? 0;
  const count = Math.min(capacity, items.length);
  const t = nowMs * 0.001;
  for (let i = 0; i < count; i++) {
    const item = items[i];
    const ageMs = nowMs - item.birthAtMs - item.riseDelayMs;
    const alive = ageMs < 0 ? 0 : easeOutCubic(ageMs / Math.max(1, item.riseDurationMs));

    const pulseAmp = item.pulseAmp ?? 0;
    const pulseSpeed = item.pulseSpeed ?? 0;
    const pulsePhase = item.pulsePhase ?? 0;
    const pulse = pulseAmp > 0 ? 1 + Math.sin(t * pulseSpeed * Math.PI * 2 + pulsePhase) * pulseAmp : 1;

    let px = item.position[0];
    let pz = item.position[2];
    const slideSpan = item.slideSpan ?? 0;
    const slideSpeed = item.slideSpeed ?? 0;
    const slidePhase = item.slidePhase ?? 0;
    if (slideSpan > 0 && slideSpeed > 0) {
      const cycle = (t * slideSpeed + slidePhase) % 1;
      const signed = (cycle - 0.5) * slideSpan;
      const s = Math.sin(item.rotationY);
      const c = Math.cos(item.rotationY);
      if (item.slideAxis === 'x') {
        px += c * signed;
        pz += s * signed;
      } else {
        px += s * signed;
        pz += c * signed;
      }
    }

    const sx = Math.max(0.0001, item.size[0] * (0.96 + (pulse - 1) * 0.85));
    const sy = Math.max(0.0001, item.size[1] * alive * (0.92 + (pulse - 1) * 0.65));
    const sz = Math.max(0.0001, item.size[2] * (0.96 + (pulse - 1) * 0.85));
    const y = item.position[1] - item.size[1] * 0.5 + sy * 0.5;
    if (!Number.isFinite(px) || !Number.isFinite(pz) || !Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sz)) continue;

    tempObject.position.set(px, y, pz);
    tempObject.rotation.set(0, item.rotationY, 0);
    tempObject.scale.set(sx, sy, sz);
    tempObject.updateMatrix();
    mesh.setMatrixAt(i, tempObject.matrix);
  }
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
}

function InstancedColorSetup<T extends { color: Color; opacity?: number }>({
  meshRef,
  items,
  brightnessScale = 1
}: {
  meshRef: RefObject<InstancedMesh>;
  items: T[];
  brightnessScale?: number;
}) {
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const capacity = mesh.instanceMatrix?.count ?? mesh.count ?? 0;
    const count = Math.min(capacity, items.length);
    for (let i = 0; i < count; i++) {
      const item = items[i];
      const f = brightnessScale * (item.opacity != null ? 0.7 + item.opacity * 0.65 : 1);
      mesh.setColorAt(i, item.color.clone().multiplyScalar(f));
    }
    mesh.count = count;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [meshRef, items, brightnessScale]);
  return null;
}

function GroundBoardV3({ bounds, districtCount }: { bounds: MutableBounds | null; districtCount: number }) {
  const radius = Math.max(40, bounds ? Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 0.7 : 64);
  const boardSize = Math.min(2600, Math.max(420, radius * 4.8 + 180));
  const centerX = bounds ? (bounds.minX + bounds.maxX) * 0.5 : 0;
  const centerZ = bounds ? (bounds.minZ + bounds.maxZ) * 0.5 : 0;
  const gridDivs = Math.max(22, Math.min(140, Math.round(boardSize / (RUNTIME_QUALITY_CONFIG.tier === 'low' ? 12 : 8))));
  const boardGlow = DEBUG_VIEW_ENABLED ? 0.18 : 0.12;

  return (
    <group position={[centerX, 0, centerZ]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.042, 0]} receiveShadow>
        <planeGeometry args={[boardSize, boardSize]} />
        <meshStandardMaterial color="#04070a" roughness={0.98} metalness={0.04} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <planeGeometry args={[boardSize * 0.986, boardSize * 0.986]} />
        <meshStandardMaterial
          color="#070d13"
          roughness={0.95}
          metalness={0.08}
          emissive="#0d2230"
          emissiveIntensity={boardGlow}
          transparent
          opacity={0.96}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.024, 0]}>
        <planeGeometry args={[boardSize * 0.92, 0.22]} />
        <meshBasicMaterial color="#74eeff" transparent opacity={0.22} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.023, 0]}>
        <planeGeometry args={[0.22, boardSize * 0.92]} />
        <meshBasicMaterial color="#72e9ff" transparent opacity={0.18} toneMapped={false} />
      </mesh>

      <gridHelper
        args={[boardSize * 0.96, gridDivs, new Color('#2e5a73'), new Color('#102030')]}
        position={[0, -0.02, 0]}
        material-transparent
        material-opacity={DEBUG_VIEW_ENABLED ? 0.35 : 0.28}
      />

      {districtCount === 0 ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.018, 0]}>
          <circleGeometry args={[12, 48]} />
          <meshBasicMaterial color="#103448" transparent opacity={0.24} toneMapped={false} />
        </mesh>
      ) : null}
    </group>
  );
}

export function HoloCitySystemV3() {
  const { events } = useBlockEventStore();
  const { hoveredBuildingId } = useCitySceneStore();

  const accumRef = useRef<CityAccumState>(createEmptyAccumState());
  const [version, setVersion] = useState(0);
  const [latestAnimEndMs, setLatestAnimEndMs] = useState(0);
  const settledRef = useRef(false);

  const shadowPadMeshRef = useRef<InstancedMesh>(null);
  const districtPlinthMeshRef = useRef<InstancedMesh>(null);
  const districtDeckMeshRef = useRef<InstancedMesh>(null);
  const traceDeckMeshRef = useRef<InstancedMesh>(null);
  const traceLightMeshRef = useRef<InstancedMesh>(null);
  const nodeLightMeshRef = useRef<InstancedMesh>(null);
  const pulseLightMeshRef = useRef<InstancedMesh>(null);
  const towerCoreMeshRef = useRef<InstancedMesh>(null);
  const towerWireMeshRef = useRef<InstancedMesh>(null);
  const towerBandMeshRef = useRef<InstancedMesh>(null);
  const towerCapMeshRef = useRef<InstancedMesh>(null);
  const trafficMeshRef = useRef<InstancedMesh>(null);
  const hoverShellMeshRef = useRef<InstancedMesh>(null);

  useEffect(() => {
    const state = accumRef.current;
    if (events.length === 0) {
      // If the upstream store resets (dev/HMR), reset the city accumulator too.
      if (state.lastProcessedSequence > 0) {
        accumRef.current = createEmptyAccumState();
        publishCitySceneData(
          {
            centerX: 0,
            centerZ: 0,
            minX: -22,
            maxX: 22,
            minZ: -22,
            maxZ: 22,
            maxY: 8,
            radius: 28,
            frontierX: 0,
            frontierZ: 0,
            frontierSeq: 1
          },
          []
        );
        clearHoveredTowerInstance();
        setVersion((v) => v + 1);
      }
      return;
    }

    let appended = false;
    let maxAnimEnd = latestAnimEndMs;
    const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
    const stateCurrent = accumRef.current;

    if (
      stateCurrent.lastProcessedSequence > 0 &&
      ordered[ordered.length - 1]?.sequence < stateCurrent.lastProcessedSequence &&
      ordered.length < 8
    ) {
      accumRef.current = createEmptyAccumState();
    }

    const state2 = accumRef.current;
    for (const event of ordered) {
      if (state2.processedSequences.has(event.sequence)) continue;
      appendDistrictFromEvent(state2, event);
      state2.processedSequences.add(event.sequence);
      appended = true;
    }

    if (!appended) {
      return;
    }

    trimAccumulatedState(state2);
    settledRef.current = false;

    const layers = [
      state2.shadowPads,
      state2.districtPlinths,
      state2.districtDecks,
      state2.traceDecks,
      state2.traceLights,
      state2.nodeLights,
      state2.pulseLights,
      state2.towerCores,
      state2.towerWireframes,
      state2.towerBands,
      state2.towerCaps,
      state2.trafficLights
    ] as const;
    for (const layer of layers) {
      for (const item of layer) {
        maxAnimEnd = Math.max(maxAnimEnd, item.birthAtMs + item.riseDelayMs + item.riseDurationMs);
      }
    }
    setLatestAnimEndMs(maxAnimEnd);

    const b = state2.bounds;
    publishCitySceneData(
      b
        ? {
            ...b,
            centerX: (b.minX + b.maxX) * 0.5,
            centerZ: (b.minZ + b.maxZ) * 0.5,
            radius: Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.5
          }
        : {
            centerX: 0,
            centerZ: 0,
            minX: -22,
            maxX: 22,
            minZ: -22,
            maxZ: 22,
            maxY: 8,
            radius: 28,
            frontierX: 0,
            frontierZ: 0,
            frontierSeq: 1
          },
      state2.towerMeta.map((meta, instanceId) => ({
        instanceId,
        height: meta.tierHeight,
        ...meta
      }))
    );

    setVersion((v) => v + 1);
  }, [events, latestAnimEndMs]);

  const stateSnapshot = accumRef.current;

  const towerCoreColorItems = useMemo(() => {
    return stateSnapshot.towerCores.map((item, i) => {
      const meta = stateSnapshot.towerMeta[i];
      if (!meta || !hoveredBuildingId || meta.buildingId !== hoveredBuildingId) return item;
      return {
        ...item,
        color: meta.tier === 'spire' ? new Color('#fffbe8') : new Color('#ffd400')
      };
    });
  }, [version, hoveredBuildingId, stateSnapshot]);

  const towerWireColorItems = useMemo(() => {
    return stateSnapshot.towerWireframes.map((item, i) => {
      const meta = stateSnapshot.towerMeta[i];
      if (!meta || !hoveredBuildingId || meta.buildingId !== hoveredBuildingId) return item;
      return {
        ...item,
        color: new Color('#fffef5'),
        opacity: 1
      };
    });
  }, [version, hoveredBuildingId, stateSnapshot]);

  const hoverShellItems = useMemo(() => {
    if (!hoveredBuildingId) return [] as LightInstance[];
    const items: LightInstance[] = [];
    for (let i = 0; i < stateSnapshot.towerCores.length; i++) {
      const meta = stateSnapshot.towerMeta[i];
      const src = stateSnapshot.towerCores[i];
      if (!meta || !src || meta.buildingId !== hoveredBuildingId) continue;
      items.push({
        ...src,
        size: [src.size[0] * 1.18, src.size[1] * 1.04, src.size[2] * 1.18],
        color: meta.tier === 'spire' ? new Color('#fffef0') : new Color('#ffe56a'),
        opacity: 0.94,
        pulseAmp: 0.12 * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.35 : 1),
        pulseSpeed: 0.38 * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.35 : 1),
        pulsePhase: i * 0.19
      });
      items.push({
        ...src,
        size: [src.size[0] * 1.34, src.size[1] * 1.08, src.size[2] * 1.34],
        color: new Color('#ffd400'),
        opacity: 0.62,
        pulseAmp: 0.1 * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.3 : 1),
        pulseSpeed: 0.26 * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.3 : 1),
        pulsePhase: i * 0.23 + 0.4
      });
      if (items.length >= 10) break;
    }
    return items;
  }, [version, hoveredBuildingId, stateSnapshot]);

  useLayoutEffect(() => {
    const now = Date.now();
    try {
      applyLightInstances(shadowPadMeshRef.current, stateSnapshot.shadowPads, now);
      applySolidInstances(districtPlinthMeshRef.current, stateSnapshot.districtPlinths, now);
      applySolidInstances(districtDeckMeshRef.current, stateSnapshot.districtDecks, now);
      applySolidInstances(traceDeckMeshRef.current, stateSnapshot.traceDecks, now);
      applyLightInstances(traceLightMeshRef.current, stateSnapshot.traceLights, now);
      applyLightInstances(nodeLightMeshRef.current, stateSnapshot.nodeLights, now);
      applyLightInstances(pulseLightMeshRef.current, stateSnapshot.pulseLights, now);
      applySolidInstances(towerCoreMeshRef.current, stateSnapshot.towerCores, now);
      applyLightInstances(towerWireMeshRef.current, stateSnapshot.towerWireframes, now);
      applyLightInstances(towerBandMeshRef.current, stateSnapshot.towerBands, now);
      applyLightInstances(towerCapMeshRef.current, stateSnapshot.towerCaps, now);
      applyLightInstances(trafficMeshRef.current, stateSnapshot.trafficLights, now);
      applyLightInstances(hoverShellMeshRef.current, hoverShellItems, now);
    } catch (error) {
      warnRuntime('layout apply', error);
    }
  }, [version, hoverShellItems, stateSnapshot]);

  const handleTowerPointerMove = (event: ThreeEvent<PointerEvent>) => {
    try {
      if (event.instanceId == null) {
        clearHoveredTowerInstance();
        return;
      }
      setHoveredTowerInstance(event.instanceId);
      event.stopPropagation();
    } catch (error) {
      warnHover(error);
      clearHoveredTowerInstance();
    }
  };

  const handleTowerPointerOut = () => {
    try {
      clearHoveredTowerInstance();
    } catch (error) {
      warnHover(error);
    }
  };

  useFrame(() => {
    const now = Date.now();
    try {
      const shouldAnimateBirth = !settledRef.current && now <= latestAnimEndMs + 120;
      if (shouldAnimateBirth) {
        applyLightInstances(shadowPadMeshRef.current, stateSnapshot.shadowPads, now);
        applySolidInstances(districtPlinthMeshRef.current, stateSnapshot.districtPlinths, now);
        applySolidInstances(districtDeckMeshRef.current, stateSnapshot.districtDecks, now);
        applySolidInstances(traceDeckMeshRef.current, stateSnapshot.traceDecks, now);
        applySolidInstances(towerCoreMeshRef.current, stateSnapshot.towerCores, now);
      }

      applyLightInstances(traceLightMeshRef.current, stateSnapshot.traceLights, now);
      applyLightInstances(nodeLightMeshRef.current, stateSnapshot.nodeLights, now);
      applyLightInstances(pulseLightMeshRef.current, stateSnapshot.pulseLights, now);
      applyLightInstances(towerWireMeshRef.current, stateSnapshot.towerWireframes, now);
      applyLightInstances(towerBandMeshRef.current, stateSnapshot.towerBands, now);
      applyLightInstances(towerCapMeshRef.current, stateSnapshot.towerCaps, now);
      applyLightInstances(trafficMeshRef.current, stateSnapshot.trafficLights, now);
      applyLightInstances(hoverShellMeshRef.current, hoverShellItems, now);

      if (!shouldAnimateBirth && !settledRef.current) {
        settledRef.current = true;
      }
    } catch (error) {
      warnRuntime('frame apply', error);
      settledRef.current = true;
    }
  });

  const traceBrightness = 1.75 * (0.9 + RUNTIME_QUALITY_CONFIG.glowIntensityScale * 0.45);
  const pulseBrightness = 2.6 * (0.95 + RUNTIME_QUALITY_CONFIG.glowIntensityScale * 0.35);
  const nodeBrightness = 2.0 * (0.95 + RUNTIME_QUALITY_CONFIG.glowIntensityScale * 0.4);
  const wireBrightness = 2.2 * (0.9 + RUNTIME_QUALITY_CONFIG.glowIntensityScale * 0.45);
  const capBrightness = 2.4 * (0.95 + RUNTIME_QUALITY_CONFIG.glowIntensityScale * 0.45);
  const trafficBrightness = 3.2 * (0.95 + RUNTIME_QUALITY_CONFIG.glowIntensityScale * 0.55);

  return (
    <group>
      <GroundBoardV3 bounds={stateSnapshot.bounds} districtCount={stateSnapshot.districts.length} />

      <InstancedColorSetup meshRef={shadowPadMeshRef} items={stateSnapshot.shadowPads} />
      <InstancedColorSetup meshRef={districtPlinthMeshRef} items={stateSnapshot.districtPlinths} />
      <InstancedColorSetup meshRef={districtDeckMeshRef} items={stateSnapshot.districtDecks} />
      <InstancedColorSetup meshRef={traceDeckMeshRef} items={stateSnapshot.traceDecks} />
      <InstancedColorSetup meshRef={traceLightMeshRef} items={stateSnapshot.traceLights} brightnessScale={traceBrightness} />
      <InstancedColorSetup meshRef={nodeLightMeshRef} items={stateSnapshot.nodeLights} brightnessScale={nodeBrightness} />
      <InstancedColorSetup meshRef={pulseLightMeshRef} items={stateSnapshot.pulseLights} brightnessScale={pulseBrightness} />
      <InstancedColorSetup meshRef={towerCoreMeshRef} items={towerCoreColorItems} />
      <InstancedColorSetup meshRef={towerWireMeshRef} items={towerWireColorItems} brightnessScale={wireBrightness} />
      <InstancedColorSetup meshRef={towerBandMeshRef} items={stateSnapshot.towerBands} brightnessScale={traceBrightness} />
      <InstancedColorSetup meshRef={towerCapMeshRef} items={stateSnapshot.towerCaps} brightnessScale={capBrightness} />
      <InstancedColorSetup meshRef={trafficMeshRef} items={stateSnapshot.trafficLights} brightnessScale={trafficBrightness} />
      <InstancedColorSetup meshRef={hoverShellMeshRef} items={hoverShellItems} brightnessScale={4.6} />

      <instancedMesh ref={shadowPadMeshRef} args={[undefined, undefined, MAX_SHADOW_PAD_INSTANCES]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors transparent opacity={0.42} depthWrite={false} />
      </instancedMesh>

      <instancedMesh ref={districtPlinthMeshRef} args={[undefined, undefined, MAX_DISTRICT_PLINTH_INSTANCES]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          vertexColors
          color="#0a121a"
          roughness={0.92}
          metalness={0.14}
          emissive="#163041"
          emissiveIntensity={DEBUG_VIEW_ENABLED ? 0.24 : 0.18}
        />
      </instancedMesh>

      <instancedMesh ref={districtDeckMeshRef} args={[undefined, undefined, MAX_DISTRICT_DECK_INSTANCES]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          vertexColors
          color="#071018"
          roughness={0.96}
          metalness={0.08}
          emissive="#102c38"
          emissiveIntensity={DEBUG_VIEW_ENABLED ? 0.16 : 0.12}
        />
      </instancedMesh>

      <instancedMesh ref={traceDeckMeshRef} args={[undefined, undefined, MAX_TRACE_DECK_INSTANCES]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          vertexColors
          color="#081119"
          roughness={0.94}
          metalness={0.1}
          emissive="#123444"
          emissiveIntensity={DEBUG_VIEW_ENABLED ? 0.16 : 0.1}
        />
      </instancedMesh>

      <instancedMesh ref={traceLightMeshRef} args={[undefined, undefined, MAX_TRACE_LIGHT_INSTANCES]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors transparent opacity={1} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </instancedMesh>

      <instancedMesh ref={nodeLightMeshRef} args={[undefined, undefined, MAX_NODE_LIGHT_INSTANCES]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors transparent opacity={1} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </instancedMesh>

      <instancedMesh ref={pulseLightMeshRef} args={[undefined, undefined, MAX_PULSE_LIGHT_INSTANCES]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors transparent opacity={1} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </instancedMesh>

      <instancedMesh
        ref={towerCoreMeshRef}
        args={[undefined, undefined, MAX_TOWER_CORE_INSTANCES]}
        castShadow={RUNTIME_QUALITY_CONFIG.shadows}
        receiveShadow={RUNTIME_QUALITY_CONFIG.shadows}
        onPointerMove={handleTowerPointerMove}
        onPointerOut={handleTowerPointerOut}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          vertexColors
          color="#0c141d"
          roughness={0.74}
          metalness={0.22}
          emissive="#1f5f7d"
          emissiveIntensity={DEBUG_VIEW_ENABLED ? 0.32 : 0.22}
          transparent
          opacity={0.9}
        />
      </instancedMesh>

      <instancedMesh ref={towerWireMeshRef} args={[undefined, undefined, MAX_TOWER_WIREFRAME_INSTANCES]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          vertexColors
          wireframe
          transparent
          opacity={0.95}
          depthWrite={false}
          toneMapped={false}
          blending={AdditiveBlending}
        />
      </instancedMesh>

      <instancedMesh ref={towerBandMeshRef} args={[undefined, undefined, MAX_TOWER_BAND_INSTANCES]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors transparent opacity={0.95} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </instancedMesh>

      <instancedMesh ref={towerCapMeshRef} args={[undefined, undefined, MAX_TOWER_CAP_INSTANCES]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors transparent opacity={0.96} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </instancedMesh>

      <instancedMesh ref={trafficMeshRef} args={[undefined, undefined, MAX_TRAFFIC_LIGHT_INSTANCES]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors transparent opacity={1} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </instancedMesh>

      <instancedMesh ref={hoverShellMeshRef} args={[undefined, undefined, 12]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors transparent opacity={1} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </instancedMesh>
    </group>
  );
}
