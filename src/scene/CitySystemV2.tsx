import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
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

type DistrictPlacement = {
  sequence: number;
  centerX: number;
  centerZ: number;
  yaw: number;
  radius: number;
  parentIndex: number | null;
};

type CityVisualData = {
  shadowPads: LightInstance[];
  plots: SolidInstance[];
  streetDecks: SolidInstance[];
  towerMasses: SolidInstance[];
  towerMassMeta: TowerHoverMeta[];
  laneLights: LightInstance[];
  detailLights: LightInstance[];
  glowLights: LightInstance[];
  carLights: LightInstance[];
  districtCenters: Array<{ x: number; z: number; y: number }>;
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

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const RING_BASE_SPACING = 10.4;
const RING_RADIUS_GROWTH = 0.92;
const RING_MIN_DISTANCE = 8.2;
const DISTRICT_ATTEMPTS = 22;

const HISTORY_CAP = RUNTIME_QUALITY_CONFIG.historyCap;
const TIER_SCALE =
  RUNTIME_QUALITY_CONFIG.tier === 'low' ? 0.62 : RUNTIME_QUALITY_CONFIG.tier === 'medium' ? 0.82 : 1;
const MAX_SHADOW_PAD_INSTANCES = Math.max(64, Math.floor(520 * TIER_SCALE));
const MAX_PLOT_INSTANCES = Math.max(32, Math.floor(180 * TIER_SCALE));
const MAX_STREET_INSTANCES = Math.max(120, Math.floor(900 * TIER_SCALE));
const MAX_TOWER_INSTANCES = Math.max(260, Math.floor(2000 * TIER_SCALE));
const MAX_LANE_LIGHT_INSTANCES = Math.max(420, Math.floor(2600 * TIER_SCALE));
const MAX_DETAIL_LIGHT_INSTANCES = Math.max(320, Math.floor(2600 * TIER_SCALE));
const MAX_GLOW_LIGHT_INSTANCES = Math.max(260, Math.floor(1800 * TIER_SCALE));
const MAX_CAR_LIGHT_INSTANCES = Math.max(80, Math.floor(1400 * TIER_SCALE));

const tempObject = new Object3D();
let invalidWarnCount = 0;
let runtimeWarnCount = 0;
let hoverWarnCount = 0;

function pseudoRandom(seed: number) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
  return x - Math.floor(x);
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

function warnInvalid(kind: string, sequence: number, reason: string) {
  if (invalidWarnCount >= 48) return;
  invalidWarnCount += 1;
  console.warn(`[BTC Spot City][city-v2] skipped ${kind} seq=${sequence}: ${reason}`);
}

function warnRuntime(kind: string, error: unknown) {
  if (runtimeWarnCount >= 10) return;
  runtimeWarnCount += 1;
  console.warn(
    `[BTC Spot City][city-v2] ${kind}: ${error instanceof Error ? error.message : String(error)}`
  );
}

function warnHover(error: unknown) {
  if (hoverWarnCount >= 8) return;
  hoverWarnCount += 1;
  console.warn(
    `[BTC Spot City][city-v2] hover: ${error instanceof Error ? error.message : String(error)}`
  );
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

function pushSolid(
  target: SolidInstance[],
  kind: string,
  sequence: number,
  item: SolidInstance,
  maxCount: number
) {
  if (target.length >= maxCount) return false;
  if (!validateSolid(kind, sequence, item)) return false;
  target.push(item);
  return true;
}

function pushLight(
  target: LightInstance[],
  kind: string,
  sequence: number,
  item: LightInstance,
  maxCount: number
) {
  if (target.length >= maxCount) return false;
  if (!validateLight(kind, sequence, item)) return false;
  target.push(item);
  return true;
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

function buildDistrictPlacements(events: BlockEvent[]) {
  const placements: DistrictPlacement[] = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const seqIndex = Math.max(0, Math.floor(event.sequence) - 1);

    if (i === 0) {
      placements.push({
        sequence: event.sequence,
        centerX: 0,
        centerZ: 0,
        yaw: 0,
        radius: 0,
        parentIndex: null
      });
      continue;
    }

    const targetRadius = Math.sqrt(seqIndex + 0.35) * RING_BASE_SPACING * RING_RADIUS_GROWTH;
    const baseAngle =
      seqIndex * GOLDEN_ANGLE +
      (pseudoRandom(event.sequence * 29 + 7) - 0.5) * 0.22 +
      (pseudoRandom(event.sequence * 17 + 3) - 0.5) * 0.08;

    let best:
      | {
          x: number;
          z: number;
          radius: number;
          parentIndex: number;
          score: number;
        }
      | null = null;

    for (let attempt = 0; attempt < DISTRICT_ATTEMPTS; attempt++) {
      const ringOffset = (attempt % 5) - 2;
      const angleOffset = ((attempt * 0.61803398875) % 1) * Math.PI * 0.72 - Math.PI * 0.36;
      const radius =
        targetRadius +
        ringOffset * (1.4 + Math.sqrt(seqIndex + 1) * 0.06) +
        (pseudoRandom(event.sequence * 97 + attempt * 13) - 0.5) * 1.2;
      const angle = baseAngle + angleOffset;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      let minDist = Number.POSITIVE_INFINITY;
      let nearestIndex = 0;
      let valid = true;
      for (let p = 0; p < placements.length; p++) {
        const prev = placements[p];
        const dist = Math.hypot(x - prev.centerX, z - prev.centerZ);
        if (dist < RING_MIN_DISTANCE) {
          valid = false;
          break;
        }
        if (dist < minDist) {
          minDist = dist;
          nearestIndex = p;
        }
      }
      if (!valid) continue;

      const radiusError = Math.abs(Math.hypot(x, z) - targetRadius);
      const score = minDist * 1.2 - radiusError * 0.45 + (pseudoRandom(event.sequence * 53 + attempt) - 0.5) * 0.35;
      if (!best || score > best.score) {
        best = { x, z, radius: Math.hypot(x, z), parentIndex: nearestIndex, score };
      }
    }

    if (!best) {
      const fallbackAngle = baseAngle;
      const fallbackRadius = targetRadius + 2;
      let nearestIndex = 0;
      let nearestDist = Number.POSITIVE_INFINITY;
      for (let p = 0; p < placements.length; p++) {
        const prev = placements[p];
        const d = Math.hypot(
          Math.cos(fallbackAngle) * fallbackRadius - prev.centerX,
          Math.sin(fallbackAngle) * fallbackRadius - prev.centerZ
        );
        if (d < nearestDist) {
          nearestDist = d;
          nearestIndex = p;
        }
      }
      best = {
        x: Math.cos(fallbackAngle) * fallbackRadius,
        z: Math.sin(fallbackAngle) * fallbackRadius,
        radius: fallbackRadius,
        parentIndex: nearestIndex,
        score: 0
      };
    }

    const tangentAngle = Math.atan2(best.z, best.x) + Math.PI * 0.5;
    const yaw =
      tangentAngle +
      (pseudoRandom(event.sequence * 61 + 11) - 0.5) * 0.32;

    placements.push({
      sequence: event.sequence,
      centerX: best.x,
      centerZ: best.z,
      yaw,
      radius: best.radius,
      parentIndex: best.parentIndex
    });
  }

  return placements;
}

function buildCityVisualData(events: BlockEvent[]): CityVisualData {
  const shadowPads: LightInstance[] = [];
  const plots: SolidInstance[] = [];
  const streetDecks: SolidInstance[] = [];
  const towerMasses: SolidInstance[] = [];
  const towerMassMeta: TowerHoverMeta[] = [];
  const laneLights: LightInstance[] = [];
  const detailLights: LightInstance[] = [];
  const glowLights: LightInstance[] = [];
  const carLights: LightInstance[] = [];
  const districtCenters: Array<{ x: number; z: number; y: number }> = [];

  const placements = buildDistrictPlacements(events);

  const detailDensityScale = RUNTIME_QUALITY_CONFIG.detailDensityScale;
  const districtDensityScale = RUNTIME_QUALITY_CONFIG.districtDensityScale;
  const glowScale = RUNTIME_QUALITY_CONFIG.glowIntensityScale;
  const pulseScale = RUNTIME_QUALITY_CONFIG.pulseMotionScale;
  const pulseSpeedScale = Math.max(0.05, pulseScale);
  const motionScale = Math.max(0.2, RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.35 : 1);
  const carDensityScale =
    (RUNTIME_QUALITY_CONFIG.tier === 'low' ? 0.45 : RUNTIME_QUALITY_CONFIG.tier === 'medium' ? 0.75 : 1) *
    (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.55 : 1);
  const birthDurationScale = RUNTIME_QUALITY_CONFIG.birthDurationScale;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let maxY = 0;
  let frontierX = 0;
  let frontierZ = 0;
  let frontierSeq = 1;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const placement = placements[i];
    if (!event || !placement || !event.metrics) {
      warnInvalid('district', event?.sequence ?? -1, 'missing event/placement');
      continue;
    }

    const m = event.metrics;
    const recency01 = events.length <= 1 ? 1 : i / (events.length - 1);
    const recencyCurve = MathUtils.smoothstep(recency01, 0, 1);
    const bodyContrast = 0.7 + recencyCurve * 0.58;
    const topContrast = 0.95 + recencyCurve * 0.55;
    const historySubdue = 0.5 + recencyCurve * 0.5;
    const frontierEmphasis = 0.7 + recencyCurve * 0.85;

    const intensity = MathUtils.clamp(clampFinite(m.intensity, 0), 0, 1);
    const dominance = MathUtils.clamp(clampFinite(m.imbalance, 0), -1, 1);
    const tradeCount = Math.max(0, Math.floor(clampFinite(m.tradeCount, 0, 0, 250000)));
    const avgTradeSize = Math.max(0, clampFinite(m.averageTradeSize, 0, 0, 5000));
    const totalVolume = Math.max(0, clampFinite(m.totalVolume, 0, 0, 10_000_000));
    const priceChange = clampFinite(m.priceChange, 0, -1_000_000, 1_000_000);
    const eventBirthAt = Math.max(0, clampFinite(event.emittedAt, Date.now()));

    const tradeDensity = MathUtils.clamp(Math.log1p(tradeCount) / 5, 0, 1);
    const volumeSignal = MathUtils.clamp(Math.log1p(totalVolume * 100) / 6.4, 0, 1);
    const sizeSignal = MathUtils.clamp(Math.log1p(avgTradeSize * 1200) / 4.6, 0, 1);

    const plotSpanX = clampFinite(6.8 + volumeSignal * 5.6 + intensity * 2.8, 8.4, 5.8, 17.5);
    const plotSpanZ = clampFinite(6.2 + volumeSignal * 5.2 + intensity * 2.1, 7.8, 5.2, 16.4);
    const plotHeight = clampFinite(0.22 + volumeSignal * 0.34 + intensity * 0.26, 0.4, 0.18, 1.6);
    const streetWidth = clampFinite(0.9 + volumeSignal * 0.45 + intensity * 0.35, 1.15, 0.75, 2.2);

    const buyTint = new Color('#55d8ff');
    const sellTint = new Color('#ff9b58');
    const neutralTint = new Color('#c3d2e2');
    const dominanceColor = sellTint.clone().lerp(buyTint, (dominance + 1) * 0.5);

    const plotColor = new Color('#151c25')
      .lerp(dominanceColor, 0.05 + intensity * 0.06)
      .multiplyScalar(0.9 + recencyCurve * 0.28);
    const streetColor = new Color('#0b1016').multiplyScalar(0.95 + recencyCurve * 0.12);
    const towerBody = new Color('#1d2732')
      .lerp(new Color('#2d4155'), 0.2 + intensity * 0.22)
      .multiplyScalar(bodyContrast);
    const towerTopTint = towerBody.clone().lerp(neutralTint, 0.12 + recencyCurve * 0.16).multiplyScalar(topContrast);
    const laneColor = new Color('#7ea7d4').lerp(dominanceColor, 0.22 + recencyCurve * 0.22);
    const detailColor = neutralTint.clone().lerp(dominanceColor, 0.28 + intensity * 0.44);

    const cx = placement.centerX;
    const cz = placement.centerZ;
    const yaw = placement.yaw;

    pushLight(shadowPads, 'shadow-pad', event.sequence, {
      position: [cx, 0.004, cz],
      rotationY: yaw,
      size: [plotSpanX * 1.08, 0.01, plotSpanZ * 1.08],
      color: new Color('#000000'),
      opacity: 0.12 + (1 - recencyCurve) * 0.08,
      birthAtMs: eventBirthAt,
      riseDelayMs: 0,
      riseDurationMs: Math.round(680 * birthDurationScale)
    }, MAX_SHADOW_PAD_INSTANCES);
    pushLight(shadowPads, 'shadow-pad', event.sequence, {
      position: [cx, 0.006, cz],
      rotationY: yaw,
      size: [plotSpanX * 0.72, 0.012, plotSpanZ * 0.72],
      color: new Color('#000000'),
      opacity: 0.16 + (1 - recencyCurve) * 0.1,
      birthAtMs: eventBirthAt,
      riseDelayMs: 18,
      riseDurationMs: Math.round(720 * birthDurationScale)
    }, MAX_SHADOW_PAD_INSTANCES);

    pushSolid(plots, 'plot', event.sequence, {
      position: [cx, plotHeight * 0.5 - 0.015, cz],
      rotationY: yaw,
      size: [plotSpanX, plotHeight, plotSpanZ],
      color: plotColor,
      birthAtMs: eventBirthAt,
      riseDelayMs: 0,
      riseDurationMs: Math.round(760 * birthDurationScale)
    }, MAX_PLOT_INSTANCES);

    const streetDeckY = plotHeight + 0.012;
    pushSolid(streetDecks, 'street', event.sequence, {
      position: [cx, streetDeckY, cz],
      rotationY: yaw,
      size: [plotSpanX - 0.26, 0.03, streetWidth],
      color: streetColor.clone(),
      birthAtMs: eventBirthAt,
      riseDelayMs: 40,
      riseDurationMs: Math.round(620 * birthDurationScale)
    }, MAX_STREET_INSTANCES);
    pushSolid(streetDecks, 'street', event.sequence, {
      position: [cx, streetDeckY, cz],
      rotationY: yaw,
      size: [streetWidth * 0.96, 0.03, plotSpanZ - 0.26],
      color: streetColor.clone().multiplyScalar(1.05),
      birthAtMs: eventBirthAt,
      riseDelayMs: 60,
      riseDurationMs: Math.round(620 * birthDurationScale)
    }, MAX_STREET_INSTANCES);

    // perimeter ring roads (4 segments)
    const edgeOffsetX = plotSpanX * 0.5 - 0.16;
    const edgeOffsetZ = plotSpanZ * 0.5 - 0.16;
    const ringSegments = [
      { lx: 0, lz: edgeOffsetZ, sx: plotSpanX - 0.24, sz: 0.22 },
      { lx: 0, lz: -edgeOffsetZ, sx: plotSpanX - 0.24, sz: 0.22 },
      { lx: edgeOffsetX, lz: 0, sx: 0.22, sz: plotSpanZ - 0.24 },
      { lx: -edgeOffsetX, lz: 0, sx: 0.22, sz: plotSpanZ - 0.24 }
    ];
    for (let r = 0; r < ringSegments.length; r++) {
      const seg = ringSegments[r];
      const [rx, rz] = rotateLocalPoint(seg.lx, seg.lz, yaw);
      pushSolid(streetDecks, 'street', event.sequence, {
        position: [cx + rx, streetDeckY + 0.002, cz + rz],
        rotationY: yaw,
        size: [seg.sx, 0.024, seg.sz],
        color: streetColor.clone().multiplyScalar(0.94),
        birthAtMs: eventBirthAt,
        riseDelayMs: 80 + r * 18,
        riseDurationMs: Math.round(620 * birthDurationScale)
      }, MAX_STREET_INSTANCES);
    }

    const laneY = plotHeight + 0.036;
    const lineThickness = 0.045;
    pushLight(laneLights, 'lane', event.sequence, {
      position: [cx, laneY, cz],
      rotationY: yaw,
      size: [plotSpanX - 0.52, 0.024, lineThickness],
      color: laneColor.clone(),
      opacity: 0.34 + recencyCurve * 0.24,
      birthAtMs: eventBirthAt,
      riseDelayMs: 120,
      riseDurationMs: Math.round(700 * birthDurationScale),
      pulseAmp: (0.05 + intensity * 0.07) * pulseScale,
      pulseSpeed: (0.22 + intensity * 0.36) * pulseSpeedScale,
      pulsePhase: event.sequence * 0.31
    }, MAX_LANE_LIGHT_INSTANCES);
    pushLight(laneLights, 'lane', event.sequence, {
      position: [cx, laneY, cz],
      rotationY: yaw + Math.PI * 0.5,
      size: [plotSpanZ - 0.52, 0.024, lineThickness],
      color: laneColor.clone().multiplyScalar(0.92),
      opacity: 0.3 + recencyCurve * 0.2,
      birthAtMs: eventBirthAt,
      riseDelayMs: 140,
      riseDurationMs: Math.round(720 * birthDurationScale),
      pulseAmp: (0.04 + intensity * 0.06) * pulseScale,
      pulseSpeed: (0.2 + intensity * 0.32) * pulseSpeedScale,
      pulsePhase: event.sequence * 0.43
    }, MAX_LANE_LIGHT_INSTANCES);

    // perimeter curb / lane lines
    const curbColor = new Color('#3d5d7d').lerp(dominanceColor, 0.14 + recencyCurve * 0.16);
    for (let r = 0; r < ringSegments.length; r++) {
      const seg = ringSegments[r];
      const [rx, rz] = rotateLocalPoint(seg.lx, seg.lz, yaw);
      pushLight(laneLights, 'curb', event.sequence, {
        position: [cx + rx, laneY - 0.002, cz + rz],
        rotationY: yaw,
        size: [Math.max(0.16, seg.sx), 0.016, Math.max(0.16, seg.sz)],
        color: curbColor.clone().multiplyScalar(0.78 + recencyCurve * 0.36),
        opacity: 0.16 + recencyCurve * 0.14,
        birthAtMs: eventBirthAt,
        riseDelayMs: 160 + r * 14,
        riseDurationMs: Math.round(740 * birthDurationScale)
      }, MAX_LANE_LIGHT_INSTANCES);
    }

    // central node highlight
    pushLight(laneLights, 'node', event.sequence, {
      position: [cx, laneY + 0.002, cz],
      rotationY: yaw,
      size: [Math.max(0.18, streetWidth), 0.03, Math.max(0.18, streetWidth)],
      color: laneColor.clone().lerp(dominanceColor, 0.22).multiplyScalar(1.02 + recencyCurve * 0.5),
      opacity: 0.24 + recencyCurve * 0.2,
      birthAtMs: eventBirthAt,
      riseDelayMs: 180,
      riseDurationMs: Math.round(760 * birthDurationScale),
      pulseAmp: 0.04 * pulseScale,
      pulseSpeed: 0.14 * pulseSpeedScale,
      pulsePhase: event.sequence * 0.19
    }, MAX_LANE_LIGHT_INSTANCES);

    // connector / artery to parent
    const districtCenter: [number, number, number] = [cx, plotHeight + 0.02, cz];
    districtCenters.push({ x: cx, z: cz, y: plotHeight + 0.02 });
    const plotSpan = Math.max(plotSpanX, plotSpanZ);

    if (placement.parentIndex != null && placements[placement.parentIndex]) {
      const parentPlacement = placements[placement.parentIndex];
      const parentCenterY = districtCenters[placement.parentIndex]?.y ?? 0.04;
      const from: [number, number, number] = [parentPlacement.centerX, parentCenterY, parentPlacement.centerZ];
      const to: [number, number, number] = districtCenter;
      const seg = segmentYawAndLength(from, to);
      const parentSpan = 9.2; // conservative clip; keeps visible connector even without parent plot exact size
      const clearLength = Math.max(0.5, seg.length - (parentSpan + plotSpan) * 0.28);

      if (clearLength > 0.45) {
        const roadY = 0.012;
        pushSolid(streetDecks, 'artery-road', event.sequence, {
          position: [seg.mid[0], roadY, seg.mid[2]],
          rotationY: seg.yaw,
          size: [1.8 + intensity * 0.6, 0.024, clearLength],
          color: streetColor.clone().multiplyScalar(1.08),
          birthAtMs: eventBirthAt,
          riseDelayMs: 48,
          riseDurationMs: Math.round(680 * birthDurationScale)
        }, MAX_STREET_INSTANCES);

        pushLight(laneLights, 'artery-core', event.sequence, {
          position: [seg.mid[0], roadY + 0.02, seg.mid[2]],
          rotationY: seg.yaw,
          size: [0.16, 0.024, clearLength * 0.96],
          color: laneColor.clone().lerp(dominanceColor, 0.16).multiplyScalar(1.0 + recencyCurve * 0.45),
          opacity: 0.22 + recencyCurve * 0.2,
          birthAtMs: eventBirthAt,
          riseDelayMs: 130,
          riseDurationMs: Math.round(820 * birthDurationScale),
          pulseAmp: 0.03 * pulseScale,
          pulseSpeed: 0.12 * pulseSpeedScale,
          pulsePhase: event.sequence * 0.18
        }, MAX_LANE_LIGHT_INSTANCES);
        pushLight(laneLights, 'artery-line', event.sequence, {
          position: [seg.mid[0], roadY + 0.024, seg.mid[2]],
          rotationY: seg.yaw,
          size: [0.05, 0.022, clearLength * 0.94],
          color: new Color('#9ae6ff').lerp(dominanceColor, 0.1).multiplyScalar(1.05 + recencyCurve * 0.55),
          opacity: 0.32 + recencyCurve * 0.24,
          birthAtMs: eventBirthAt,
          riseDelayMs: 150,
          riseDurationMs: Math.round(860 * birthDurationScale),
          pulseAmp: 0.02 * pulseScale,
          pulseSpeed: 0.1 * pulseSpeedScale,
          pulsePhase: event.sequence * 0.27
        }, MAX_LANE_LIGHT_INSTANCES);

        // connector nodes at both ends
        pushLight(laneLights, 'artery-node', event.sequence, {
          position: [to[0], roadY + 0.026, to[2]],
          rotationY: seg.yaw,
          size: [0.18, 0.026, 0.18],
          color: laneColor.clone().multiplyScalar(0.95 + recencyCurve * 0.45),
          opacity: 0.24 + recencyCurve * 0.18,
          birthAtMs: eventBirthAt,
          riseDelayMs: 160,
          riseDurationMs: Math.round(760 * birthDurationScale)
        }, MAX_LANE_LIGHT_INSTANCES);
        pushLight(laneLights, 'artery-node', event.sequence, {
          position: [from[0], roadY + 0.024, from[2]],
          rotationY: seg.yaw,
          size: [0.14, 0.022, 0.14],
          color: laneColor.clone().multiplyScalar(0.78 + recencyCurve * 0.28),
          opacity: 0.16 + recencyCurve * 0.12,
          birthAtMs: eventBirthAt,
          riseDelayMs: 120,
          riseDurationMs: Math.round(760 * birthDurationScale)
        }, MAX_LANE_LIGHT_INSTANCES);

        // traffic headlights along connectors (visible at wide shot)
        const carCount = Math.max(
          RUNTIME_QUALITY_CONFIG.reducedMotion ? 0 : 2,
          Math.round((1 + clearLength * 0.18) * carDensityScale)
        );
        for (let c = 0; c < carCount; c++) {
          const seed = event.sequence * 113 + c * 19;
          const whiteBias = pseudoRandom(seed + 1);
          const carColor =
            whiteBias > 0.9
              ? new Color('#ffc06d')
              : whiteBias > 0.44
                ? new Color('#f5fbff')
                : new Color('#84e8ff');
          pushLight(carLights, 'car', event.sequence, {
            position: [seg.mid[0], roadY + 0.034, seg.mid[2]],
            rotationY: seg.yaw,
            size: [0.095, 0.05, 0.28],
            color: carColor,
            opacity: 0.62 + recencyCurve * 0.22,
            birthAtMs: eventBirthAt,
            riseDelayMs: 170 + c * 18,
            riseDurationMs: Math.round(700 * birthDurationScale),
            pulseAmp: 0.02 * pulseScale,
            pulseSpeed: (0.08 + c * 0.015) * pulseSpeedScale,
            pulsePhase: event.sequence * 0.1 + c * 0.4,
            slideAxis: 'z',
            slideSpan: Math.max(1.2, clearLength * 0.9),
            slideSpeed: (0.02 + pseudoRandom(seed + 2) * 0.05) * motionScale,
            slidePhase: pseudoRandom(seed + 3)
          }, MAX_CAR_LIGHT_INSTANCES);
        }
      }
    }

    // Building generation: composed, sparse, high-contrast
    const buildableRadiusX = plotSpanX * 0.34;
    const buildableRadiusZ = plotSpanZ * 0.34;
    const centerReserve = streetWidth * 1.25;
    const majorCount = Math.max(
      3,
      Math.min(7, Math.round((3.5 + tradeDensity * 2.4 + volumeSignal * 2.1) * districtDensityScale))
    );
    const minorCount = Math.max(
      1,
      Math.min(4, Math.round((1.2 + tradeDensity * 1.1 + intensity * 1.2) * districtDensityScale))
    );
    const totalCandidates = majorCount + minorCount;
    const acceptedLocals: Array<[number, number]> = [];
    const centralVerticality = 1.05 + intensity * 0.9 + sizeSignal * 0.55;
    const verticalBias = clampFinite(1 + dominance * 0.4 + Math.sign(priceChange || 0) * 0.05, 1, 0.7, 1.75);
    const capHeight = 25 + intensity * 10 + sizeSignal * 5;

    for (let b = 0; b < totalCandidates; b++) {
      if (
        towerMasses.length >= MAX_TOWER_INSTANCES ||
        detailLights.length >= MAX_DETAIL_LIGHT_INSTANCES ||
        glowLights.length >= MAX_GLOW_LIGHT_INSTANCES
      ) {
        break;
      }

      const seed = event.sequence * 1201 + b * 47;
      const isMajor = b < majorCount;
      const t = b / Math.max(1, totalCandidates - 1);
      const angle = b * 2.3999632297 + pseudoRandom(seed + 1) * 0.7;
      const radialWeight = Math.pow(t, 0.75);
      const lx = Math.cos(angle) * buildableRadiusX * (0.22 + radialWeight * 0.78) * (0.78 + pseudoRandom(seed + 2) * 0.4);
      const lz = Math.sin(angle) * buildableRadiusZ * (0.22 + radialWeight * 0.78) * (0.78 + pseudoRandom(seed + 3) * 0.4);
      if (Math.abs(lx) < centerReserve * 0.75 || Math.abs(lz) < centerReserve * 0.75) continue;

      let tooClose = false;
      const minSpacing = (isMajor ? 1.15 : 0.9) + (1 - districtDensityScale) * 0.35;
      for (let p = 0; p < acceptedLocals.length; p++) {
        const prev = acceptedLocals[p];
        if (Math.hypot(prev[0] - lx, prev[1] - lz) < minSpacing) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      acceptedLocals.push([lx, lz]);

      const [rx, rz] = rotateLocalPoint(lx, lz, yaw);
      const worldX = cx + rx;
      const worldZ = cz + rz;
      const radialNorm = Math.min(1, Math.hypot(lx / buildableRadiusX, lz / buildableRadiusZ));
      const centerWeight = 1 - radialNorm;

      const footprintW = clampFinite(
        (isMajor ? 0.7 : 0.5) + pseudoRandom(seed + 4) * (isMajor ? 0.9 : 0.55) + volumeSignal * 0.2,
        isMajor ? 0.92 : 0.62,
        0.35,
        2.8
      );
      const footprintD = clampFinite(
        (isMajor ? 0.65 : 0.48) + pseudoRandom(seed + 5) * (isMajor ? 0.85 : 0.5) + volumeSignal * 0.2,
        isMajor ? 0.86 : 0.58,
        0.35,
        2.7
      );

      const podiumH = clampFinite(
        0.55 + (isMajor ? 0.45 : 0.25) + intensity * 0.4 + centerWeight * 0.45,
        1,
        0.38,
        2.6
      );
      const shaftH = clampFinite(
        (1.2 + centerWeight * (5.8 + intensity * 9.8) * centralVerticality + tradeDensity * 2.1) * verticalBias,
        6,
        1.4,
        capHeight
      );
      const addSpire = isMajor && (centerWeight > 0.2 || pseudoRandom(seed + 6) > 0.72);
      const spireH = addSpire
        ? clampFinite(0.7 + centerWeight * (4 + intensity * 5) + sizeSignal * 1.2, 2.2, 0.4, 12)
        : 0;
      const totalHeight = podiumH + shaftH + spireH;

      const buildingId = `D-${event.sequence}-B-${b}`;
      const districtId = `D-${event.sequence}`;
      const towerYaw = yaw + (pseudoRandom(seed + 7) - 0.5) * 0.08;
      const podiumY = plotHeight + podiumH * 0.5;
      const shaftY = plotHeight + podiumH + shaftH * 0.5;
      const spireY = plotHeight + podiumH + shaftH + spireH * 0.5;

      const baseTint = towerBody.clone().lerp(dominanceColor, 0.03 + recencyCurve * 0.06);
      const shaftTint = towerTopTint.clone().lerp(dominanceColor, 0.05 + recencyCurve * 0.08);
      const spireTint = shaftTint.clone().lerp(detailColor, 0.16 + recencyCurve * 0.14).multiplyScalar(1.06 + recencyCurve * 0.14);

      const riseDelayMs = Math.floor(clampFinite(b * (20 + intensity * 14) * birthDurationScale, 0, 0, 1600));
      const riseDurationMs = Math.floor(clampFinite((760 + (1 - centerWeight) * 380 + intensity * 220) * birthDurationScale, 900, 260, 2200));

      const podiumSize: [number, number, number] = [footprintW * 1.16, podiumH, footprintD * 1.16];
      const podiumAdded = pushSolid(towerMasses, 'tower', event.sequence, {
        position: [worldX, podiumY, worldZ],
        rotationY: towerYaw,
        size: podiumSize,
        color: baseTint,
        birthAtMs: eventBirthAt,
        riseDelayMs,
        riseDurationMs: Math.max(360, riseDurationMs - 160)
      }, MAX_TOWER_INSTANCES);
      if (podiumAdded) {
        towerMassMeta.push({
          buildingId,
          districtId,
          sequence: event.sequence,
          tier: 'podium',
          tierHeight: podiumH,
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

      const shaftSize: [number, number, number] = [
        footprintW * (0.72 + pseudoRandom(seed + 8) * 0.14),
        shaftH,
        footprintD * (0.72 + pseudoRandom(seed + 9) * 0.14)
      ];
      const shaftAdded = pushSolid(towerMasses, 'tower', event.sequence, {
        position: [worldX, shaftY, worldZ],
        rotationY: towerYaw,
        size: shaftSize,
        color: shaftTint,
        birthAtMs: eventBirthAt,
        riseDelayMs: riseDelayMs + 40,
        riseDurationMs
      }, MAX_TOWER_INSTANCES);
      if (shaftAdded) {
        towerMassMeta.push({
          buildingId,
          districtId,
          sequence: event.sequence,
          tier: 'shaft',
          tierHeight: shaftH,
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

      if (addSpire && spireH > 0.2) {
        const spireSize: [number, number, number] = [
          Math.max(0.16, footprintW * 0.34),
          spireH,
          Math.max(0.16, footprintD * 0.34)
        ];
        const spireAdded = pushSolid(towerMasses, 'tower', event.sequence, {
          position: [worldX, spireY, worldZ],
          rotationY: towerYaw,
          size: spireSize,
          color: spireTint,
          birthAtMs: eventBirthAt,
          riseDelayMs: riseDelayMs + 80,
          riseDurationMs: Math.max(320, riseDurationMs - 120)
        }, MAX_TOWER_INSTANCES);
        if (spireAdded) {
          towerMassMeta.push({
            buildingId,
            districtId,
            sequence: event.sequence,
            tier: 'spire',
            tierHeight: spireH,
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
      }

      minX = Math.min(minX, worldX - podiumSize[0] * 0.6);
      maxX = Math.max(maxX, worldX + podiumSize[0] * 0.6);
      minZ = Math.min(minZ, worldZ - podiumSize[2] * 0.6);
      maxZ = Math.max(maxZ, worldZ + podiumSize[2] * 0.6);
      maxY = Math.max(maxY, plotHeight + totalHeight);

      // Window/detail bands (cheap emissive details)
      if (detailDensityScale > 0.2) {
        const verticalStripCount = isMajor ? 2 : 1;
        for (let s = 0; s < verticalStripCount; s++) {
          if (detailLights.length >= MAX_DETAIL_LIGHT_INSTANCES) break;
          const sidePick = pseudoRandom(seed + 20 + s);
          const localX = sidePick > 0.5 ? footprintW * 0.33 * (pseudoRandom(seed + 21 + s) > 0.5 ? 1 : -1) : 0;
          const localZ = sidePick <= 0.5 ? footprintD * 0.33 * (pseudoRandom(seed + 23 + s) > 0.5 ? 1 : -1) : 0;
          const [dx, dz] = rotateLocalPoint(localX, localZ, towerYaw);
          const stripHeight = Math.max(0.6, shaftH * (0.42 + pseudoRandom(seed + 24 + s) * 0.3));
          pushLight(detailLights, 'window-strip', event.sequence, {
            position: [worldX + dx, plotHeight + podiumH + stripHeight * 0.55, worldZ + dz],
            rotationY: towerYaw,
            size: [localX !== 0 ? 0.05 : Math.max(0.12, footprintW * 0.6), stripHeight, localZ !== 0 ? 0.05 : Math.max(0.12, footprintD * 0.6)],
            color: detailColor.clone().multiplyScalar(historySubdue * (0.82 + recencyCurve * 0.35)),
            opacity: 0.16 + recencyCurve * 0.16 + intensity * 0.08,
            birthAtMs: eventBirthAt,
            riseDelayMs: riseDelayMs + 120 + s * 18,
            riseDurationMs: Math.max(360, riseDurationMs - 60),
            pulseAmp: 0.03 * pulseScale,
            pulseSpeed: (0.14 + recencyCurve * 0.18) * pulseSpeedScale,
            pulsePhase: event.sequence * 0.39 + b * 0.1 + s * 0.2
          }, MAX_DETAIL_LIGHT_INSTANCES);
        }
      }

      // skyline top band + crown marker (height readability)
      pushLight(detailLights, 'top-band', event.sequence, {
        position: [worldX, plotHeight + podiumH + shaftH + 0.03, worldZ],
        rotationY: towerYaw,
        size: [Math.max(0.12, footprintW * 0.86), 0.03, Math.max(0.12, footprintD * 0.86)],
        color: detailColor.clone().lerp(dominanceColor, 0.18 + recencyCurve * 0.18).multiplyScalar(0.9 + recencyCurve * 0.52),
        opacity: 0.14 + recencyCurve * 0.16 + intensity * 0.08,
        birthAtMs: eventBirthAt,
        riseDelayMs: riseDelayMs + 150,
        riseDurationMs: Math.max(300, riseDurationMs - 50),
        pulseAmp: 0.015 * pulseScale,
        pulseSpeed: 0.08 * pulseSpeedScale,
        pulsePhase: event.sequence * 0.23 + b * 0.09
      }, MAX_DETAIL_LIGHT_INSTANCES);

      const topY = plotHeight + totalHeight;
      pushLight(glowLights, 'crown', event.sequence, {
        position: [worldX, topY + 0.08, worldZ],
        rotationY: towerYaw,
        size: [Math.max(0.16, footprintW * 0.6), 0.07, Math.max(0.16, footprintD * 0.6)],
        color: detailColor.clone().lerp(dominanceColor, 0.22 + recencyCurve * 0.18),
        opacity: MathUtils.clamp((0.16 + intensity * 0.18) * historySubdue * frontierEmphasis * glowScale, 0.08, 0.72),
        birthAtMs: eventBirthAt,
        riseDelayMs: riseDelayMs + 190,
        riseDurationMs: Math.max(320, riseDurationMs - 40),
        pulseAmp: (0.08 + intensity * 0.12) * pulseScale,
        pulseSpeed: (0.16 + centerWeight * 0.18) * pulseSpeedScale,
        pulsePhase: event.sequence * 0.41 + b * 0.17
      }, MAX_GLOW_LIGHT_INSTANCES);

      if (isMajor) {
        pushLight(glowLights, 'halo', event.sequence, {
          position: [worldX, topY + 0.26, worldZ],
          rotationY: towerYaw,
          size: [Math.max(0.22, footprintW * 1.25), 0.14, Math.max(0.22, footprintD * 1.25)],
          color: dominanceColor.clone().lerp(neutralTint, 0.35).multiplyScalar(0.72 + recencyCurve * 0.45),
          opacity: MathUtils.clamp((0.08 + intensity * 0.14) * frontierEmphasis * glowScale, 0.04, 0.34),
          birthAtMs: eventBirthAt,
          riseDelayMs: riseDelayMs + 220,
          riseDurationMs: Math.max(340, riseDurationMs),
          pulseAmp: 0.04 * pulseScale,
          pulseSpeed: 0.1 * pulseSpeedScale,
          pulsePhase: event.sequence * 0.17 + b * 0.08
        }, MAX_GLOW_LIGHT_INSTANCES);
      }
    }

    // district glow ring (frontier emphasis)
    pushLight(glowLights, 'district-ring', event.sequence, {
      position: [cx, plotHeight + 0.05, cz],
      rotationY: yaw,
      size: [plotSpanX * 0.98, 0.06, plotSpanZ * 0.98],
      color: dominanceColor.clone().lerp(new Color('#cde1f4'), 0.28).multiplyScalar(0.7 + recencyCurve * 0.55),
      opacity: MathUtils.clamp((0.1 + intensity * 0.12) * historySubdue * frontierEmphasis * glowScale, 0.05, 0.36),
      birthAtMs: eventBirthAt,
      riseDelayMs: 90,
      riseDurationMs: Math.round(760 * birthDurationScale),
      pulseAmp: 0.03 * pulseScale,
      pulseSpeed: 0.09 * pulseSpeedScale,
      pulsePhase: event.sequence * 0.13
    }, MAX_GLOW_LIGHT_INSTANCES);

    frontierX = cx;
    frontierZ = cz;
    frontierSeq = event.sequence;
  }

  return {
    shadowPads: shadowPads.slice(0, MAX_SHADOW_PAD_INSTANCES),
    plots: plots.slice(0, MAX_PLOT_INSTANCES),
    streetDecks: streetDecks.slice(0, MAX_STREET_INSTANCES),
    towerMasses: towerMasses.slice(0, MAX_TOWER_INSTANCES),
    towerMassMeta: towerMassMeta.slice(0, MAX_TOWER_INSTANCES),
    laneLights: laneLights.slice(0, MAX_LANE_LIGHT_INSTANCES),
    detailLights: detailLights.slice(0, MAX_DETAIL_LIGHT_INSTANCES),
    glowLights: glowLights.slice(0, MAX_GLOW_LIGHT_INSTANCES),
    carLights: carLights.slice(0, MAX_CAR_LIGHT_INSTANCES),
    districtCenters,
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
  if (!mesh) return;
  const capacity = mesh.instanceMatrix?.count ?? 0;
  const count = Math.min(capacity, items.length);
  if (count <= 0) return;

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
  mesh.instanceMatrix.needsUpdate = true;
}

function applyLightInstances(mesh: InstancedMesh | null, items: LightInstance[], nowMs: number) {
  if (!mesh) return;
  const capacity = mesh.instanceMatrix?.count ?? 0;
  const count = Math.min(capacity, items.length);
  if (count <= 0) return;

  const timeSec = nowMs * 0.001;
  for (let i = 0; i < count; i++) {
    const item = items[i];
    const ageMs = nowMs - item.birthAtMs - item.riseDelayMs;
    const alive = ageMs < 0 ? 0 : easeOutCubic(ageMs / Math.max(1, item.riseDurationMs));

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

    const sx = Math.max(0.0001, item.size[0] * (0.95 + (pulse - 1) * 0.9));
    const sy = Math.max(0.0001, item.size[1] * alive * (0.9 + (pulse - 1) * 0.65));
    const sz = Math.max(0.0001, item.size[2] * (0.95 + (pulse - 1) * 0.9));
    const y = item.position[1] - item.size[1] * 0.5 + sy * 0.5;
    if (!Number.isFinite(px) || !Number.isFinite(pz) || !Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(sz)) {
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
    if (!mesh) return;
    const capacity = mesh.instanceMatrix?.count ?? 0;
    const count = Math.min(capacity, items.length);
    for (let i = 0; i < count; i++) {
      const item = items[i];
      const factor = brightnessScale * (item.opacity ? 0.65 + item.opacity * 0.75 : 1);
      mesh.setColorAt(i, item.color.clone().multiplyScalar(factor));
    }
    mesh.count = count;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [meshRef, items, brightnessScale]);

  return null;
}

function GroundFieldV2({
  bounds,
  districtCount
}: {
  bounds: CityVisualData['bounds'];
  districtCount: number;
}) {
  const radius = Math.max(70, bounds ? Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 0.6 : 110);
  const groundSize = Math.min(2200, Math.max(460, radius * 4.6 + 220));
  const centerX = bounds ? (bounds.minX + bounds.maxX) * 0.5 : 0;
  const centerZ = bounds ? (bounds.minZ + bounds.maxZ) * 0.5 : 0;
  const gridDivs = Math.max(28, Math.min(120, Math.round(groundSize / (RUNTIME_QUALITY_CONFIG.tier === 'low' ? 10 : 7))));
  const arteryAlpha = DEBUG_VIEW_ENABLED ? 0.28 : 0.2;
  const crossAlpha = DEBUG_VIEW_ENABLED ? 0.22 : 0.15;
  const ringAlpha = DEBUG_VIEW_ENABLED ? 0.15 : 0.1;
  const arteryLen = Math.min(groundSize * 0.92, Math.max(180, radius * 2.6));

  return (
    <group position={[centerX, 0, centerZ]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.035, 0]} receiveShadow>
        <planeGeometry args={[groundSize, groundSize]} />
        <meshStandardMaterial color="#06090d" roughness={1} metalness={0.02} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.024, 0]}>
        <planeGeometry args={[groundSize * 0.985, groundSize * 0.985]} />
        <meshStandardMaterial
          color="#0b1016"
          roughness={0.98}
          metalness={0.04}
          emissive="#111d29"
          emissiveIntensity={DEBUG_VIEW_ENABLED ? 0.08 : 0.05}
          transparent
          opacity={0.9}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.018, 0]}>
        <ringGeometry args={[Math.max(18, radius * 0.4), Math.min(groundSize * 0.47, radius * 1.7), 96]} />
        <meshBasicMaterial color="#0f1a25" transparent opacity={ringAlpha} depthWrite={false} toneMapped={false} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.012, 0]}>
        <planeGeometry args={[2.2, arteryLen]} />
        <meshBasicMaterial color="#112435" transparent opacity={arteryAlpha} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.011, 0]}>
        <planeGeometry args={[arteryLen, 1.9]} />
        <meshBasicMaterial color="#10202f" transparent opacity={crossAlpha} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[0.14, arteryLen * 0.96]} />
        <meshBasicMaterial color="#7ad8ff" transparent opacity={DEBUG_VIEW_ENABLED ? 0.38 : 0.28} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.0095, 0]}>
        <planeGeometry args={[arteryLen * 0.94, 0.12]} />
        <meshBasicMaterial color="#83dbff" transparent opacity={DEBUG_VIEW_ENABLED ? 0.28 : 0.2} toneMapped={false} />
      </mesh>

      <gridHelper
        args={[groundSize * 0.97, gridDivs, new Color('#213347'), new Color('#162332')]}
        position={[0, -0.013, 0]}
        material-transparent
        material-opacity={DEBUG_VIEW_ENABLED ? 0.26 : 0.18}
      />

      {districtCount === 0 ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.008, 0]}>
          <circleGeometry args={[18, 48]} />
          <meshBasicMaterial color="#0f1c29" transparent opacity={0.18} toneMapped={false} />
        </mesh>
      ) : null}
    </group>
  );
}

