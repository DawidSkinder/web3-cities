import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import type { InstancedMesh } from 'three';
import { AdditiveBlending, Color, MathUtils, Object3D } from 'three';
import { useBlockEventStore } from '../data/trades/blockEventStore';
import type { BlockEvent } from '../data/trades/types';
import { getSpineTransformFromSequence } from './cityGrowthPath';
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

type TowerMassMeta = {
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

type CityVisualData = {
  shadowPads: LightInstance[];
  plots: SolidInstance[];
  streetDecks: SolidInstance[];
  towerMasses: SolidInstance[];
  towerMassMeta: TowerMassMeta[];
  laneLights: LightInstance[];
  detailLights: LightInstance[];
  haloGlows: LightInstance[];
  flowLights: LightInstance[];
  trafficCars: LightInstance[];
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    maxY: number;
    frontierX: number;
    frontierZ: number;
    frontierSeq: number;
  } | null;
};

const HISTORY_CAP = RUNTIME_QUALITY_CONFIG.historyCap;
const INSTANCE_CAP_SCALE =
  RUNTIME_QUALITY_CONFIG.tier === 'low' ? 0.65 : RUNTIME_QUALITY_CONFIG.tier === 'medium' ? 0.82 : 1;
const MAX_PLOT_INSTANCES = Math.max(36, Math.floor(120 * INSTANCE_CAP_SCALE));
const MAX_SHADOW_PAD_INSTANCES = Math.max(96, Math.floor(420 * INSTANCE_CAP_SCALE));
const MAX_STREET_INSTANCES = Math.max(160, Math.floor(520 * INSTANCE_CAP_SCALE));
const MAX_TOWER_MASS_INSTANCES = Math.max(420, Math.floor(1400 * INSTANCE_CAP_SCALE));
const MAX_LANE_LIGHT_INSTANCES = Math.max(640, Math.floor(2200 * INSTANCE_CAP_SCALE));
const MAX_DETAIL_LIGHT_INSTANCES = Math.max(700, Math.floor(2600 * INSTANCE_CAP_SCALE));
const MAX_HALO_GLOW_INSTANCES = Math.max(520, Math.floor(2200 * INSTANCE_CAP_SCALE));
const MAX_FLOW_LIGHT_INSTANCES = Math.max(80, Math.floor(420 * INSTANCE_CAP_SCALE));
const MAX_TRAFFIC_CAR_INSTANCES = Math.max(120, Math.floor(840 * INSTANCE_CAP_SCALE));

const tempObject = new Object3D();
let invalidInstanceWarnCount = 0;
let invalidEventWarnCount = 0;
let instanceBudgetWarned = false;
let runtimeEffectWarnCount = 0;
let hoverWarnCount = 0;

function pseudoRandom(seed: number) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
  return x - Math.floor(x);
}

function smoothstep01(v: number) {
  const t = MathUtils.clamp(v, 0, 1);
  return t * t * (3 - 2 * t);
}

function easeOutCubic(v: number) {
  const t = MathUtils.clamp(v, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function clampFinite(value: number, fallback: number, min?: number, max?: number) {
  const safe = Number.isFinite(value) ? value : fallback;
  const lower = min ?? safe;
  const upper = max ?? safe;
  return Math.min(upper, Math.max(lower, safe));
}

function isFiniteTuple3(v: [number, number, number]) {
  return Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
}

function isValidRotationY(v: number) {
  return Number.isFinite(v) && Math.abs(v) < Math.PI * 32;
}

function warnInvalidEvent(sequence: number, reason: string) {
  if (invalidEventWarnCount >= 24) {
    return;
  }
  invalidEventWarnCount += 1;
  console.warn(`[BTC Spot City][city] skipped event seq=${sequence}: ${reason}`);
}

function warnInvalidInstance(
  kind: 'plot' | 'street' | 'tower' | 'lane' | 'detail' | 'glow' | 'flow' | 'shadow' | 'car',
  sequence: number,
  reason: string
) {
  if (invalidInstanceWarnCount >= 48) {
    return;
  }
  invalidInstanceWarnCount += 1;
  console.warn(`[BTC Spot City][city] skipped ${kind} seq=${sequence}: ${reason}`);
}

function warnRuntimeEffect(kind: string, error: unknown) {
  if (runtimeEffectWarnCount >= 8) {
    return;
  }
  runtimeEffectWarnCount += 1;
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[BTC Spot City][city] disabled ${kind}: ${message}`);
}

function warnHoverIssue(error: unknown) {
  if (hoverWarnCount >= 6) {
    return;
  }
  hoverWarnCount += 1;
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[BTC Spot City][city] hover issue: ${message}`);
}

function validateSolid(kind: 'plot' | 'street' | 'tower', sequence: number, item: SolidInstance) {
  if (!isFiniteTuple3(item.position)) {
    warnInvalidInstance(kind, sequence, 'invalid position');
    return false;
  }
  if (!isFiniteTuple3(item.size)) {
    warnInvalidInstance(kind, sequence, 'invalid size');
    return false;
  }
  if (!isValidRotationY(item.rotationY)) {
    warnInvalidInstance(kind, sequence, 'invalid rotation');
    return false;
  }
  if (item.size[0] <= 0 || item.size[1] <= 0 || item.size[2] <= 0) {
    warnInvalidInstance(kind, sequence, 'non-positive size');
    return false;
  }
  return true;
}

function validateLight(
  kind: 'lane' | 'detail' | 'glow' | 'flow' | 'shadow' | 'car',
  sequence: number,
  item: LightInstance
) {
  if (!validateSolid('tower', sequence, item)) {
    warnInvalidInstance(kind, sequence, 'invalid transform');
    return false;
  }
  if (!Number.isFinite(item.opacity) || item.opacity <= 0) {
    warnInvalidInstance(kind, sequence, 'invalid opacity');
    return false;
  }
  return true;
}

function pushSolid(
  target: SolidInstance[],
  kind: 'plot' | 'street' | 'tower',
  sequence: number,
  item: SolidInstance,
  maxCount: number
) {
  if (target.length >= maxCount) {
    return false;
  }
  if (validateSolid(kind, sequence, item)) {
    target.push(item);
    return true;
  }
  return false;
}

function pushLight(
  target: LightInstance[],
  kind: 'lane' | 'detail' | 'glow' | 'flow' | 'shadow' | 'car',
  sequence: number,
  item: LightInstance,
  maxCount: number
) {
  if (target.length >= maxCount) {
    return false;
  }
  if (validateLight(kind, sequence, item)) {
    target.push(item);
    return true;
  }
  return false;
}

function rotateLocalPoint(x: number, z: number, yaw: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c - z * s, x * s + z * c];
}

function segmentYawAndLength(
  from: [number, number, number],
  to: [number, number, number]
): { yaw: number; length: number; mid: [number, number, number] } {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  return {
    yaw,
    length,
    mid: [(from[0] + to[0]) * 0.5, (from[1] + to[1]) * 0.5, (from[2] + to[2]) * 0.5]
  };
}

