import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import type { InstancedMesh } from 'three';
import { AdditiveBlending, Color, MathUtils, Object3D } from 'three';
import { useBlockEventStore } from '../data/trades/blockEventStore';
import type { BlockEvent } from '../data/trades/types';
import { getSpineTransformFromSequence } from './cityGrowthPath';
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

type CityVisualData = {
  plots: SolidInstance[];
  streetDecks: SolidInstance[];
  towerMasses: SolidInstance[];
  laneLights: LightInstance[];
  detailLights: LightInstance[];
  haloGlows: LightInstance[];
  flowLights: LightInstance[];
};

const HISTORY_CAP = 42;
const MAX_PLOT_INSTANCES = 120;
const MAX_STREET_INSTANCES = 520;
const MAX_TOWER_MASS_INSTANCES = 1400;
const MAX_LANE_LIGHT_INSTANCES = 2200;
const MAX_DETAIL_LIGHT_INSTANCES = 2600;
const MAX_HALO_GLOW_INSTANCES = 2200;
const MAX_FLOW_LIGHT_INSTANCES = 420;

const tempObject = new Object3D();
let invalidInstanceWarnCount = 0;
let invalidEventWarnCount = 0;
let instanceBudgetWarned = false;

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
  kind: 'plot' | 'street' | 'tower' | 'lane' | 'detail' | 'glow' | 'flow',
  sequence: number,
  reason: string
) {
  if (invalidInstanceWarnCount >= 48) {
    return;
  }
  invalidInstanceWarnCount += 1;
  console.warn(`[BTC Spot City][city] skipped ${kind} seq=${sequence}: ${reason}`);
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
  kind: 'lane' | 'detail' | 'glow' | 'flow',
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

function pushSolid(target: SolidInstance[], kind: 'plot' | 'street' | 'tower', sequence: number, item: SolidInstance, maxCount: number) {
  if (target.length >= maxCount) {
    return;
  }
  if (validateSolid(kind, sequence, item)) {
    target.push(item);
  }
}

function pushLight(
  target: LightInstance[],
  kind: 'lane' | 'detail' | 'glow' | 'flow',
  sequence: number,
  item: LightInstance,
  maxCount: number
) {
  if (target.length >= maxCount) {
    return;
  }
  if (validateLight(kind, sequence, item)) {
    target.push(item);
  }
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
  const plots: SolidInstance[] = [];
  const streetDecks: SolidInstance[] = [];
  const towerMasses: SolidInstance[] = [];
  const laneLights: LightInstance[] = [];
  const detailLights: LightInstance[] = [];
  const haloGlows: LightInstance[] = [];
  const flowLights: LightInstance[] = [];

  let prevDistrictCenter: [number, number, number] | null = null;
  let prevDistrictPlotSpan = 0;

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
    const historySubdue = 0.58 + recencyCurve * 0.42;
    const frontierEmphasis = 0.78 + recencyCurve * 0.62;

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
      .multiplyScalar(0.78 + recencyCurve * 0.26);
    const streetColor = new Color('#080b10').multiplyScalar(0.85 + recencyCurve * 0.08);
    const towerBaseColor = new Color('#151d26')
      .lerp(new Color('#26384a'), 0.18 + intensity * 0.22)
      .multiplyScalar(0.8 + recencyCurve * 0.28);
    const detailColor = neutralTint.clone().lerp(dominanceColor, 0.35 + intensity * 0.5);
    const laneColor = new Color('#56708f').lerp(dominanceColor, 0.18 + recencyCurve * 0.22);

    // District plot platform
    pushSolid(plots, 'plot', event.sequence, {
      position: [cx, plotHeight * 0.5 - 0.012, cz],
      rotationY: yaw,
      size: [plotSpanX, plotHeight, plotSpanZ],
      color: plotColor,
      birthAtMs: eventBirthAt,
      riseDelayMs: 0,
      riseDurationMs: 780
    }, MAX_PLOT_INSTANCES);

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
      riseDurationMs: 620
    }, MAX_STREET_INSTANCES);
    pushSolid(streetDecks, 'street', event.sequence, {
      position: [cx, streetDeckY, cz],
      rotationY: yaw,
      size: [districtStreetWidth * 0.92, 0.028, plotSpanZ - streetInsetZ],
      color: streetColor.clone().multiplyScalar(1.05),
      birthAtMs: eventBirthAt,
      riseDelayMs: 70,
      riseDurationMs: 620
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
      riseDurationMs: 700,
      pulseAmp: 0.04 + intensity * 0.07,
      pulseSpeed: 0.3 + intensity * 0.55,
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
      riseDurationMs: 700,
      pulseAmp: 0.04 + intensity * 0.06,
      pulseSpeed: 0.25 + intensity * 0.5,
      pulsePhase: event.sequence * 0.53
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
        riseDurationMs: 760
      }, MAX_LANE_LIGHT_INSTANCES);
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
          riseDurationMs: 680
        }, MAX_STREET_INSTANCES);

        pushLight(laneLights, 'lane', event.sequence, {
          position: [seg.mid[0], corridorY + 0.02, seg.mid[2]],
          rotationY: seg.yaw,
          size: [0.06, 0.02, clearLength * 0.94],
          color: laneLineColor.clone().multiplyScalar(0.85),
          opacity: 0.12 + recencyCurve * 0.12,
          birthAtMs: eventBirthAt,
          riseDelayMs: 140,
          riseDurationMs: 800,
          pulseAmp: 0.05,
          pulseSpeed: 0.22,
          pulsePhase: event.sequence * 0.37
        }, MAX_LANE_LIGHT_INSTANCES);

        // Moving light streaks: cheap city-life motion cue
        const flowCount = DEBUG_VIEW_ENABLED ? 3 : 2;
        for (let f = 0; f < flowCount; f++) {
          pushLight(flowLights, 'flow', event.sequence, {
            position: [seg.mid[0], corridorY + 0.028, seg.mid[2]],
            rotationY: seg.yaw,
            size: [0.14 + f * 0.03, 0.03, Math.max(0.45, clearLength * (0.14 + f * 0.04))],
            color: dominanceColor.clone().lerp(neutralTint, 0.35).multiplyScalar(0.65 + recencyCurve * 0.55),
            opacity: 0.28 + recencyCurve * 0.2,
            birthAtMs: eventBirthAt,
            riseDelayMs: 180 + f * 40,
            riseDurationMs: 760,
            pulseAmp: 0.06 + intensity * 0.08,
            pulseSpeed: 0.35 + intensity * 0.55,
            pulsePhase: event.sequence * (0.33 + f * 0.11),
            slideAxis: 'z',
            slideSpan: Math.max(0.8, clearLength * 0.8),
            slideSpeed: 0.14 + f * 0.06 + intensity * 0.12,
            slidePhase: pseudoRandom(event.sequence * 100 + f) * 0.95
          }, MAX_FLOW_LIGHT_INSTANCES);
        }
      }
    }
    prevDistrictCenter = districtCenter;
    prevDistrictPlotSpan = districtPlotSpan;

    // District massing: podium / shaft / spire tiers with more negative space and capped extremes.
    const buildableRadiusX = plotSpanX * 0.42;
    const buildableRadiusZ = plotSpanZ * 0.42;
    const centralStreetReserve = districtStreetWidth * 0.72;
    const majorCount = Math.max(4, Math.min(10, Math.round(4 + tradeDensity * 4 + volumeSignal * 3)));
    const minorCount = Math.max(2, Math.min(7, Math.round(2 + tradeDensity * 2 + intensity * 2)));
    const centralVerticality = clampFinite(1.05 + intensity * 0.9 + sizeSignal * 0.65, 1.4, 0.9, 2.6);
    const verticalBias = clampFinite(1 + dominance * 0.42 + Math.sign(priceChange || 0) * 0.06, 1, 0.6, 1.8);
    const capHeight = 24 + intensity * 8 + sizeSignal * 5;

    const buildSeed = event.sequence * 1297;
    const totalCandidates = majorCount + minorCount;
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

      if (Math.abs(lx) < centralStreetReserve * 0.8 || Math.abs(lz) < centralStreetReserve * 0.75) {
        continue;
      }

      const [rx, rz] = rotateLocalPoint(lx, lz, yaw);
      const worldX = cx + rx;
      const worldZ = cz + rz;
      const radialNorm = Math.min(1, Math.hypot(lx / buildableRadiusX, lz / buildableRadiusZ));
      const centerWeight = 1 - radialNorm;
      const isMajor = i < majorCount;

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

      const baseTint = towerBaseColor.clone().lerp(dominanceColor, 0.03 + recencyCurve * 0.05);
      const shaftTint = baseTint.clone().multiplyScalar(0.95 + centerWeight * 0.22);
      const spireTint = shaftTint.clone().lerp(detailColor, 0.1 + recencyCurve * 0.08);

      const riseDelayMs = Math.floor(clampFinite(i * (18 + intensity * 18), 0, 0, 1800));
      const riseDurationMs = Math.floor(clampFinite(720 + (1 - centerWeight) * 420 + intensity * 260, 880, 340, 2200));

      // Podium tier
      pushSolid(towerMasses, 'tower', event.sequence, {
        position: [worldX, podiumY, worldZ],
        rotationY: towerYaw,
        size: [footprintW * 1.15, podiumH, footprintD * 1.15],
        color: baseTint,
        birthAtMs: eventBirthAt,
        riseDelayMs,
        riseDurationMs: Math.max(400, riseDurationMs - 180)
      }, MAX_TOWER_MASS_INSTANCES);

      // Mid shaft tier
      pushSolid(towerMasses, 'tower', event.sequence, {
        position: [worldX, shaftY, worldZ],
        rotationY: towerYaw,
        size: [footprintW * (0.72 + pseudoRandom(seed + 8) * 0.18), shaftH, footprintD * (0.72 + pseudoRandom(seed + 9) * 0.18)],
        color: shaftTint,
        birthAtMs: eventBirthAt,
        riseDelayMs: riseDelayMs + 40,
        riseDurationMs
      }, MAX_TOWER_MASS_INSTANCES);

      // Spire tier (optional) to improve silhouette rhythm
      if (addSpire && spireH > 0.2) {
        pushSolid(towerMasses, 'tower', event.sequence, {
          position: [worldX, spireY, worldZ],
          rotationY: towerYaw,
          size: [Math.max(0.14, footprintW * 0.34), spireH, Math.max(0.14, footprintD * 0.34)],
          color: spireTint,
          birthAtMs: eventBirthAt,
          riseDelayMs: riseDelayMs + 80,
          riseDurationMs: Math.max(360, riseDurationMs - 120)
        }, MAX_TOWER_MASS_INSTANCES);
      }

      // Lightweight detail language: vertical strips + occasional bands + crown markers.
      const detailBaseColor = detailColor.clone().multiplyScalar(historySubdue * (0.75 + centerWeight * 0.28));
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
      pushLight(detailLights, 'detail', event.sequence, {
        position: [worldX + dsx, plotHeight + podiumH + stripHeight * 0.55, worldZ + dsz],
        rotationY: towerYaw,
        size: [
          stripLocal[0] !== 0 ? stripThickness : Math.max(0.06, footprintW * 0.46),
          stripHeight,
          stripLocal[1] !== 0 ? stripThickness : Math.max(0.06, footprintD * 0.46)
        ],
        color: detailBaseColor.clone(),
        opacity: MathUtils.clamp(0.16 + recencyCurve * 0.18 + intensity * 0.16, 0.12, 0.62),
        birthAtMs: eventBirthAt,
        riseDelayMs: riseDelayMs + 120,
        riseDurationMs: Math.max(420, riseDurationMs - 80),
        pulseAmp: 0.05 + intensity * 0.08,
        pulseSpeed: 0.25 + recencyCurve * 0.35,
        pulsePhase: event.sequence * 0.61 + i * 0.09
      }, MAX_DETAIL_LIGHT_INSTANCES);

      if (isMajor || pseudoRandom(seed + 15) > 0.62) {
        const bandCount = isMajor ? 2 : 1;
        for (let b = 0; b < bandCount; b++) {
          const bandY = plotHeight + podiumH + shaftH * (0.22 + b * 0.34 + pseudoRandom(seed + 16 + b) * 0.06);
          pushLight(detailLights, 'detail', event.sequence, {
            position: [worldX, bandY, worldZ],
            rotationY: towerYaw,
            size: [Math.max(0.12, footprintW * 0.86), 0.03 + b * 0.005, Math.max(0.12, footprintD * 0.86)],
            color: detailBaseColor.clone().multiplyScalar(0.9 + b * 0.18),
            opacity: MathUtils.clamp(0.1 + intensity * 0.12 + recencyCurve * 0.1, 0.08, 0.44),
            birthAtMs: eventBirthAt,
            riseDelayMs: riseDelayMs + 140 + b * 30,
            riseDurationMs: Math.max(420, riseDurationMs - 40)
          }, MAX_DETAIL_LIGHT_INSTANCES);
        }
      }

      const topY = plotHeight + podiumH + shaftH + (addSpire ? spireH : 0);
      pushLight(haloGlows, 'glow', event.sequence, {
        position: [worldX, topY + 0.08, worldZ],
        rotationY: towerYaw,
        size: [Math.max(0.12, footprintW * (addSpire ? 0.42 : 0.65)), 0.06, Math.max(0.12, footprintD * (addSpire ? 0.42 : 0.65))],
        color: detailBaseColor.clone().lerp(dominanceColor, 0.18 + recencyCurve * 0.18),
        opacity: MathUtils.clamp((0.16 + intensity * 0.18) * historySubdue * frontierEmphasis, 0.1, 0.72),
        birthAtMs: eventBirthAt,
        riseDelayMs: riseDelayMs + 190,
        riseDurationMs: Math.max(360, riseDurationMs - 60),
        pulseAmp: 0.1 + intensity * 0.16,
        pulseSpeed: 0.24 + centerWeight * 0.34,
        pulsePhase: event.sequence * 0.47 + i * 0.21
      }, MAX_HALO_GLOW_INSTANCES);

      // Soft halo sheet (fake bloom support) only for stronger masses.
      if (isMajor && haloGlows.length < MAX_HALO_GLOW_INSTANCES) {
        pushLight(haloGlows, 'glow', event.sequence, {
          position: [worldX, topY + 0.28, worldZ],
          rotationY: towerYaw,
          size: [Math.max(0.22, footprintW * 1.2), 0.11 + intensity * 0.07, Math.max(0.22, footprintD * 1.2)],
          color: dominanceColor.clone().lerp(neutralTint, 0.3).multiplyScalar(0.62 + recencyCurve * 0.5),
          opacity: MathUtils.clamp((0.08 + intensity * 0.14) * frontierEmphasis, 0.06, 0.36),
          birthAtMs: eventBirthAt,
          riseDelayMs: riseDelayMs + 220,
          riseDurationMs: Math.max(380, riseDurationMs),
          pulseAmp: 0.07 + intensity * 0.08,
          pulseSpeed: 0.18 + intensity * 0.18,
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
      opacity: MathUtils.clamp((0.12 + intensity * 0.14) * historySubdue * frontierEmphasis, 0.08, 0.42),
      birthAtMs: eventBirthAt,
      riseDelayMs: 90,
      riseDurationMs: 820,
      pulseAmp: 0.06 + intensity * 0.08,
      pulseSpeed: 0.14 + recencyCurve * 0.16,
      pulsePhase: event.sequence * 0.23
    }, MAX_HALO_GLOW_INSTANCES);
  }

  return {
    plots: plots.slice(0, MAX_PLOT_INSTANCES),
    streetDecks: streetDecks.slice(0, MAX_STREET_INSTANCES),
    towerMasses: towerMasses.slice(0, MAX_TOWER_MASS_INSTANCES),
    laneLights: laneLights.slice(0, MAX_LANE_LIGHT_INSTANCES),
    detailLights: detailLights.slice(0, MAX_DETAIL_LIGHT_INSTANCES),
    haloGlows: haloGlows.slice(0, MAX_HALO_GLOW_INSTANCES),
    flowLights: flowLights.slice(0, MAX_FLOW_LIGHT_INSTANCES)
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
  const visibleEvents = useMemo(() => events.slice(-HISTORY_CAP), [events]);
  const visualData = useMemo(() => buildCityVisualData(visibleEvents), [visibleEvents]);

  const plotMeshRef = useRef<InstancedMesh>(null);
  const streetMeshRef = useRef<InstancedMesh>(null);
  const towerMeshRef = useRef<InstancedMesh>(null);
  const laneLightMeshRef = useRef<InstancedMesh>(null);
  const detailLightMeshRef = useRef<InstancedMesh>(null);
  const haloGlowMeshRef = useRef<InstancedMesh>(null);
  const flowLightMeshRef = useRef<InstancedMesh>(null);
  const matricesSettledRef = useRef(false);

  const latestAnimationEndMs = useMemo(() => {
    let maxMs = 0;
    const layers = [
      visualData.plots,
      visualData.streetDecks,
      visualData.towerMasses,
      visualData.laneLights,
      visualData.detailLights,
      visualData.haloGlows,
      visualData.flowLights
    ] as const;
    for (const layer of layers) {
      for (const item of layer) {
        maxMs = Math.max(maxMs, item.birthAtMs + item.riseDelayMs + item.riseDurationMs);
      }
    }
    return maxMs;
  }, [visualData]);

  const totalInstances =
    visualData.plots.length +
    visualData.streetDecks.length +
    visualData.towerMasses.length +
    visualData.laneLights.length +
    visualData.detailLights.length +
    visualData.haloGlows.length +
    visualData.flowLights.length;

  if (
    !instanceBudgetWarned &&
    totalInstances >
      MAX_PLOT_INSTANCES +
        MAX_STREET_INSTANCES +
        MAX_TOWER_MASS_INSTANCES +
        MAX_LANE_LIGHT_INSTANCES +
        MAX_DETAIL_LIGHT_INSTANCES +
        MAX_HALO_GLOW_INSTANCES +
        MAX_FLOW_LIGHT_INSTANCES
  ) {
    instanceBudgetWarned = true;
    console.warn('[BTC Spot City][city] instance budget exceeded, trimming visuals.');
  }

  useLayoutEffect(() => {
    matricesSettledRef.current = false;
    const now = Date.now();
    applySolidInstances(plotMeshRef.current, visualData.plots, now);
    applySolidInstances(streetMeshRef.current, visualData.streetDecks, now);
    applySolidInstances(towerMeshRef.current, visualData.towerMasses, now);
    applyLightInstances(laneLightMeshRef.current, visualData.laneLights, now);
    applyLightInstances(detailLightMeshRef.current, visualData.detailLights, now);
    applyLightInstances(haloGlowMeshRef.current, visualData.haloGlows, now);
    applyLightInstances(flowLightMeshRef.current, visualData.flowLights, now);
  }, [visualData, latestAnimationEndMs]);

  useFrame(() => {
    const now = Date.now();
    const birthAnimationsSettled = matricesSettledRef.current && now > latestAnimationEndMs;

    if (!birthAnimationsSettled) {
      applySolidInstances(plotMeshRef.current, visualData.plots, now);
      applySolidInstances(streetMeshRef.current, visualData.streetDecks, now);
      applySolidInstances(towerMeshRef.current, visualData.towerMasses, now);
      applyLightInstances(laneLightMeshRef.current, visualData.laneLights, now);
      applyLightInstances(detailLightMeshRef.current, visualData.detailLights, now);
    }

    // Always update ambient motion and glow breathing.
    applyLightInstances(haloGlowMeshRef.current, visualData.haloGlows, now);
    applyLightInstances(flowLightMeshRef.current, visualData.flowLights, now);

    if (!birthAnimationsSettled && now > latestAnimationEndMs + 120) {
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
      <InstancedColorSetup meshRef={plotMeshRef} items={visualData.plots} />
      <InstancedColorSetup meshRef={streetMeshRef} items={visualData.streetDecks} />
      <InstancedColorSetup meshRef={towerMeshRef} items={visualData.towerMasses} />
      <InstancedColorSetup meshRef={laneLightMeshRef} items={visualData.laneLights} brightnessScale={1.1} />
      <InstancedColorSetup meshRef={detailLightMeshRef} items={visualData.detailLights} brightnessScale={1.08} />
      <InstancedColorSetup meshRef={haloGlowMeshRef} items={visualData.haloGlows} brightnessScale={1.18} />
      <InstancedColorSetup meshRef={flowLightMeshRef} items={visualData.flowLights} brightnessScale={1.2} />

      <instancedMesh ref={plotMeshRef} args={[undefined, undefined, Math.max(1, visualData.plots.length)]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          vertexColors
          color={DEBUG_VIEW_ENABLED ? '#1a2430' : '#121a22'}
          roughness={0.92}
          metalness={0.12}
          emissive="#162535"
          emissiveIntensity={DEBUG_VIEW_ENABLED ? 0.28 : 0.18}
        />
      </instancedMesh>

      <instancedMesh ref={streetMeshRef} args={[undefined, undefined, Math.max(1, visualData.streetDecks.length)]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          vertexColors
          color="#090d12"
          roughness={0.96}
          metalness={0.06}
          emissive="#101821"
          emissiveIntensity={DEBUG_VIEW_ENABLED ? 0.16 : 0.1}
        />
      </instancedMesh>

      <instancedMesh ref={towerMeshRef} args={[undefined, undefined, Math.max(1, visualData.towerMasses.length)]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          vertexColors
          color={DEBUG_VIEW_ENABLED ? '#20303d' : '#182531'}
          roughness={0.74}
          metalness={0.24}
          emissive="#315f82"
          emissiveIntensity={DEBUG_VIEW_ENABLED ? 0.95 : 0.62}
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
    </group>
  );
}