export function CitySystemV2() {
  const { events } = useBlockEventStore();
  const { hoveredBuildingId } = useCitySceneStore();

  const visibleEvents = useMemo(() => events.slice(-HISTORY_CAP), [events]);
  const visualData = useMemo(() => buildCityVisualData(visibleEvents), [visibleEvents]);

  const shadowPadMeshRef = useRef<InstancedMesh>(null);
  const plotMeshRef = useRef<InstancedMesh>(null);
  const streetMeshRef = useRef<InstancedMesh>(null);
  const towerMeshRef = useRef<InstancedMesh>(null);
  const hoverShellMeshRef = useRef<InstancedMesh>(null);
  const laneLightMeshRef = useRef<InstancedMesh>(null);
  const detailLightMeshRef = useRef<InstancedMesh>(null);
  const glowLightMeshRef = useRef<InstancedMesh>(null);
  const carLightMeshRef = useRef<InstancedMesh>(null);
  const settledRef = useRef(false);

  const towerColorItems = useMemo(
    () =>
      visualData.towerMasses.map((item, i) => {
        const meta = visualData.towerMassMeta[i];
        if (!meta || !hoveredBuildingId || meta.buildingId !== hoveredBuildingId) return item;
        return {
          ...item,
          color: meta.tier === 'spire' ? new Color('#fff9d6') : new Color('#ffd400')
        };
      }),
    [visualData.towerMasses, visualData.towerMassMeta, hoveredBuildingId]
  );

  const hoverShellItems = useMemo(() => {
    if (!hoveredBuildingId) return [] as LightInstance[];
    const items: LightInstance[] = [];
    for (let i = 0; i < visualData.towerMasses.length; i++) {
      const meta = visualData.towerMassMeta[i];
      const source = visualData.towerMasses[i];
      if (!meta || !source || meta.buildingId !== hoveredBuildingId) continue;
      items.push({
        ...source,
        size: [source.size[0] * 1.18, source.size[1] * 1.06, source.size[2] * 1.18],
        color: meta.tier === 'spire' ? new Color('#fffef2') : new Color('#ffe066'),
        opacity: 0.92,
        pulseAmp: 0.1 * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.4 : 1),
        pulseSpeed: 0.45 * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.4 : 1),
        pulsePhase: i * 0.31
      });
      items.push({
        ...source,
        size: [source.size[0] * 1.36, source.size[1] * 1.1, source.size[2] * 1.36],
        color: new Color('#ffd400'),
        opacity: 0.54,
        pulseAmp: 0.12 * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.35 : 1),
        pulseSpeed: 0.3 * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 0.35 : 1),
        pulsePhase: i * 0.27 + 0.6
      });
    }
    return items.slice(0, 8);
  }, [hoveredBuildingId, visualData.towerMasses, visualData.towerMassMeta]);

  const latestAnimationEndMs = useMemo(() => {
    let maxMs = 0;
    const layers = [
      visualData.shadowPads,
      visualData.plots,
      visualData.streetDecks,
      visualData.towerMasses,
      visualData.laneLights,
      visualData.detailLights,
      visualData.glowLights,
      visualData.carLights,
      hoverShellItems
    ] as const;
    for (const layer of layers) {
      for (const item of layer) {
        maxMs = Math.max(maxMs, item.birthAtMs + item.riseDelayMs + item.riseDurationMs);
      }
    }
    return maxMs;
  }, [visualData, hoverShellItems]);

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
      : {
          centerX: 0,
          centerZ: 0,
          minX: -20,
          maxX: 20,
          minZ: -20,
          maxZ: 20,
          maxY: 8,
          radius: 28,
          frontierX: 0,
          frontierZ: 0,
          frontierSeq: 1
        };

    publishCitySceneData(
      bounds,
      visualData.towerMassMeta.map((meta, instanceId) => ({
        instanceId,
        height: meta.tierHeight,
        ...meta
      }))
    );

    settledRef.current = false;
    const now = Date.now();
    try {
      applyLightInstances(shadowPadMeshRef.current, visualData.shadowPads, now);
      applySolidInstances(plotMeshRef.current, visualData.plots, now);
      applySolidInstances(streetMeshRef.current, visualData.streetDecks, now);
      applySolidInstances(towerMeshRef.current, visualData.towerMasses, now);
      applyLightInstances(hoverShellMeshRef.current, hoverShellItems, now);
      applyLightInstances(laneLightMeshRef.current, visualData.laneLights, now);
      applyLightInstances(detailLightMeshRef.current, visualData.detailLights, now);
      applyLightInstances(glowLightMeshRef.current, visualData.glowLights, now);
      applyLightInstances(carLightMeshRef.current, visualData.carLights, now);
    } catch (error) {
      warnRuntime('layout apply', error);
    }
  }, [visualData, hoverShellItems]);

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
      const settled = settledRef.current && now > latestAnimationEndMs;
      if (!settled) {
        applyLightInstances(shadowPadMeshRef.current, visualData.shadowPads, now);
        applySolidInstances(plotMeshRef.current, visualData.plots, now);
        applySolidInstances(streetMeshRef.current, visualData.streetDecks, now);
        applySolidInstances(towerMeshRef.current, visualData.towerMasses, now);
        applyLightInstances(laneLightMeshRef.current, visualData.laneLights, now);
        applyLightInstances(detailLightMeshRef.current, visualData.detailLights, now);
      }
      applyLightInstances(hoverShellMeshRef.current, hoverShellItems, now);
      applyLightInstances(glowLightMeshRef.current, visualData.glowLights, now);
      applyLightInstances(carLightMeshRef.current, visualData.carLights, now);

      if (!settled && now > latestAnimationEndMs + 120) {
        settledRef.current = true;
      }
    } catch (error) {
      warnRuntime('frame apply', error);
      settledRef.current = true;
    }
  });

  const glowBrightnessScale = 1.28 * (0.88 + RUNTIME_QUALITY_CONFIG.glowIntensityScale * 0.3);
  const detailBrightnessScale = 1.08 * (0.88 + RUNTIME_QUALITY_CONFIG.glowIntensityScale * 0.24);
  const carBrightnessScale = 2.2 * (0.92 + RUNTIME_QUALITY_CONFIG.glowIntensityScale * 0.4);

  return (
    <group>
      <GroundFieldV2 bounds={visualData.bounds} districtCount={visualData.districtCenters.length} />

      <InstancedColorSetup meshRef={shadowPadMeshRef} items={visualData.shadowPads} />
      <InstancedColorSetup meshRef={plotMeshRef} items={visualData.plots} />
      <InstancedColorSetup meshRef={streetMeshRef} items={visualData.streetDecks} />
      <InstancedColorSetup meshRef={towerMeshRef} items={towerColorItems} />
      <InstancedColorSetup meshRef={hoverShellMeshRef} items={hoverShellItems} brightnessScale={3.6} />
      <InstancedColorSetup meshRef={laneLightMeshRef} items={visualData.laneLights} brightnessScale={1.5} />
      <InstancedColorSetup meshRef={detailLightMeshRef} items={visualData.detailLights} brightnessScale={detailBrightnessScale} />
      <InstancedColorSetup meshRef={glowLightMeshRef} items={visualData.glowLights} brightnessScale={glowBrightnessScale} />
      <InstancedColorSetup meshRef={carLightMeshRef} items={visualData.carLights} brightnessScale={carBrightnessScale} />

      <instancedMesh ref={shadowPadMeshRef} args={[undefined, undefined, Math.max(1, visualData.shadowPads.length)]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors transparent opacity={0.38} depthWrite={false} />
      </instancedMesh>

      <instancedMesh ref={plotMeshRef} args={[undefined, undefined, Math.max(1, visualData.plots.length)]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          vertexColors
          color="#1f2b38"
          roughness={0.9}
          metalness={0.12}
          emissive="#233b52"
          emissiveIntensity={DEBUG_VIEW_ENABLED ? 0.42 : 0.3}
        />
      </instancedMesh>

      <instancedMesh ref={streetMeshRef} args={[undefined, undefined, Math.max(1, visualData.streetDecks.length)]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          vertexColors
          color="#0d1219"
          roughness={0.97}
          metalness={0.05}
          emissive="#162332"
          emissiveIntensity={DEBUG_VIEW_ENABLED ? 0.22 : 0.15}
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
          color="#1f2d3a"
          roughness={0.7}
          metalness={0.24}
          emissive="#3d7298"
          emissiveIntensity={DEBUG_VIEW_ENABLED ? 1.15 : 0.88}
        />
      </instancedMesh>

      <instancedMesh ref={hoverShellMeshRef} args={[undefined, undefined, Math.max(1, hoverShellItems.length)]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors transparent opacity={1} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </instancedMesh>

      <instancedMesh ref={laneLightMeshRef} args={[undefined, undefined, Math.max(1, visualData.laneLights.length)]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors transparent opacity={1} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </instancedMesh>

      <instancedMesh ref={detailLightMeshRef} args={[undefined, undefined, Math.max(1, visualData.detailLights.length)]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors transparent opacity={0.96} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </instancedMesh>

      <instancedMesh ref={glowLightMeshRef} args={[undefined, undefined, Math.max(1, visualData.glowLights.length)]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors transparent opacity={0.95} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </instancedMesh>

      <instancedMesh ref={carLightMeshRef} args={[undefined, undefined, Math.max(1, visualData.carLights.length)]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors transparent opacity={1} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </instancedMesh>
    </group>
  );
}