function buildCityVisualData(events: BlockEvent[]): CityVisualData {
  const detailDensityScale = RUNTIME_QUALITY_CONFIG.detailDensityScale;
  const districtDensityScale = RUNTIME_QUALITY_CONFIG.districtDensityScale;
  const ambientMotionDensityScale = RUNTIME_QUALITY_CONFIG.ambientMotionDensityScale;
  const pulseMotionScale = RUNTIME_QUALITY_CONFIG.pulseMotionScale;
  const pulseSpeedScale = Math.max(0.05, pulseMotionScale);
  const slideSpeedScale = Math.max(0, pulseMotionScale);
  const glowIntensityScale = RUNTIME_QUALITY_CONFIG.glowIntensityScale;
  const birthDurationScale = RUNTIME_QUALITY_CONFIG.birthDurationScale;
  const carDensityScale =
    (RUNTIME_QUALITY_CONFIG.tier === 'low' ? 0.45 : RUNTIME_QUALITY_CONFIG.tier === 'medium' ? 0.75 : 1) *
    (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.55 : 1);
  const carMotionScale = Math.max(0.18, RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.35 : 1);
  const baseFlowCount = DEBUG_VIEW_ENABLED ? 3 : 2;
  const flowCount = Math.max(
    RUNTIME_QUALITY_CONFIG.reducedMotion ? 0 : 1,
    Math.round(baseFlowCount * ambientMotionDensityScale)
  );

  const shadowPads: LightInstance[] = [];
  const plots: SolidInstance[] = [];
  const streetDecks: SolidInstance[] = [];
  const towerMasses: SolidInstance[] = [];
  const towerMassMeta: TowerMassMeta[] = [];
  const laneLights: LightInstance[] = [];
  const detailLights: LightInstance[] = [];
  const haloGlows: LightInstance[] = [];
  const flowLights: LightInstance[] = [];
  const trafficCars: LightInstance[] = [];

  let prevDistrictCenter: [number, number, number] | null = null;
  let prevDistrictPlotSpan = 0;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let maxY = 0;
  let frontierX = 0;
  let frontierZ = 0;
  let frontierSeq = 1;

  for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
    const event = events[eventIndex];
    if (
      !event ||
      !event.metrics ||
      !Number.isFinite(event.sequence) ||
      !Number.isFinite(event.emittedAt)
    ) {
      warnInvalidEvent(event?.sequence ?? -1, 'missing event fields');
      continue;
    }

    const m = event.metrics;
    const recency01 = events.length <= 1 ? 1 : eventIndex / (events.length - 1);
    const recencyCurve = smoothstep01(recency01);
    const historySubdue = 0.52 + recencyCurve * 0.48;
    const frontierEmphasis = 0.72 + recencyCurve * 0.76;
    const bodyContrast = 0.68 + recencyCurve * 0.58;
    const topContrast = 0.84 + recencyCurve * 0.48;

    const spine = getSpineTransformFromSequence(event.sequence);
    const [cx, , cz] = spine.position;
    if (!isFiniteTuple3([cx, 0, cz]) || !isValidRotationY(spine.yaw)) {
      warnInvalidEvent(event.sequence, 'invalid spine transform');
      continue;
    }

    const yaw = clampFinite(spine.yaw, 0, -Math.PI * 8, Math.PI * 8);
    const eventBirthAt = Math.max(0, clampFinite(event.emittedAt, Date.now()));
    const dominance = MathUtils.clamp(clampFinite(m.imbalance, 0), -1, 1);
    const intensity = MathUtils.clamp(clampFinite(m.intensity, 0), 0, 1);
    const tradeCount = Math.max(0, Math.floor(clampFinite(m.tradeCount, 0, 0, 200000)));
    const averageTradeSize = Math.max(0, clampFinite(m.averageTradeSize, 0, 0, 5000));
    const totalVolume = Math.max(0, clampFinite(m.totalVolume, 0, 0, 5_000_000));
    const priceChange = clampFinite(m.priceChange, 0, -1_000_000, 1_000_000);

    const tradeDensity = MathUtils.clamp(Math.log1p(tradeCount) / 4.8, 0, 1);
    const sizeSignal = MathUtils.clamp(Math.log1p(averageTradeSize * 1200) / 4.4, 0, 1);
    const volumeSignal = MathUtils.clamp(Math.log1p(totalVolume * 130) / 6.3, 0, 1);

    const plotSpanX = clampFinite(3.8 + volumeSignal * 5.4 + intensity * 2.1, 5.8, 3.2, 13.5);
    const plotSpanZ = clampFinite(3.0 + volumeSignal * 4.1 + intensity * 1.6, 4.8, 2.7, 10.8);
    const plotHeight = clampFinite(0.16 + intensity * 0.28 + volumeSignal * 0.2, 0.32, 0.12, 1.4);
    const districtStreetWidth = clampFinite(0.42 + plotSpanX * 0.05 + intensity * 0.12, 0.62, 0.34, 1.3);

    const buyTint = new Color('#4fd2ff');
    const sellTint = new Color('#ff9148');
    const neutralTint = new Color('#a9bccf');
    const dominanceColor = sellTint.clone().lerp(buyTint, (dominance + 1) * 0.5);

    const plotColor = new Color('#10151c')
      .lerp(dominanceColor, 0.05 + intensity * 0.08)
      .multiplyScalar(0.8 + recencyCurve * 0.32);
    const streetColor = new Color('#070a0f').multiplyScalar(0.84 + recencyCurve * 0.1);
    const towerBaseColor = new Color('#151d26')
      .lerp(new Color('#26384a'), 0.18 + intensity * 0.22)
      .multiplyScalar(bodyContrast);
    const detailColor = neutralTint.clone().lerp(dominanceColor, 0.35 + intensity * 0.5);
    const laneColor = new Color('#6885a8').lerp(dominanceColor, 0.22 + recencyCurve * 0.22);

    // District plot platform
    pushSolid(plots, 'plot', event.sequence, {
      position: [cx, plotHeight * 0.5 - 0.012, cz],
      rotationY: yaw,
      size: [plotSpanX, plotHeight, plotSpanZ],
      color: plotColor,
      birthAtMs: eventBirthAt,
      riseDelayMs: 0,
      riseDurationMs: Math.round(780 * birthDurationScale)
    }, MAX_PLOT_INSTANCES);
    pushLight(
      shadowPads,
      'shadow',
      event.sequence,
      {
        position: [cx, 0.004, cz],
        rotationY: yaw,
        size: [plotSpanX * 1.1, 0.01, plotSpanZ * 1.1],
        color: new Color('#000000'),
        opacity: 0.085 + (1 - recencyCurve) * 0.06,
        birthAtMs: eventBirthAt,
        riseDelayMs: 0,
        riseDurationMs: Math.round(640 * birthDurationScale)
      },
      MAX_SHADOW_PAD_INSTANCES
    );
    pushLight(
      shadowPads,
      'shadow',
      event.sequence,
      {
        position: [cx, 0.006, cz],
        rotationY: yaw,
        size: [plotSpanX * 0.72, 0.012, plotSpanZ * 0.72],
        color: new Color('#000000'),
        opacity: 0.11 + (1 - recencyCurve) * 0.07,
        birthAtMs: eventBirthAt,
        riseDelayMs: 20,
        riseDurationMs: Math.round(700 * birthDurationScale)
      },
      MAX_SHADOW_PAD_INSTANCES
    );
    minX = Math.min(minX, cx - plotSpanX * 0.5);
    maxX = Math.max(maxX, cx + plotSpanX * 0.5);
    minZ = Math.min(minZ, cz - plotSpanZ * 0.5);
    maxZ = Math.max(maxZ, cz + plotSpanZ * 0.5);
    maxY = Math.max(maxY, plotHeight);
    frontierX = cx;
    frontierZ = cz;
    frontierSeq = event.sequence;

    // Streets carved into the plot (cross-lanes)
    const streetDeckY = plotHeight + 0.015;
    const streetInsetX = Math.max(0.2, plotSpanX * 0.04);
    const streetInsetZ = Math.max(0.2, plotSpanZ * 0.05);
    pushSolid(streetDecks, 'street', event.sequence, {
      position: [cx, streetDeckY, cz],
      rotationY: yaw,
      size: [plotSpanX - streetInsetX, 0.028, districtStreetWidth],
      color: streetColor.clone(),
      birthAtMs: eventBirthAt,
      riseDelayMs: 40,
      riseDurationMs: Math.round(620 * birthDurationScale)
    }, MAX_STREET_INSTANCES);
    pushSolid(streetDecks, 'street', event.sequence, {
      position: [cx, streetDeckY, cz],
      rotationY: yaw,
      size: [districtStreetWidth * 0.92, 0.028, plotSpanZ - streetInsetZ],
      color: streetColor.clone().multiplyScalar(1.05),
      birthAtMs: eventBirthAt,
      riseDelayMs: 70,
      riseDurationMs: Math.round(620 * birthDurationScale)
    }, MAX_STREET_INSTANCES);

    // Lane lines and curb/edge highlights
    const laneLineColor = laneColor.clone().multiplyScalar(0.6 + recencyCurve * 0.6);
    const curbColor = new Color('#29465c').lerp(dominanceColor, 0.1 + recencyCurve * 0.25);
    const lineHeight = 0.022;
    pushLight(laneLights, 'lane', event.sequence, {
      position: [cx, plotHeight + 0.03, cz],
      rotationY: yaw,
      size: [plotSpanX - streetInsetX - 0.3, lineHeight, 0.03],
      color: laneLineColor.clone(),
      opacity: 0.22 + recencyCurve * 0.18,
      birthAtMs: eventBirthAt,
      riseDelayMs: 120,
      riseDurationMs: Math.round(700 * birthDurationScale),
      pulseAmp: (0.04 + intensity * 0.07) * pulseMotionScale,
      pulseSpeed: (0.3 + intensity * 0.55) * pulseSpeedScale,
      pulsePhase: event.sequence * 0.41
    }, MAX_LANE_LIGHT_INSTANCES);
    pushLight(laneLights, 'lane', event.sequence, {
      position: [cx, plotHeight + 0.03, cz],
      rotationY: yaw + Math.PI * 0.5,
      size: [plotSpanZ - streetInsetZ - 0.28, lineHeight, 0.03],
      color: laneLineColor.clone().multiplyScalar(0.9),
      opacity: 0.18 + recencyCurve * 0.14,
      birthAtMs: eventBirthAt,
      riseDelayMs: 150,
      riseDurationMs: Math.round(700 * birthDurationScale),
      pulseAmp: (0.04 + intensity * 0.06) * pulseMotionScale,
      pulseSpeed: (0.25 + intensity * 0.5) * pulseSpeedScale,
      pulsePhase: event.sequence * 0.53
    }, MAX_LANE_LIGHT_INSTANCES);
    pushLight(laneLights, 'lane', event.sequence, {
      position: [cx, plotHeight + 0.034, cz],
      rotationY: yaw,
      size: [Math.max(0.14, districtStreetWidth * 0.95), 0.028, Math.max(0.14, districtStreetWidth * 0.95)],
      color: laneLineColor.clone().lerp(dominanceColor, 0.18).multiplyScalar(0.95 + recencyCurve * 0.35),
      opacity: 0.16 + recencyCurve * 0.16,
      birthAtMs: eventBirthAt,
      riseDelayMs: 155,
      riseDurationMs: Math.round(720 * birthDurationScale),
      pulseAmp: (0.035 + intensity * 0.05) * pulseMotionScale,
      pulseSpeed: (0.2 + intensity * 0.24) * pulseSpeedScale,
      pulsePhase: event.sequence * 0.72
    }, MAX_LANE_LIGHT_INSTANCES);

    const curbThickness = 0.03;
    const curbY = plotHeight + 0.032;
    const curbLengthX = plotSpanX - 0.08;
    const curbLengthZ = plotSpanZ - 0.08;
    const curbOffsetX = plotSpanX * 0.5 - 0.04;
    const curbOffsetZ = plotSpanZ * 0.5 - 0.04;
    const curbPairs: Array<{ lx: number; lz: number; sx: number; sz: number }> = [
      { lx: 0, lz: curbOffsetZ, sx: curbLengthX, sz: curbThickness },
      { lx: 0, lz: -curbOffsetZ, sx: curbLengthX, sz: curbThickness },
      { lx: curbOffsetX, lz: 0, sx: curbThickness, sz: curbLengthZ },
      { lx: -curbOffsetX, lz: 0, sx: curbThickness, sz: curbLengthZ }
    ];
    for (let i = 0; i < curbPairs.length; i++) {
      const c = curbPairs[i];
      const [rx, rz] = rotateLocalPoint(c.lx, c.lz, yaw);
      pushLight(laneLights, 'lane', event.sequence, {
        position: [cx + rx, curbY, cz + rz],
        rotationY: yaw,
        size: [c.sx, 0.018, c.sz],
        color: curbColor.clone().multiplyScalar(0.6 + recencyCurve * 0.45),
        opacity: 0.12 + recencyCurve * 0.12,
        birthAtMs: eventBirthAt,
        riseDelayMs: 180 + i * 30,
        riseDurationMs: Math.round(760 * birthDurationScale)
      }, MAX_LANE_LIGHT_INSTANCES);
    }

    // Lightweight local traffic on district cross streets.
    const localCarY = plotHeight + 0.046;
    const localCarCountPerLane = Math.max(
      0,
      Math.round((intensity > 0.18 ? 1 : 0) + carDensityScale * (tradeDensity > 0.2 ? 1 : 0))
    );
    for (let c = 0; c < localCarCountPerLane; c++) {
      const huePick = pseudoRandom(event.sequence * 211 + c * 17);
      const carColor = huePick > 0.84 ? new Color('#ffb35d') : huePick > 0.58 ? new Color('#e7f3ff') : new Color('#7ce8ff');
      pushLight(trafficCars, 'car', event.sequence, {
        position: [cx, localCarY, cz],
        rotationY: yaw,
        size: [0.05, 0.028, 0.12],
        color: carColor,
        opacity: 0.34 + recencyCurve * 0.18,
        birthAtMs: eventBirthAt,
        riseDelayMs: 200 + c * 25,
        riseDurationMs: Math.round(680 * birthDurationScale),
        pulseAmp: 0.03 * pulseMotionScale,
        pulseSpeed: (0.1 + c * 0.03) * pulseSpeedScale,
        pulsePhase: event.sequence * 0.15 + c * 0.5,
        slideAxis: 'x',
        slideSpan: Math.max(0.6, (plotSpanX - 0.8) * 0.78),
        slideSpeed: (0.03 + huePick * 0.035) * carMotionScale,
        slidePhase: pseudoRandom(event.sequence * 421 + c * 19)
      }, MAX_TRAFFIC_CAR_INSTANCES);
      pushLight(trafficCars, 'car', event.sequence, {
        position: [cx, localCarY + 0.002, cz],
        rotationY: yaw + Math.PI * 0.5,
        size: [0.05, 0.028, 0.12],
        color: carColor.clone().multiplyScalar(huePick > 0.84 ? 0.9 : 1.06),
        opacity: 0.28 + recencyCurve * 0.14,
        birthAtMs: eventBirthAt,
        riseDelayMs: 220 + c * 25,
        riseDurationMs: Math.round(720 * birthDurationScale),
        pulseAmp: 0.025 * pulseMotionScale,
        pulseSpeed: (0.095 + c * 0.028) * pulseSpeedScale,
        pulsePhase: event.sequence * 0.18 + c * 0.44,
        slideAxis: 'z',
        slideSpan: Math.max(0.6, (plotSpanZ - 0.75) * 0.76),
        slideSpeed: (0.028 + pseudoRandom(event.sequence * 603 + c * 23) * 0.032) * carMotionScale,
        slidePhase: pseudoRandom(event.sequence * 557 + c * 11)
      }, MAX_TRAFFIC_CAR_INSTANCES);
    }

    // Corridor roads and moving light flow between district centers.
    const districtCenter: [number, number, number] = [cx, plotHeight + 0.02, cz];
    const districtPlotSpan = Math.max(plotSpanX, plotSpanZ);
    if (prevDistrictCenter) {
      const seg = segmentYawAndLength(prevDistrictCenter, districtCenter);
      const clearLength = Math.max(0.35, seg.length - (prevDistrictPlotSpan + districtPlotSpan) * 0.34);
      if (clearLength > 0.4) {
        const corridorY = 0.02;
        pushSolid(streetDecks, 'street', event.sequence, {
          position: [seg.mid[0], corridorY, seg.mid[2]],
          rotationY: seg.yaw,
          size: [1.35 + intensity * 0.45, 0.02, clearLength],
          color: streetColor.clone().multiplyScalar(0.9),
          birthAtMs: eventBirthAt,
          riseDelayMs: 40,
          riseDurationMs: Math.round(680 * birthDurationScale)
        }, MAX_STREET_INSTANCES);

        pushLight(laneLights, 'lane', event.sequence, {
          position: [seg.mid[0], corridorY + 0.02, seg.mid[2]],
          rotationY: seg.yaw,
          size: [0.06, 0.02, clearLength * 0.94],
          color: laneLineColor.clone().multiplyScalar(0.85),
          opacity: 0.12 + recencyCurve * 0.12,
          birthAtMs: eventBirthAt,
          riseDelayMs: 140,
          riseDurationMs: Math.round(800 * birthDurationScale),
          pulseAmp: 0.05 * pulseMotionScale,
          pulseSpeed: 0.22 * pulseSpeedScale,
          pulsePhase: event.sequence * 0.37
        }, MAX_LANE_LIGHT_INSTANCES);
        pushLight(laneLights, 'lane', event.sequence, {
          position: [seg.mid[0], corridorY + 0.022, seg.mid[2]],
          rotationY: seg.yaw,
          size: [0.22, 0.02, 0.22],
          color: laneLineColor.clone().lerp(dominanceColor, 0.14).multiplyScalar(0.75 + recencyCurve * 0.35),
          opacity: 0.12 + recencyCurve * 0.12,
          birthAtMs: eventBirthAt,
          riseDelayMs: 165,
          riseDurationMs: Math.round(760 * birthDurationScale),
          pulseAmp: 0.03 * pulseMotionScale,
          pulseSpeed: 0.12 * pulseSpeedScale,
          pulsePhase: event.sequence * 0.2
        }, MAX_LANE_LIGHT_INSTANCES);

        // Moving light streaks: cheap city-life motion cue
        for (let f = 0; f < flowCount; f++) {
          pushLight(flowLights, 'flow', event.sequence, {
            position: [seg.mid[0], corridorY + 0.028, seg.mid[2]],
            rotationY: seg.yaw,
            size: [0.14 + f * 0.03, 0.03, Math.max(0.45, clearLength * (0.14 + f * 0.04))],
            color: dominanceColor.clone().lerp(neutralTint, 0.35).multiplyScalar(0.65 + recencyCurve * 0.55),
            opacity: (0.28 + recencyCurve * 0.2) * (0.85 + glowIntensityScale * 0.15),
            birthAtMs: eventBirthAt,
            riseDelayMs: 180 + f * 40,
            riseDurationMs: Math.round(760 * birthDurationScale),
            pulseAmp: (0.06 + intensity * 0.08) * pulseMotionScale,
            pulseSpeed: (0.35 + intensity * 0.55) * pulseSpeedScale,
            pulsePhase: event.sequence * (0.33 + f * 0.11),
            slideAxis: 'z',
            slideSpan: Math.max(0.8, clearLength * 0.8),
            slideSpeed: (0.14 + f * 0.06 + intensity * 0.12) * slideSpeedScale,
            slidePhase: pseudoRandom(event.sequence * 100 + f) * 0.95
          }, MAX_FLOW_LIGHT_INSTANCES);
        }

        const corridorCarCount = Math.max(
          RUNTIME_QUALITY_CONFIG.reducedMotion ? 0 : 1,
          Math.round((1 + clearLength * 0.12) * carDensityScale)
        );
        for (let c = 0; c < corridorCarCount; c++) {
          const carSeed = event.sequence * 177 + c * 13;
          const carColor =
            pseudoRandom(carSeed + 1) > 0.82
              ? new Color('#ffac5b')
              : pseudoRandom(carSeed + 2) > 0.52
                ? new Color('#ecf7ff')
                : new Color('#84ecff');
          pushLight(trafficCars, 'car', event.sequence, {
            position: [seg.mid[0], corridorY + 0.03, seg.mid[2]],
            rotationY: seg.yaw,
            size: [0.05, 0.03, 0.14],
            color: carColor,
            opacity: 0.34 + recencyCurve * 0.18,
            birthAtMs: eventBirthAt,
            riseDelayMs: 190 + c * 20,
            riseDurationMs: Math.round(720 * birthDurationScale),
            pulseAmp: 0.02 * pulseMotionScale,
            pulseSpeed: (0.08 + c * 0.02) * pulseSpeedScale,
            pulsePhase: event.sequence * 0.11 + c * 0.4,
            slideAxis: 'z',
            slideSpan: Math.max(0.9, clearLength * 0.82),
            slideSpeed: (0.02 + pseudoRandom(carSeed + 3) * 0.045) * carMotionScale,
            slidePhase: pseudoRandom(carSeed + 4)
          }, MAX_TRAFFIC_CAR_INSTANCES);
        }
      }
    }
    prevDistrictCenter = districtCenter;
    prevDistrictPlotSpan = districtPlotSpan;

    // District massing: podium / shaft / spire tiers with more negative space and capped extremes.
    const buildableRadiusX = plotSpanX * 0.36;
    const buildableRadiusZ = plotSpanZ * 0.36;
    const centralStreetReserve = districtStreetWidth * 1.18;
    const majorCount = Math.max(
      3,
      Math.min(8, Math.round((3.7 + tradeDensity * 3.4 + volumeSignal * 2.5) * districtDensityScale))
    );
    const minorCount = Math.max(
      1,
      Math.min(4, Math.round((1.6 + tradeDensity * 1.4 + intensity * 1.35) * districtDensityScale))
    );
    const centralVerticality = clampFinite(1.05 + intensity * 0.9 + sizeSignal * 0.65, 1.4, 0.9, 2.6);
    const verticalBias = clampFinite(1 + dominance * 0.42 + Math.sign(priceChange || 0) * 0.06, 1, 0.6, 1.8);
    const capHeight = 24 + intensity * 8 + sizeSignal * 5;

    const buildSeed = event.sequence * 1297;
    const totalCandidates = majorCount + minorCount;
    const acceptedTowerLocals: Array<[number, number]> = [];
    for (let i = 0; i < totalCandidates; i++) {
      if (
        towerMasses.length >= MAX_TOWER_MASS_INSTANCES ||
        detailLights.length >= MAX_DETAIL_LIGHT_INSTANCES ||
        haloGlows.length >= MAX_HALO_GLOW_INSTANCES
      ) {
        break;
      }

      const seed = buildSeed + i * 31;
      const candidateT = i / Math.max(1, totalCandidates - 1);
      const radialBand = Math.pow(candidateT, 0.72);
      const radialX = buildableRadiusX * (0.18 + radialBand * 0.78) * (0.72 + pseudoRandom(seed + 1) * 0.5);
      const radialZ = buildableRadiusZ * (0.14 + radialBand * 0.82) * (0.68 + pseudoRandom(seed + 2) * 0.58);
      const angle = i * 2.3999632297 + pseudoRandom(seed + 3) * 0.85;
      const lx = Math.cos(angle) * radialX;
      const lz = Math.sin(angle) * radialZ;
      const isMajor = i < majorCount;

      if (Math.abs(lx) < centralStreetReserve * 0.8 || Math.abs(lz) < centralStreetReserve * 0.75) {
        continue;
      }

      let tooClose = false;
      const minSpacing = (isMajor ? 0.7 : 0.52) + (1 - districtDensityScale) * 0.42;
      for (let p = 0; p < acceptedTowerLocals.length; p++) {
        const prev = acceptedTowerLocals[p];
        if (Math.hypot(prev[0] - lx, prev[1] - lz) < minSpacing) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) {
        continue;
      }
      acceptedTowerLocals.push([lx, lz]);

      const [rx, rz] = rotateLocalPoint(lx, lz, yaw);
      const worldX = cx + rx;
      const worldZ = cz + rz;
      const radialNorm = Math.min(1, Math.hypot(lx / buildableRadiusX, lz / buildableRadiusZ));
      const centerWeight = 1 - radialNorm;

      const footprintW = clampFinite(
        (isMajor ? 0.45 : 0.3) + pseudoRandom(seed + 4) * (isMajor ? 0.8 : 0.55) + volumeSignal * 0.18,
        isMajor ? 0.72 : 0.45,
        0.22,
        2.6
      );
      const footprintD = clampFinite(
        (isMajor ? 0.4 : 0.28) + pseudoRandom(seed + 5) * (isMajor ? 0.7 : 0.45) + volumeSignal * 0.16,
        isMajor ? 0.66 : 0.4,
        0.2,
        2.5
      );

      const podiumH = clampFinite(
        0.35 + (isMajor ? 0.35 : 0.22) + intensity * 0.35 + (1 - radialNorm) * 0.42,
        0.8,
        0.28,
        2.2
      );
      const shaftH = clampFinite(
        (0.7 + centerWeight * (4.2 + intensity * 8.5) * centralVerticality + tradeDensity * 1.8) * verticalBias,
        4.2,
        0.6,
        capHeight
      );
      const addSpire = isMajor && (centerWeight > 0.22 || pseudoRandom(seed + 6) > 0.72);
      const spireH = addSpire
        ? clampFinite(0.45 + centerWeight * (3.2 + intensity * 4.4) + sizeSignal * 1.2, 1.8, 0.35, 11)
        : 0;

      const towerYaw = yaw + (pseudoRandom(seed + 7) - 0.5) * 0.12;
      const podiumY = plotHeight + podiumH * 0.5;
      const shaftY = plotHeight + podiumH + shaftH * 0.5;
      const spireY = plotHeight + podiumH + shaftH + spireH * 0.5;
      const districtId = `D-${event.sequence}`;
      const buildingId = `${districtId}-B-${i}`;
      const totalTowerHeight = podiumH + shaftH + spireH;

      const baseTint = towerBaseColor
        .clone()
        .lerp(dominanceColor, 0.035 + recencyCurve * 0.06)
        .multiplyScalar(0.9 + recencyCurve * 0.12);
      const shaftTint = baseTint
        .clone()
        .lerp(detailColor, 0.06 + recencyCurve * 0.07)
        .multiplyScalar(topContrast * (0.95 + centerWeight * 0.18));
      const spireTint = shaftTint.clone().lerp(detailColor, 0.18 + recencyCurve * 0.12).multiplyScalar(1.03 + recencyCurve * 0.12);

      const riseDelayMs = Math.floor(
        clampFinite(i * (18 + intensity * 18) * birthDurationScale, 0, 0, 1800)
      );
      const riseDurationMs = Math.floor(
        clampFinite((720 + (1 - centerWeight) * 420 + intensity * 260) * birthDurationScale, 880, 240, 2200)
      );

      // Podium tier
      const podiumSize: [number, number, number] = [footprintW * 1.15, podiumH, footprintD * 1.15];
      const podiumAdded = pushSolid(towerMasses, 'tower', event.sequence, {
        position: [worldX, podiumY, worldZ],
        rotationY: towerYaw,
        size: podiumSize,
        color: baseTint,
        birthAtMs: eventBirthAt,
        riseDelayMs,
        riseDurationMs: Math.max(400, riseDurationMs - 180)
      }, MAX_TOWER_MASS_INSTANCES);
      if (podiumAdded) {
        towerMassMeta.push({
          buildingId,
          districtId,
          sequence: event.sequence,
          tier: 'podium',
          tierHeight: podiumH,
          totalHeight: totalTowerHeight,
          buyVolume: m.buyVolume,
          sellVolume: m.sellVolume,
          intensity,
          tradeCount,
          dominance,
          timestamp: event.windowEnd,
          source: event.source
        });
        minX = Math.min(minX, worldX - podiumSize[0] * 0.5);
        maxX = Math.max(maxX, worldX + podiumSize[0] * 0.5);
        minZ = Math.min(minZ, worldZ - podiumSize[2] * 0.5);
        maxZ = Math.max(maxZ, worldZ + podiumSize[2] * 0.5);
        maxY = Math.max(maxY, podiumY + podiumSize[1] * 0.5);
      }

      // Mid shaft tier
      const shaftSize: [number, number, number] = [
        footprintW * (0.72 + pseudoRandom(seed + 8) * 0.18),
        shaftH,
        footprintD * (0.72 + pseudoRandom(seed + 9) * 0.18)
      ];
      const shaftAdded = pushSolid(towerMasses, 'tower', event.sequence, {
        position: [worldX, shaftY, worldZ],
        rotationY: towerYaw,
        size: shaftSize,
        color: shaftTint,
        birthAtMs: eventBirthAt,
        riseDelayMs: riseDelayMs + 40,
        riseDurationMs
      }, MAX_TOWER_MASS_INSTANCES);
      if (shaftAdded) {
        towerMassMeta.push({
          buildingId,
          districtId,
          sequence: event.sequence,
          tier: 'shaft',
          tierHeight: shaftH,
          totalHeight: totalTowerHeight,
          buyVolume: m.buyVolume,
          sellVolume: m.sellVolume,
          intensity,
          tradeCount,
          dominance,
          timestamp: event.windowEnd,
          source: event.source
        });
        minX = Math.min(minX, worldX - shaftSize[0] * 0.5);
        maxX = Math.max(maxX, worldX + shaftSize[0] * 0.5);
        minZ = Math.min(minZ, worldZ - shaftSize[2] * 0.5);
        maxZ = Math.max(maxZ, worldZ + shaftSize[2] * 0.5);
        maxY = Math.max(maxY, shaftY + shaftSize[1] * 0.5);
      }

      // Spire tier (optional) to improve silhouette rhythm
      if (addSpire && spireH > 0.2) {
        const spireSize: [number, number, number] = [
          Math.max(0.14, footprintW * 0.34),
          spireH,
          Math.max(0.14, footprintD * 0.34)
        ];
        const spireAdded = pushSolid(towerMasses, 'tower', event.sequence, {
          position: [worldX, spireY, worldZ],
          rotationY: towerYaw,
          size: spireSize,
          color: spireTint,
          birthAtMs: eventBirthAt,
          riseDelayMs: riseDelayMs + 80,
          riseDurationMs: Math.max(360, riseDurationMs - 120)
        }, MAX_TOWER_MASS_INSTANCES);
        if (spireAdded) {
          towerMassMeta.push({
            buildingId,
            districtId,
            sequence: event.sequence,
            tier: 'spire',
            tierHeight: spireH,
            totalHeight: totalTowerHeight,
            buyVolume: m.buyVolume,
            sellVolume: m.sellVolume,
            intensity,
            tradeCount,
            dominance,
            timestamp: event.windowEnd,
            source: event.source
          });
          minX = Math.min(minX, worldX - spireSize[0] * 0.5);
          maxX = Math.max(maxX, worldX + spireSize[0] * 0.5);
          minZ = Math.min(minZ, worldZ - spireSize[2] * 0.5);
          maxZ = Math.max(maxZ, worldZ + spireSize[2] * 0.5);
          maxY = Math.max(maxY, spireY + spireSize[1] * 0.5);
        }
      }

      // Lightweight detail language: vertical strips + occasional bands + crown markers.
      const detailBaseColor = detailColor
        .clone()
        .multiplyScalar(historySubdue * (0.75 + centerWeight * 0.28) * (0.88 + glowIntensityScale * 0.12));
      const stripHeight = Math.min(shaftH * (0.42 + pseudoRandom(seed + 10) * 0.35), shaftH * 0.9);
      const stripThickness = 0.035 + Math.min(footprintW, footprintD) * 0.06;
      const stripOffsetX = footprintW * (0.33 + pseudoRandom(seed + 11) * 0.08);
      const stripOffsetZ = footprintD * (0.33 + pseudoRandom(seed + 12) * 0.08);
      const sideChoice = pseudoRandom(seed + 13);
      const stripLocal =
        sideChoice > 0.5
          ? ([stripOffsetX * (pseudoRandom(seed + 14) > 0.5 ? 1 : -1), 0] as [number, number])
          : ([0, stripOffsetZ * (pseudoRandom(seed + 14) > 0.5 ? 1 : -1)] as [number, number]);
      const [dsx, dsz] = rotateLocalPoint(stripLocal[0], stripLocal[1], towerYaw);
      if (detailDensityScale > 0.2 && (isMajor || pseudoRandom(seed + 101) < detailDensityScale + 0.12)) {
        pushLight(detailLights, 'detail', event.sequence, {
          position: [worldX + dsx, plotHeight + podiumH + stripHeight * 0.55, worldZ + dsz],
          rotationY: towerYaw,
          size: [
            stripLocal[0] !== 0 ? stripThickness : Math.max(0.06, footprintW * 0.46),
            stripHeight,
            stripLocal[1] !== 0 ? stripThickness : Math.max(0.06, footprintD * 0.46)
          ],
          color: detailBaseColor.clone(),
          opacity: MathUtils.clamp(
            (0.16 + recencyCurve * 0.18 + intensity * 0.16) * (0.72 + glowIntensityScale * 0.28),
            0.1,
            0.62
          ),
          birthAtMs: eventBirthAt,
          riseDelayMs: riseDelayMs + 120,
          riseDurationMs: Math.max(420, riseDurationMs - 80),
          pulseAmp: (0.05 + intensity * 0.08) * pulseMotionScale,
          pulseSpeed: (0.25 + recencyCurve * 0.35) * pulseSpeedScale,
          pulsePhase: event.sequence * 0.61 + i * 0.09
        }, MAX_DETAIL_LIGHT_INSTANCES);
      }

      if (detailDensityScale > 0.3 && (isMajor || pseudoRandom(seed + 15) > 0.62 + (1 - detailDensityScale) * 0.2)) {
        const bandCount = Math.max(0, Math.round((isMajor ? 2 : 1) * detailDensityScale));
        for (let b = 0; b < bandCount; b++) {
          const bandY = plotHeight + podiumH + shaftH * (0.22 + b * 0.34 + pseudoRandom(seed + 16 + b) * 0.06);
          pushLight(detailLights, 'detail', event.sequence, {
            position: [worldX, bandY, worldZ],
            rotationY: towerYaw,
            size: [Math.max(0.12, footprintW * 0.86), 0.03 + b * 0.005, Math.max(0.12, footprintD * 0.86)],
            color: detailBaseColor.clone().multiplyScalar(0.9 + b * 0.18),
            opacity: MathUtils.clamp(
              (0.1 + intensity * 0.12 + recencyCurve * 0.1) * (0.7 + glowIntensityScale * 0.3),
              0.06,
              0.44
            ),
            birthAtMs: eventBirthAt,
            riseDelayMs: riseDelayMs + 140 + b * 30,
            riseDurationMs: Math.max(420, riseDurationMs - 40)
          }, MAX_DETAIL_LIGHT_INSTANCES);
        }
      }

      // Skyline readability layer: subtle bright top band for height legibility.
      pushLight(detailLights, 'detail', event.sequence, {
        position: [worldX, plotHeight + podiumH + shaftH + 0.03, worldZ],
        rotationY: towerYaw,
        size: [Math.max(0.1, footprintW * 0.78), 0.028, Math.max(0.1, footprintD * 0.78)],
        color: detailColor.clone().lerp(dominanceColor, 0.22 + recencyCurve * 0.18).multiplyScalar(0.9 + recencyCurve * 0.45),
        opacity: MathUtils.clamp(0.1 + recencyCurve * 0.14 + intensity * 0.08, 0.07, 0.38),
        birthAtMs: eventBirthAt,
        riseDelayMs: riseDelayMs + 170,
        riseDurationMs: Math.max(300, riseDurationMs - 40),
        pulseAmp: 0.02 * pulseMotionScale,
        pulseSpeed: 0.1 * pulseSpeedScale,
        pulsePhase: event.sequence * 0.32 + i * 0.13
      }, MAX_DETAIL_LIGHT_INSTANCES);

      const topY = plotHeight + podiumH + shaftH + (addSpire ? spireH : 0);
      pushLight(haloGlows, 'glow', event.sequence, {
        position: [worldX, topY + 0.08, worldZ],
        rotationY: towerYaw,
        size: [Math.max(0.12, footprintW * (addSpire ? 0.42 : 0.65)), 0.06, Math.max(0.12, footprintD * (addSpire ? 0.42 : 0.65))],
        color: detailBaseColor.clone().lerp(dominanceColor, 0.18 + recencyCurve * 0.18),
        opacity: MathUtils.clamp(
          (0.16 + intensity * 0.18) * historySubdue * frontierEmphasis * glowIntensityScale,
          0.08,
          0.72
        ),
        birthAtMs: eventBirthAt,
        riseDelayMs: riseDelayMs + 190,
        riseDurationMs: Math.max(360, riseDurationMs - 60),
        pulseAmp: (0.1 + intensity * 0.16) * pulseMotionScale,
        pulseSpeed: (0.24 + centerWeight * 0.34) * pulseSpeedScale,
        pulsePhase: event.sequence * 0.47 + i * 0.21
      }, MAX_HALO_GLOW_INSTANCES);

      // Soft halo sheet (fake bloom support) only for stronger masses.
      if (isMajor && haloGlows.length < MAX_HALO_GLOW_INSTANCES) {
        pushLight(haloGlows, 'glow', event.sequence, {
          position: [worldX, topY + 0.28, worldZ],
          rotationY: towerYaw,
          size: [Math.max(0.22, footprintW * 1.2), 0.11 + intensity * 0.07, Math.max(0.22, footprintD * 1.2)],
          color: dominanceColor.clone().lerp(neutralTint, 0.3).multiplyScalar(0.62 + recencyCurve * 0.5),
          opacity: MathUtils.clamp(
            (0.08 + intensity * 0.14) * frontierEmphasis * glowIntensityScale,
            0.04,
            0.36
          ),
          birthAtMs: eventBirthAt,
          riseDelayMs: riseDelayMs + 220,
          riseDurationMs: Math.max(380, riseDurationMs),
          pulseAmp: (0.07 + intensity * 0.08) * pulseMotionScale,
          pulseSpeed: (0.18 + intensity * 0.18) * pulseSpeedScale,
          pulsePhase: event.sequence * 0.29 + i * 0.07
        }, MAX_HALO_GLOW_INSTANCES);
      }
    }

    // District-scale halo and edge glow for frontier readability.
    const districtGlowColor = dominanceColor.clone().lerp(neutralTint, 0.28).multiplyScalar(0.72 + recencyCurve * 0.6);
    pushLight(haloGlows, 'glow', event.sequence, {
      position: [cx, plotHeight + 0.08, cz],
      rotationY: yaw,
      size: [plotSpanX * 0.95, 0.07, plotSpanZ * 0.95],
      color: districtGlowColor.clone(),
      opacity: MathUtils.clamp(
        (0.12 + intensity * 0.14) * historySubdue * frontierEmphasis * glowIntensityScale,
        0.06,
        0.42
      ),
      birthAtMs: eventBirthAt,
      riseDelayMs: 90,
      riseDurationMs: Math.round(820 * birthDurationScale),
      pulseAmp: (0.06 + intensity * 0.08) * pulseMotionScale,
      pulseSpeed: (0.14 + recencyCurve * 0.16) * pulseSpeedScale,
      pulsePhase: event.sequence * 0.23
    }, MAX_HALO_GLOW_INSTANCES);
  }

  return {
    shadowPads: shadowPads.slice(0, MAX_SHADOW_PAD_INSTANCES),
    plots: plots.slice(0, MAX_PLOT_INSTANCES),
    streetDecks: streetDecks.slice(0, MAX_STREET_INSTANCES),
    towerMasses: towerMasses.slice(0, MAX_TOWER_MASS_INSTANCES),
    towerMassMeta: towerMassMeta.slice(0, MAX_TOWER_MASS_INSTANCES),
    laneLights: laneLights.slice(0, MAX_LANE_LIGHT_INSTANCES),
    detailLights: detailLights.slice(0, MAX_DETAIL_LIGHT_INSTANCES),
    haloGlows: haloGlows.slice(0, MAX_HALO_GLOW_INSTANCES),
    flowLights: flowLights.slice(0, MAX_FLOW_LIGHT_INSTANCES),
    trafficCars: trafficCars.slice(0, MAX_TRAFFIC_CAR_INSTANCES),
    bounds:
      minX === Number.POSITIVE_INFINITY
        ? null
        : {
            minX,
            maxX,
            minZ,
            maxZ,
            maxY,
            frontierX,
            frontierZ,
            frontierSeq
          }
  };
}

