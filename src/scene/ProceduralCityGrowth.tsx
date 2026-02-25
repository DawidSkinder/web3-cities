import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import type { InstancedMesh } from 'three';
import { Color, MathUtils, Object3D } from 'three';
import { useBlockEventStore } from '../data/trades/blockEventStore';
import type { BlockEvent } from '../data/trades/types';
import { getSpineTransformFromSequence } from './cityGrowthPath';

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

const HISTORY_CAP = 36;
const tempObject = new Object3D();

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

function mixColor(a: string, b: string, t: number) {
  return new Color(a).lerp(new Color(b), MathUtils.clamp(t, 0, 1));
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

  for (const event of events) {
    const m = event.metrics;
    const spine = getSpineTransformFromSequence(event.sequence);
    const [cx, , cz] = spine.position;
    const yaw = spine.yaw;
    const dominance = MathUtils.clamp(m.imbalance, -1, 1);
    const intensity = MathUtils.clamp(m.intensity, 0, 1);
    const tradeDensity = MathUtils.clamp(Math.log1p(m.tradeCount) / 4.6, 0, 1);
    const sizeSignal = MathUtils.clamp(Math.log1p(m.averageTradeSize * 1200) / 4, 0, 1);
    const volumeSignal = MathUtils.clamp(Math.log1p(m.totalVolume * 140) / 6, 0, 1);

    const footprint = 0.85 + volumeSignal * 2.35 + intensity * 0.85;
    const plateauHeight = 0.12 + intensity * 0.22 + volumeSignal * 0.16;
    const density = Math.round(5 + tradeDensity * 10 + volumeSignal * 4);
    const baseCount = Math.max(5, Math.min(20, density));

    const buyTint = new Color('#44c8ff');
    const sellTint = new Color('#ff7b42');
    const neutralTint = new Color('#99afc3');

    const dominanceColor = sellTint.clone().lerp(buyTint, (dominance + 1) * 0.5);
    const towerColor = new Color('#0a0d12').lerp(new Color('#16202a'), 0.15 + intensity * 0.2);
    const glowColor = neutralTint.clone().lerp(dominanceColor, 0.35 + intensity * 0.55);
    const baseColor = new Color('#07090d').lerp(dominanceColor, 0.03 + intensity * 0.08);

    const massiveness = 0.9 + intensity * 1.2 + sizeSignal * 0.75;
    const verticalBias = 1 + dominance * 0.55 + Math.sign(m.priceChange || 0) * 0.08;
    const centralCoreHeight = (1.5 + footprint * 0.9 + intensity * 1.8) * massiveness;

    bases.push({
      position: [cx, plateauHeight * 0.5 - 0.01, cz],
      rotationY: yaw,
      size: [footprint * 2.05, plateauHeight, footprint * 1.65],
      color: baseColor,
      birthAtMs: event.emittedAt,
      riseDelayMs: 0,
      riseDurationMs: 700
    });

    const seedBase = event.sequence * 1031;

    for (let i = 0; i < baseCount; i++) {
      const seed = seedBase + i * 17;
      const ringMix = Math.pow(i / Math.max(1, baseCount - 1), 0.75);
      const radial = footprint * (0.18 + ringMix * 0.88) * (0.75 + pseudoRandom(seed + 1) * 0.55);
      const angle = i * 2.3999632297 + pseudoRandom(seed + 2) * 0.7;
      const lx = Math.cos(angle) * radial * (0.8 + pseudoRandom(seed + 3) * 0.4);
      const lz = Math.sin(angle) * radial * (0.55 + pseudoRandom(seed + 4) * 0.65);
      const [rx, rz] = rotateLocalPoint(lx, lz, yaw);

      const width = 0.18 + pseudoRandom(seed + 5) * 0.42 + intensity * 0.12;
      const depth = 0.18 + pseudoRandom(seed + 6) * 0.36 + volumeSignal * 0.09;

      const radialWeight = 1 - Math.min(1, radial / (footprint * 1.2));
      const spireBias = i === 0 ? 1.4 : 1;
      const height =
        (0.55 +
          radialWeight * centralCoreHeight * (0.45 + pseudoRandom(seed + 7) * 0.9) * spireBias +
          intensity * 1.15 +
          tradeDensity * 0.5) *
        Math.max(0.42, verticalBias);

      const actualHeight = Math.max(0.2, height);
      const y = plateauHeight + actualHeight * 0.5;
      const towerLocalColor = towerColor
        .clone()
        .lerp(dominanceColor, radialWeight * 0.05 + intensity * 0.08);

      const riseDelayMs = Math.floor(i * (26 + intensity * 35));
      const riseDurationMs = 850 + Math.floor((1 - radialWeight) * 450 + intensity * 350);

      towers.push({
        position: [cx + rx, y, cz + rz],
        rotationY: yaw + pseudoRandom(seed + 8) * 0.14 - 0.07,
        size: [width, actualHeight, depth],
        color: towerLocalColor,
        birthAtMs: event.emittedAt,
        riseDelayMs,
        riseDurationMs
      });

      const shouldGlow = i === 0 || pseudoRandom(seed + 9) > 0.67 - intensity * 0.2;
      if (shouldGlow) {
        const stripHeight = Math.min(actualHeight * (0.22 + intensity * 0.4), actualHeight * 0.88);
        const stripY = plateauHeight + actualHeight - stripHeight * 0.5;
        const glowWidth = Math.max(0.045, Math.min(width, depth) * (0.24 + intensity * 0.16));
        const glowDepth = Math.max(0.045, glowWidth * (0.9 + pseudoRandom(seed + 11) * 0.4));
        const glowOpacity = 0.22 + intensity * 0.38 + Math.abs(dominance) * 0.16;

        glows.push({
          position: [cx + rx, stripY, cz + rz],
          rotationY: yaw,
          size: [glowWidth, stripHeight, glowDepth],
          color: glowColor.clone(),
          opacity: MathUtils.clamp(glowOpacity, 0.18, 0.9),
          birthAtMs: event.emittedAt,
          riseDelayMs: riseDelayMs + 120,
          riseDurationMs: Math.max(380, riseDurationMs - 160)
        });
      }
    }

    const crownHeight = 0.18 + intensity * 0.42 + Math.abs(dominance) * 0.25;
    glows.push({
      position: [cx, plateauHeight + crownHeight * 0.5 + 0.06, cz],
      rotationY: yaw,
      size: [footprint * 1.05, crownHeight, footprint * 0.85],
      color: glowColor.clone().multiplyScalar(0.95 + intensity * 0.4),
      opacity: 0.1 + intensity * 0.25,
      birthAtMs: event.emittedAt,
      riseDelayMs: 90,
      riseDurationMs: 900
    });
  }

  return { bases, towers, glows };
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

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const ageMs = nowMs - item.birthAtMs - item.riseDelayMs;
    const progress = easeOutCubic(ageMs / item.riseDurationMs);
    const alive = ageMs >= 0 ? progress : 0;

    const pulseScale = pulse ? 0.94 + smoothstep01(progress) * 0.06 : 1;
    const sx = item.size[0] * pulseScale;
    const sy = Math.max(0.0001, item.size[1] * alive);
    const sz = item.size[2] * pulseScale;
    const y = item.position[1] - item.size[1] * 0.5 + sy * 0.5;

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

    for (let i = 0; i < colors.length; i++) {
      mesh.setColorAt(i, colors[i]);
    }
    mesh.count = colors.length;
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
    () => visualData.glows.map((item) => item.color.clone().multiplyScalar(item.opacity)),
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
          color="#0a0d10"
          roughness={0.96}
          metalness={0.12}
          emissive="#0b1017"
          emissiveIntensity={0.1}
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
          color="#0b0f14"
          roughness={0.88}
          metalness={0.18}
          emissive="#101e2a"
          emissiveIntensity={0.16}
        />
      </instancedMesh>

      <instancedMesh
        ref={glowMeshRef}
        args={[undefined, undefined, Math.max(1, visualData.glows.length)]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors transparent opacity={0.95} />
      </instancedMesh>
    </group>
  );
}
