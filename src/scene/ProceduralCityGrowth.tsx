import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import type { InstancedMesh } from 'three';
import { AdditiveBlending, Color, MathUtils, Object3D } from 'three';
import { useBlockEventStore } from '../data/trades/blockEventStore';
import type { BlockEvent } from '../data/trades/types';
import { getSpineTransformFromSequence } from './cityGrowthPath';
import { DEBUG_VIEW_ENABLED } from './viewFlags';

type DistrictBaseInstance = {
  position: [number, number, number];
  rotationY: number;
  size: [number, number, number];
  color: Color;
  birthAtMs: number;
  riseDelayMs: number;
  riseDurationMs: number;
};

type DistrictTowerInstance = {
  position: [number, number, number];
  rotationY: number;
  size: [number, number, number];
  color: Color;
  birthAtMs: number;
  riseDelayMs: number;
  riseDurationMs: number;
};

type DistrictGlowInstance = {
  position: [number, number, number];
  rotationY: number;
  size: [number, number, number];
  color: Color;
  birthAtMs: number;
  riseDelayMs: number;
  riseDurationMs: number;
  opacity: number;
};

type CityVisualData = {
  bases: DistrictBaseInstance[];
  towers: DistrictTowerInstance[];
  glows: DistrictGlowInstance[];
};

const HISTORY_CAP = 42;
const MAX_BASE_INSTANCES = 96;
const MAX_TOWER_INSTANCES = 960;
const MAX_GLOW_INSTANCES = 1400;
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

function warnInvalidEvent(sequence: number, reason: string) {
  if (invalidEventWarnCount >= 24) {
    return;
  }
  invalidEventWarnCount += 1;
  console.warn(`[BTC Spot City][city] skipped event seq=${sequence}: ${reason}`);
}

function warnInvalidInstance(kind: 'base' | 'tower' | 'glow', sequence: number, reason: string) {
  if (invalidInstanceWarnCount >= 40) {
    return;
  }
  invalidInstanceWarnCount += 1;
  console.warn(`[BTC Spot City][city] skipped ${kind} seq=${sequence}: ${reason}`);
}

function isValidRotationY(v: number) {
  return Number.isFinite(v) && Math.abs(v) < Math.PI * 32;
}

function validateAndPushBase(
  eventSequence: number,
  item: DistrictBaseInstance,
  target: DistrictBaseInstance[]
) {
  if (!isFiniteTuple3(item.position)) {
    warnInvalidInstance('base', eventSequence, 'invalid position');
    return;
  }
  if (!isFiniteTuple3(item.size)) {
    warnInvalidInstance('base', eventSequence, 'invalid size');
    return;
  }
  if (!isValidRotationY(item.rotationY)) {
    warnInvalidInstance('base', eventSequence, 'invalid rotation');
    return;
  }
  if (item.size[0] <= 0 || item.size[1] <= 0 || item.size[2] <= 0) {
    warnInvalidInstance('base', eventSequence, 'non-positive size');
    return;
  }
  target.push(item);
}

function validateAndPushTower(
  eventSequence: number,
  item: DistrictTowerInstance,
  target: DistrictTowerInstance[]
) {
  if (!isFiniteTuple3(item.position)) {
    warnInvalidInstance('tower', eventSequence, 'invalid position');
    return;
  }
  if (!isFiniteTuple3(item.size)) {
    warnInvalidInstance('tower', eventSequence, 'invalid size');
    return;
  }
  if (!isValidRotationY(item.rotationY)) {
    warnInvalidInstance('tower', eventSequence, 'invalid rotation');
    return;
  }
  if (item.size[0] <= 0 || item.size[1] <= 0 || item.size[2] <= 0) {
    warnInvalidInstance('tower', eventSequence, 'non-positive size');
    return;
  }
  target.push(item);
}