function applySolidInstances(mesh: InstancedMesh | null, items: SolidInstance[], nowMs: number) {
  if (!mesh) {
    return;
  }

  const capacity = mesh.instanceMatrix?.count ?? 0;
  const count = Math.min(items.length, capacity);
  if (capacity <= 0 || count <= 0) {
    return;
  }

  for (let i = 0; i < count; i++) {
    const item = items[i];
    const durationMs = Math.max(1, item.riseDurationMs);
    const ageMs = nowMs - item.birthAtMs - item.riseDelayMs;
    const progress = easeOutCubic(ageMs / durationMs);
    const alive = ageMs >= 0 ? progress : 0;

    const sx = Math.max(0.0001, item.size[0]);
    const sy = Math.max(0.0001, item.size[1] * alive);
    const sz = Math.max(0.0001, item.size[2]);
    const y = item.position[1] - item.size[1] * 0.5 + sy * 0.5;

    if (
      !Number.isFinite(sx) ||
      !Number.isFinite(sy) ||
      !Number.isFinite(sz) ||
      !Number.isFinite(y) ||
      !Number.isFinite(item.position[0]) ||
      !Number.isFinite(item.position[2]) ||
      !Number.isFinite(item.rotationY)
    ) {
      continue;
    }

    tempObject.position.set(item.position[0], y, item.position[2]);
    tempObject.rotation.set(0, item.rotationY, 0);
    tempObject.scale.set(sx, sy, sz);
    tempObject.updateMatrix();
    mesh.setMatrixAt(i, tempObject.matrix);
  }

  mesh.instanceMatrix.needsUpdate = true;
}

function applyLightInstances(mesh: InstancedMesh | null, items: LightInstance[], nowMs: number) {
  if (!mesh) {
    return;
  }

  const capacity = mesh.instanceMatrix?.count ?? 0;
  const count = Math.min(items.length, capacity);
  if (capacity <= 0 || count <= 0) {
    return;
  }

  const timeSec = nowMs * 0.001;

  for (let i = 0; i < count; i++) {
    const item = items[i];
    const durationMs = Math.max(1, item.riseDurationMs);
    const ageMs = nowMs - item.birthAtMs - item.riseDelayMs;
    const progress = easeOutCubic(ageMs / durationMs);
    const alive = ageMs >= 0 ? progress : 0;

    const pulseAmp = item.pulseAmp ?? 0;
    const pulseSpeed = item.pulseSpeed ?? 0;
    const pulsePhase = item.pulsePhase ?? 0;
    const pulse = pulseAmp > 0 ? 1 + Math.sin(timeSec * pulseSpeed * Math.PI * 2 + pulsePhase) * pulseAmp : 1;

    let px = item.position[0];
    let pz = item.position[2];
    const slideSpan = item.slideSpan ?? 0;
    const slideSpeed = item.slideSpeed ?? 0;
    const slidePhase = item.slidePhase ?? 0;
    if (slideSpan > 0 && slideSpeed > 0) {
      const cycle = (timeSec * slideSpeed + slidePhase) % 1;
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

    const sx = Math.max(0.0001, item.size[0] * (0.96 + (pulse - 1) * 0.9));
    const sy = Math.max(0.0001, item.size[1] * alive * (0.92 + (pulse - 1) * 0.75));
    const sz = Math.max(0.0001, item.size[2] * (0.96 + (pulse - 1) * 0.9));
    const y = item.position[1] - item.size[1] * 0.5 + sy * 0.5;

    if (
      !Number.isFinite(sx) ||
      !Number.isFinite(sy) ||
      !Number.isFinite(sz) ||
      !Number.isFinite(y) ||
      !Number.isFinite(px) ||
      !Number.isFinite(pz) ||
      !Number.isFinite(item.rotationY)
    ) {
      continue;
    }

    tempObject.position.set(px, y, pz);
    tempObject.rotation.set(0, item.rotationY, 0);
    tempObject.scale.set(sx, sy, sz);
    tempObject.updateMatrix();
    mesh.setMatrixAt(i, tempObject.matrix);
  }

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
    if (!mesh) {
      return;
    }

    const capacity = mesh.instanceMatrix?.count ?? 0;
    const count = Math.min(items.length, capacity);
    for (let i = 0; i < count; i++) {
      const item = items[i];
      const scaled = item.color.clone().multiplyScalar(brightnessScale * (item.opacity ? 0.65 + item.opacity * 0.7 : 1));
      mesh.setColorAt(i, scaled);
    }
    mesh.count = count;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [meshRef, items, brightnessScale]);

  return null;
}