function validateAndPushGlow(
  eventSequence: number,
  item: DistrictGlowInstance,
  target: DistrictGlowInstance[]
) {
  if (!isFiniteTuple3(item.position)) {
    warnInvalidInstance('glow', eventSequence, 'invalid position');
    return;
  }
  if (!isFiniteTuple3(item.size)) {
    warnInvalidInstance('glow', eventSequence, 'invalid size');
    return;
  }
  if (!isValidRotationY(item.rotationY)) {
    warnInvalidInstance('glow', eventSequence, 'invalid rotation');
    return;
  }
  if (!Number.isFinite(item.opacity) || item.opacity <= 0) {
    warnInvalidInstance('glow', eventSequence, 'invalid opacity');
    return;
  }
  if (item.size[0] <= 0 || item.size[1] <= 0 || item.size[2] <= 0) {
    warnInvalidInstance('glow', eventSequence, 'non-positive size');
    return;
  }
  target.push(item);
}

function rotateLocalPoint(x: number, z: number, yaw: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c - z * s, x * s + z * c];
}

function buildCityVisualData(events: BlockEvent[]): CityVisualData {
  const bases: DistrictBaseInstance[] = [];
  const towers: DistrictTowerInstance[] = [];
  const glows: DistrictGlowInstance[] = [];

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
    const historySubdue = 0.62 + recencyCurve * 0.38;
    const frontierEmphasis = 0.8 + recencyCurve * 0.55;
    const spine = getSpineTransformFromSequence(event.sequence);
    const [cx, , cz] = spine.position;
    if (!isFiniteTuple3([cx, 0, cz]) || !isValidRotationY(spine.yaw)) {
      warnInvalidEvent(event.sequence, 'invalid spine transform');
      continue;
    }

    const yaw = clampFinite(spine.yaw, 0, -Math.PI * 8, Math.PI * 8);
    const dominance = MathUtils.clamp(clampFinite(m.imbalance, 0), -1, 1);
    const intensity = MathUtils.clamp(clampFinite(m.intensity, 0), 0, 1);
    const tradeCount = Math.max(0, Math.floor(clampFinite(m.tradeCount, 0, 0, 200000)));
    const averageTradeSize = Math.max(0, clampFinite(m.averageTradeSize, 0, 0, 5000));
    const totalVolume = Math.max(0, clampFinite(m.totalVolume, 0, 0, 5_000_000));
    const priceChange = clampFinite(m.priceChange, 0, -1_000_000, 1_000_000);

    const tradeDensity = MathUtils.clamp(Math.log1p(tradeCount) / 4.6, 0, 1);
    const sizeSignal = MathUtils.clamp(Math.log1p(averageTradeSize * 1200) / 4, 0, 1);
    const volumeSignal = MathUtils.clamp(Math.log1p(totalVolume * 140) / 6, 0, 1);

    const footprint = clampFinite(
      1.45 + volumeSignal * 2.9 + intensity * 1.15,
      2.2,
      1.2,
      9.5
    );
    const plateauHeight = clampFinite(
      0.18 + intensity * 0.32 + volumeSignal * 0.22,
      0.34,
      0.14,
      1.8
    );
    const density = Math.round(8 + tradeDensity * 12 + volumeSignal * 6);
    const baseCount = Math.max(8, Math.min(24, clampFinite(density, 11, 8, 24)));

    const buyTint = new Color('#44c8ff');
    const sellTint = new Color('#ff7b42');
    const neutralTint = new Color('#99afc3');

    const dominanceColor = sellTint.clone().lerp(buyTint, (dominance + 1) * 0.5);
    const towerColor = new Color('#11171f')
      .lerp(new Color('#243443'), 0.22 + intensity * 0.28)
      .multiplyScalar(0.84 + recencyCurve * 0.28);
    const glowColor = neutralTint
      .clone()
      .lerp(dominanceColor, 0.35 + intensity * 0.55)
      .multiplyScalar(0.78 + recencyCurve * 0.55);
    const baseColor = new Color('#11161d')
      .lerp(dominanceColor, 0.08 + intensity * 0.12)
      .multiplyScalar(0.82 + recencyCurve * 0.22);

    const massiveness = clampFinite(1.15 + intensity * 1.45 + sizeSignal * 0.9, 1.8, 0.85, 5.8);
    const verticalBias = clampFinite(
      1 + dominance * 0.55 + Math.sign(priceChange || 0) * 0.08,
      1,
      0.35,
      2.4
    );
    const centralCoreHeight = clampFinite(
      (2.4 + footprint * 1.05 + intensity * 2.6) * massiveness,
      4.8,
      1.2,
      34
    );

    validateAndPushBase(event.sequence, {
      position: [cx, plateauHeight * 0.5 - 0.01, cz],
      rotationY: yaw,
      size: [footprint * 2.05, plateauHeight, footprint * 1.65],
      color: baseColor.clone(),
      birthAtMs: Math.max(0, clampFinite(event.emittedAt, Date.now())),
      riseDelayMs: 0,
      riseDurationMs: 700
    }, bases);

    const seedBase = event.sequence * 1031;

    for (let i = 0; i < baseCount; i++) {
      if (towers.length >= MAX_TOWER_INSTANCES || glows.length >= MAX_GLOW_INSTANCES) {
        break;
      }

      const seed = seedBase + i * 17;
      const ringMix = Math.pow(i / Math.max(1, baseCount - 1), 0.75);
      const radial = footprint * (0.18 + ringMix * 0.88) * (0.75 + pseudoRandom(seed + 1) * 0.55);
      const angle = i * 2.3999632297 + pseudoRandom(seed + 2) * 0.7;
      const lx = Math.cos(angle) * radial * (0.8 + pseudoRandom(seed + 3) * 0.4);
      const lz = Math.sin(angle) * radial * (0.55 + pseudoRandom(seed + 4) * 0.65);
      const [rx, rz] = rotateLocalPoint(lx, lz, yaw);

      const width = clampFinite(
        0.22 + pseudoRandom(seed + 5) * 0.5 + intensity * 0.18,
        0.42,
        0.16,
        2.4
      );
      const depth = clampFinite(
        0.2 + pseudoRandom(seed + 6) * 0.42 + volumeSignal * 0.14,
        0.38,
        0.14,
        2.4
      );

      const radialWeight = 1 - Math.min(1, radial / (footprint * 1.2));
      const spireBias = i === 0 ? 1.4 : 1;
      const height =
        (1.05 +
          radialWeight * centralCoreHeight * (0.45 + pseudoRandom(seed + 7) * 0.9) * spireBias +
          intensity * 1.85 +
          tradeDensity * 0.95) *
        Math.max(0.42, verticalBias);

      const actualHeight = clampFinite(Math.max(0.9, height), 1.6, 0.75, 42);
      const y = clampFinite(plateauHeight + actualHeight * 0.5, 0.4, -1, 60);
      const towerLocalColor = towerColor
        .clone()
        .lerp(dominanceColor, radialWeight * 0.05 + intensity * 0.08 + recencyCurve * 0.06)
        .multiplyScalar(0.92 + radialWeight * 0.08);

      const riseDelayMs = Math.floor(clampFinite(i * (22 + intensity * 28), 0, 0, 2000));
      const riseDurationMs = Math.floor(
        clampFinite(760 + (1 - radialWeight) * 420 + intensity * 280, 860, 320, 2200)
      );

      validateAndPushTower(event.sequence, {
        position: [cx + rx, y, cz + rz],
        rotationY: yaw + pseudoRandom(seed + 8) * 0.14 - 0.07,
        size: [width, actualHeight, depth],
        color: towerLocalColor,
        birthAtMs: Math.max(0, clampFinite(event.emittedAt, Date.now())),
        riseDelayMs,
        riseDurationMs
      }, towers);

      const shouldGlow = i === 0 || pseudoRandom(seed + 9) > 0.67 - intensity * 0.2;
      if (shouldGlow) {
        const stripHeight = Math.max(
          0.22,
          Math.min(actualHeight * (0.28 + intensity * 0.45), actualHeight * 0.92)
        );
        const stripY = plateauHeight + actualHeight - stripHeight * 0.5;
        const glowWidth = Math.max(0.09, Math.min(width, depth) * (0.3 + intensity * 0.22));
        const glowDepth = Math.max(0.08, glowWidth * (0.95 + pseudoRandom(seed + 11) * 0.4));
        const glowOpacity = clampFinite(
          0.38 + intensity * 0.42 + Math.abs(dominance) * 0.18,
          0.55,
          0.24,
          1
        );

        validateAndPushGlow(event.sequence, {
          position: [cx + rx, stripY, cz + rz],
          rotationY: yaw,
          size: [glowWidth, stripHeight, glowDepth],
          color: glowColor.clone(),
          opacity: MathUtils.clamp(glowOpacity * historySubdue * frontierEmphasis, 0.22, 1),
          birthAtMs: Math.max(0, clampFinite(event.emittedAt, Date.now())),
          riseDelayMs: riseDelayMs + 120,
          riseDurationMs: Math.max(380, riseDurationMs - 160)
        }, glows);
      }
    }

    const crownHeight = clampFinite(
      0.28 + intensity * 0.62 + Math.abs(dominance) * 0.32,
      0.5,
      0.2,
      2.4
    );
    if (glows.length < MAX_GLOW_INSTANCES) {
      validateAndPushGlow(event.sequence, {
      position: [cx, plateauHeight + crownHeight * 0.5 + 0.06, cz],
      rotationY: yaw,
      size: [footprint * 1.15, crownHeight, footprint * 0.95],
      color: glowColor.clone().multiplyScalar((1.05 + intensity * 0.55) * (0.85 + recencyCurve * 0.35)),
      opacity: MathUtils.clamp((0.22 + intensity * 0.34) * (0.85 + recencyCurve * 0.4), 0.18, 0.9),
      birthAtMs: Math.max(0, clampFinite(event.emittedAt, Date.now())),
      riseDelayMs: 90,
      riseDurationMs: 900
      }, glows);
    }

    if (bases.length >= MAX_BASE_INSTANCES) {
      break;
    }
  }

  return {
    bases: bases.slice(0, MAX_BASE_INSTANCES),
    towers: towers.slice(0, MAX_TOWER_INSTANCES),
    glows: glows.slice(0, MAX_GLOW_INSTANCES)
  };
}