export function ProceduralCityGrowth() {
  const { events } = useBlockEventStore();
  const { hoveredBuildingId } = useCitySceneStore();
  const visibleEvents = useMemo(() => events.slice(-HISTORY_CAP), [events]);
  const visualData = useMemo(() => buildCityVisualData(visibleEvents), [visibleEvents]);

  const plotMeshRef = useRef<InstancedMesh>(null);
  const shadowPadMeshRef = useRef<InstancedMesh>(null);
  const streetMeshRef = useRef<InstancedMesh>(null);
  const towerMeshRef = useRef<InstancedMesh>(null);
  const hoverShellMeshRef = useRef<InstancedMesh>(null);
  const laneLightMeshRef = useRef<InstancedMesh>(null);
  const detailLightMeshRef = useRef<InstancedMesh>(null);
  const haloGlowMeshRef = useRef<InstancedMesh>(null);
  const flowLightMeshRef = useRef<InstancedMesh>(null);
  const trafficCarMeshRef = useRef<InstancedMesh>(null);
  const matricesSettledRef = useRef(false);
  const optionalEffectsDisabledRef = useRef({
    halo: false,
    flow: false
  });

  const towerColorItems = useMemo(
    () =>
      visualData.towerMasses.map((item, i) => {
        const meta = visualData.towerMassMeta[i];
        if (!meta || !hoveredBuildingId || meta.buildingId !== hoveredBuildingId) {
          return item;
        }

        const hot = meta.tier === 'spire' ? new Color('#fff8bf') : meta.tier === 'shaft' ? new Color('#ffd400') : new Color('#ffe76a');
        return {
          ...item,
          color: hot
        };
      }),
    [visualData.towerMasses, visualData.towerMassMeta, hoveredBuildingId]
  );
  const hoverShellItems = useMemo(() => {
    if (!hoveredBuildingId) {
      return [] as LightInstance[];
    }
    const items: LightInstance[] = [];
    for (let i = 0; i < visualData.towerMasses.length; i++) {
      const meta = visualData.towerMassMeta[i];
      const source = visualData.towerMasses[i];
      if (!meta || !source || meta.buildingId !== hoveredBuildingId) {
        continue;
      }
      items.push({
        ...source,
        size: [source.size[0] * 1.1, source.size[1] * 1.04, source.size[2] * 1.1],
        color: meta.tier === 'spire' ? new Color('#fffce3') : new Color('#ffd400'),
        opacity: meta.tier === 'spire' ? 0.82 : 0.7,
        pulseAmp: 0.12 * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.4 : 1),
        pulseSpeed: 0.45 * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.4 : 1),
        pulsePhase: i * 0.37
      });
    }
    return items.slice(0, 4);
  }, [hoveredBuildingId, visualData.towerMasses, visualData.towerMassMeta]);
  const glowBrightnessScale = 1.18 * (0.82 + RUNTIME_QUALITY_CONFIG.glowIntensityScale * 0.26);
  const flowBrightnessScale = 1.2 * (0.78 + RUNTIME_QUALITY_CONFIG.glowIntensityScale * 0.28);
  const detailBrightnessScale = 1.08 * (0.82 + RUNTIME_QUALITY_CONFIG.glowIntensityScale * 0.22);
  const trafficCarBrightnessScale = 1.18 * (0.86 + RUNTIME_QUALITY_CONFIG.glowIntensityScale * 0.22);

  const latestAnimationEndMs = useMemo(() => {
    let maxMs = 0;
    const layers = [
      visualData.shadowPads,
      visualData.plots,
      visualData.streetDecks,
      visualData.towerMasses,
      visualData.laneLights,
      visualData.detailLights,
      visualData.haloGlows,
      visualData.flowLights,
      visualData.trafficCars,
      hoverShellItems
    ] as const;
    for (const layer of layers) {
      for (const item of layer) {
        maxMs = Math.max(maxMs, item.birthAtMs + item.riseDelayMs + item.riseDurationMs);
      }
    }
    return maxMs;
  }, [visualData]);

  const totalInstances =
    visualData.shadowPads.length +
    visualData.plots.length +
    visualData.streetDecks.length +
    visualData.towerMasses.length +
    visualData.laneLights.length +
    visualData.detailLights.length +
    visualData.haloGlows.length +
    visualData.flowLights.length +
    visualData.trafficCars.length;

  if (
    !instanceBudgetWarned &&
    totalInstances >
      MAX_PLOT_INSTANCES +
        MAX_SHADOW_PAD_INSTANCES +
        MAX_STREET_INSTANCES +
        MAX_TOWER_MASS_INSTANCES +
        MAX_LANE_LIGHT_INSTANCES +
        MAX_DETAIL_LIGHT_INSTANCES +
        MAX_HALO_GLOW_INSTANCES +
        MAX_FLOW_LIGHT_INSTANCES +
        MAX_TRAFFIC_CAR_INSTANCES
  ) {
    instanceBudgetWarned = true;
    console.warn('[BTC Spot City][city] instance budget exceeded, trimming visuals.');
  }

  useLayoutEffect(() => {
    const bounds = visualData.bounds
      ? {
          ...visualData.bounds,
          centerX: (visualData.bounds.minX + visualData.bounds.maxX) * 0.5,
          centerZ: (visualData.bounds.minZ + visualData.bounds.maxZ) * 0.5,
          radius:
            Math.max(
              visualData.bounds.maxX - visualData.bounds.minX,
              visualData.bounds.maxZ - visualData.bounds.minZ
            ) * 0.5
        }
      : null;

    publishCitySceneData(
      bounds,
      visualData.towerMassMeta.map((meta, instanceId) => ({
        instanceId,
        height: meta.tierHeight,
        ...meta
      }))
    );

    matricesSettledRef.current = false;
    const now = Date.now();
    try {
      applyLightInstances(shadowPadMeshRef.current, visualData.shadowPads, now);
      applySolidInstances(plotMeshRef.current, visualData.plots, now);
      applySolidInstances(streetMeshRef.current, visualData.streetDecks, now);
      applySolidInstances(towerMeshRef.current, visualData.towerMasses, now);
      applyLightInstances(hoverShellMeshRef.current, hoverShellItems, now);
      applyLightInstances(laneLightMeshRef.current, visualData.laneLights, now);
      applyLightInstances(detailLightMeshRef.current, visualData.detailLights, now);
      applyLightInstances(trafficCarMeshRef.current, visualData.trafficCars, now);
    } catch (error) {
      warnRuntimeEffect('core instance update', error);
    }

    if (!optionalEffectsDisabledRef.current.halo) {
      try {
        applyLightInstances(haloGlowMeshRef.current, visualData.haloGlows, now);
      } catch (error) {
        optionalEffectsDisabledRef.current.halo = true;
        warnRuntimeEffect('halo glow layer', error);
      }
    }
    if (!optionalEffectsDisabledRef.current.flow) {
      try {
        applyLightInstances(flowLightMeshRef.current, visualData.flowLights, now);
      } catch (error) {
        optionalEffectsDisabledRef.current.flow = true;
        warnRuntimeEffect('flow light layer', error);
      }
    }
  }, [visualData, latestAnimationEndMs, hoverShellItems]);

  const handleTowerPointerMove = (event: ThreeEvent<PointerEvent>) => {
    try {
      if (event.instanceId == null) {
        clearHoveredTowerInstance();
        return;
      }
      setHoveredTowerInstance(event.instanceId);
      event.stopPropagation();
    } catch (error) {
      warnHoverIssue(error);
      clearHoveredTowerInstance();
    }
  };

  const handleTowerPointerOut = () => {
    try {
      clearHoveredTowerInstance();
    } catch (error) {
      warnHoverIssue(error);
    }
  };

  useFrame(() => {
    try {
      const now = Date.now();
      const birthAnimationsSettled = matricesSettledRef.current && now > latestAnimationEndMs;

      if (!birthAnimationsSettled) {
        applyLightInstances(shadowPadMeshRef.current, visualData.shadowPads, now);
        applySolidInstances(plotMeshRef.current, visualData.plots, now);
        applySolidInstances(streetMeshRef.current, visualData.streetDecks, now);
        applySolidInstances(towerMeshRef.current, visualData.towerMasses, now);
        applyLightInstances(hoverShellMeshRef.current, hoverShellItems, now);
        applyLightInstances(laneLightMeshRef.current, visualData.laneLights, now);
        applyLightInstances(detailLightMeshRef.current, visualData.detailLights, now);
      }

      applyLightInstances(trafficCarMeshRef.current, visualData.trafficCars, now);
      applyLightInstances(hoverShellMeshRef.current, hoverShellItems, now);

      if (!optionalEffectsDisabledRef.current.halo) {
        try {
          applyLightInstances(haloGlowMeshRef.current, visualData.haloGlows, now);
        } catch (error) {
          optionalEffectsDisabledRef.current.halo = true;
          warnRuntimeEffect('halo glow animation', error);
        }
      }
      if (!optionalEffectsDisabledRef.current.flow) {
        try {
          applyLightInstances(flowLightMeshRef.current, visualData.flowLights, now);
        } catch (error) {
          optionalEffectsDisabledRef.current.flow = true;
          warnRuntimeEffect('flow light animation', error);
        }
      }

      if (!birthAnimationsSettled && now > latestAnimationEndMs + 120) {
        matricesSettledRef.current = true;
      }
    } catch (error) {
      warnRuntimeEffect('frame update', error);
      matricesSettledRef.current = true;
    }
  });

  if (
    visualData.plots.length === 0 &&
    visualData.streetDecks.length === 0 &&
    visualData.towerMasses.length === 0 &&
    visualData.haloGlows.length === 0
  ) {
    return null;
  }

  return (
    <group>
      <InstancedColorSetup meshRef={shadowPadMeshRef} items={visualData.shadowPads} />
      <InstancedColorSetup meshRef={plotMeshRef} items={visualData.plots} />
      <InstancedColorSetup meshRef={streetMeshRef} items={visualData.streetDecks} />
      <InstancedColorSetup meshRef={towerMeshRef} items={towerColorItems} />
      <InstancedColorSetup meshRef={hoverShellMeshRef} items={hoverShellItems} brightnessScale={1.35} />
      <InstancedColorSetup meshRef={laneLightMeshRef} items={visualData.laneLights} brightnessScale={1.1} />
      <InstancedColorSetup meshRef={detailLightMeshRef} items={visualData.detailLights} brightnessScale={detailBrightnessScale} />
      <InstancedColorSetup meshRef={haloGlowMeshRef} items={visualData.haloGlows} brightnessScale={glowBrightnessScale} />
      <InstancedColorSetup meshRef={flowLightMeshRef} items={visualData.flowLights} brightnessScale={flowBrightnessScale} />
      <InstancedColorSetup meshRef={trafficCarMeshRef} items={visualData.trafficCars} brightnessScale={trafficCarBrightnessScale} />

      <instancedMesh ref={shadowPadMeshRef} args={[undefined, undefined, Math.max(1, visualData.shadowPads.length)]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors transparent opacity={0.3} depthWrite={false} />
      </instancedMesh>

      <instancedMesh ref={plotMeshRef} args={[undefined, undefined, Math.max(1, visualData.plots.length)]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          vertexColors
          color={DEBUG_VIEW_ENABLED ? '#233142' : '#1a2430'}
          roughness={0.92}
          metalness={0.12}
          emissive="#1d3248"
          emissiveIntensity={DEBUG_VIEW_ENABLED ? 0.34 : 0.24}
        />
      </instancedMesh>

      <instancedMesh ref={streetMeshRef} args={[undefined, undefined, Math.max(1, visualData.streetDecks.length)]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          vertexColors
          color="#0a0e14"
          roughness={0.96}
          metalness={0.06}
          emissive="#13202d"
          emissiveIntensity={DEBUG_VIEW_ENABLED ? 0.2 : 0.13}
        />
      </instancedMesh>

      <instancedMesh
        ref={towerMeshRef}
        args={[undefined, undefined, Math.max(1, visualData.towerMasses.length)]}
        castShadow
        receiveShadow
        onPointerMove={handleTowerPointerMove}
        onPointerOut={handleTowerPointerOut}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          vertexColors
          color={DEBUG_VIEW_ENABLED ? '#20303d' : '#182531'}
          roughness={0.74}
          metalness={0.24}
          emissive="#315f82"
          emissiveIntensity={(DEBUG_VIEW_ENABLED ? 1.08 : 0.75) * (0.86 + RUNTIME_QUALITY_CONFIG.glowIntensityScale * 0.24)}
        />
      </instancedMesh>

      <instancedMesh ref={hoverShellMeshRef} args={[undefined, undefined, Math.max(1, hoverShellItems.length)]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.95}
          depthWrite={false}
          toneMapped={false}
          blending={AdditiveBlending}
        />
      </instancedMesh>

      <instancedMesh ref={laneLightMeshRef} args={[undefined, undefined, Math.max(1, visualData.laneLights.length)]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors transparent opacity={0.88} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </instancedMesh>

      <instancedMesh ref={detailLightMeshRef} args={[undefined, undefined, Math.max(1, visualData.detailLights.length)]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors transparent opacity={0.9} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </instancedMesh>

      <instancedMesh ref={haloGlowMeshRef} args={[undefined, undefined, Math.max(1, visualData.haloGlows.length)]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors transparent opacity={0.95} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </instancedMesh>

      <instancedMesh ref={flowLightMeshRef} args={[undefined, undefined, Math.max(1, visualData.flowLights.length)]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors transparent opacity={0.92} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </instancedMesh>

      <instancedMesh ref={trafficCarMeshRef} args={[undefined, undefined, Math.max(1, visualData.trafficCars.length)]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors transparent opacity={0.98} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </instancedMesh>
    </group>
  );
}