function applyAnimatedInstances<T extends { position: [number, number, number]; rotationY: number; size: [number, number, number]; birthAtMs: number; riseDelayMs: number; riseDurationMs: number }>(
  mesh: InstancedMesh | null,
  items: T[],
  nowMs: number,
  pulse = false
) {
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

    const pulseScale = pulse ? 0.94 + smoothstep01(progress) * 0.06 : 1;
    const sx = item.size[0] * pulseScale;
    const sy = Math.max(0.0001, item.size[1] * alive);
    const sz = item.size[2] * pulseScale;
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

function InstancedColorSetup({
  meshRef,
  colors
}: {
  meshRef: RefObject<InstancedMesh>;
  colors: Color[];
}) {
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }

    const capacity = mesh.instanceMatrix?.count ?? 0;
    const count = Math.min(colors.length, capacity);
    for (let i = 0; i < count; i++) {
      mesh.setColorAt(i, colors[i]);
    }
    mesh.count = count;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [meshRef, colors]);

  return null;
}

export function ProceduralCityGrowth() {
  const { events } = useBlockEventStore();
  const visibleEvents = useMemo(() => events.slice(-HISTORY_CAP), [events]);

  const visualData = useMemo(() => buildCityVisualData(visibleEvents), [visibleEvents]);

  const baseMeshRef = useRef<InstancedMesh>(null);
  const towerMeshRef = useRef<InstancedMesh>(null);
  const glowMeshRef = useRef<InstancedMesh>(null);
  const matricesSettledRef = useRef(false);

  const baseColors = useMemo(() => visualData.bases.map((item) => item.color), [visualData.bases]);
  const towerColors = useMemo(() => visualData.towers.map((item) => item.color), [visualData.towers]);
  const glowColors = useMemo(
    () =>
      visualData.glows.map((item) =>
        item.color.clone().multiplyScalar(DEBUG_VIEW_ENABLED ? 1.45 : 1.05 + item.opacity * 1.15)
      ),
    [visualData.glows]
  );
  const latestAnimationEndMs = useMemo(() => {
    let maxMs = 0;
    for (const item of visualData.bases) {
      maxMs = Math.max(maxMs, item.birthAtMs + item.riseDelayMs + item.riseDurationMs);
    }
    for (const item of visualData.towers) {
      maxMs = Math.max(maxMs, item.birthAtMs + item.riseDelayMs + item.riseDurationMs);
    }
    for (const item of visualData.glows) {
      maxMs = Math.max(maxMs, item.birthAtMs + item.riseDelayMs + item.riseDurationMs);
    }
    return maxMs;
  }, [visualData]);

  const totalInstances =
    visualData.bases.length + visualData.towers.length + visualData.glows.length;
  if (
    !instanceBudgetWarned &&
    totalInstances > MAX_GLOW_INSTANCES + MAX_TOWER_INSTANCES + MAX_BASE_INSTANCES
  ) {
    instanceBudgetWarned = true;
    console.warn('[BTC Spot City][city] instance budget exceeded, trimming visuals.');
  }

  useLayoutEffect(() => {
    matricesSettledRef.current = false;
    const now = Date.now();
    applyAnimatedInstances(baseMeshRef.current, visualData.bases, now);
    applyAnimatedInstances(towerMeshRef.current, visualData.towers, now);
    applyAnimatedInstances(glowMeshRef.current, visualData.glows, now, true);
  }, [visualData, latestAnimationEndMs]);

  useFrame(() => {
    const now = Date.now();
    if (matricesSettledRef.current && now > latestAnimationEndMs) {
      return;
    }

    applyAnimatedInstances(baseMeshRef.current, visualData.bases, now);
    applyAnimatedInstances(towerMeshRef.current, visualData.towers, now);
    applyAnimatedInstances(glowMeshRef.current, visualData.glows, now, true);

    if (now > latestAnimationEndMs + 100) {
      matricesSettledRef.current = true;
    }
  });

  if (
    visualData.bases.length === 0 &&
    visualData.towers.length === 0 &&
    visualData.glows.length === 0
  ) {
    return null;
  }

  return (
    <group>
      <InstancedColorSetup meshRef={baseMeshRef} colors={baseColors} />
      <InstancedColorSetup meshRef={towerMeshRef} colors={towerColors} />
      <InstancedColorSetup meshRef={glowMeshRef} colors={glowColors} />

      <instancedMesh
        ref={baseMeshRef}
        args={[undefined, undefined, Math.max(1, visualData.bases.length)]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          vertexColors
          color={DEBUG_VIEW_ENABLED ? '#18212b' : '#121a23'}
          roughness={0.84}
          metalness={0.2}
          emissive="#22384b"
          emissiveIntensity={DEBUG_VIEW_ENABLED ? 0.52 : 0.36}
        />
      </instancedMesh>

      <instancedMesh
        ref={towerMeshRef}
        args={[undefined, undefined, Math.max(1, visualData.towers.length)]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          vertexColors
          color={DEBUG_VIEW_ENABLED ? '#1d2b37' : '#18232e'}
          roughness={0.72}
          metalness={0.24}
          emissive="#3a6d92"
          emissiveIntensity={DEBUG_VIEW_ENABLED ? 1.05 : 0.72}
        />
      </instancedMesh>

      <instancedMesh
        ref={glowMeshRef}
        args={[undefined, undefined, Math.max(1, visualData.glows.length)]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={DEBUG_VIEW_ENABLED ? 1 : 0.95}
          depthWrite={false}
          depthTest
          toneMapped={false}
          blending={AdditiveBlending}
        />
      </instancedMesh>
    </group>
  );
}
