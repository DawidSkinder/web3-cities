import { MathUtils, Vector3 } from 'three';

const CAMERA_CLEARANCE_PAD = 4.4;
const CAMERA_CLEARANCE_Y = 9.2;
const MAX_DOWNWARD_PITCH_DEG = 38;

export type CinematicFlyoverSceneKind = 'crypto' | 'market';

export type CinematicFlyoverTarget = {
  sequence: number;
  x: number;
  z: number;
  height: number;
  radius?: number;
};

export type CinematicFlyoverObstacle = {
  sequence?: number;
  x: number;
  z: number;
  height: number;
  radius: number;
};

type CinematicFlyoverSourceTarget = CinematicFlyoverTarget & {
  baseW?: number;
  baseD?: number;
  footprintX?: number;
  footprintZ?: number;
  priceChangePercent?: number;
  quoteVolume24h?: number;
  usdNotional?: number;
  logUsd?: number;
  intensity?: number;
  isHero?: boolean;
  heroMult?: number;
  isTopGainer?: boolean;
  isTopVolume?: boolean;
  emittedAt?: number;
  districtId?: number;
  rank?: number;
};

type Point3 = {
  x: number;
  y: number;
  z: number;
};

type Direction2 = {
  x: number;
  z: number;
};

type SceneCenter = {
  x: number;
  z: number;
};

type WeightedTarget = CinematicFlyoverTarget & {
  importanceScore: number;
  radialScore: number;
  angleFromCenter: number;
  districtId?: number;
};

type FlyoverEase = 'slow' | 'glide' | 'surge' | 'calm';

type FlyoverKeyframe = {
  time: number;
  position: Point3;
  target: Point3;
  ease: FlyoverEase;
};

type RingAnchor = {
  obstacle: CinematicFlyoverObstacle | null;
  angle: number;
  radial: number;
};

type CanyonShot = {
  startPosition: Point3;
  startTarget: Point3;
  endPosition: Point3;
  endTarget: Point3;
};

export type CinematicFlyoverPlan = {
  keyframes: FlyoverKeyframe[];
  totalDuration: number;
  obstacles: CinematicFlyoverObstacle[];
};

const targetScratch = new Vector3();
const directionScratch = new Vector3();

function point(x: number, y: number, z: number): Point3 {
  return { x, y, z };
}

function setVector(out: Vector3, input: Point3) {
  out.set(input.x, input.y, input.z);
}

function clamp01(value: number) {
  return MathUtils.clamp(value, 0, 1);
}

function normalizeDirection2(x: number, z: number, fallbackX = 0, fallbackZ = 1): Direction2 {
  const length = Math.hypot(x, z);
  if (length > 0.001) {
    return { x: x / length, z: z / length };
  }

  const fallbackLength = Math.hypot(fallbackX, fallbackZ);
  if (fallbackLength > 0.001) {
    return { x: fallbackX / fallbackLength, z: fallbackZ / fallbackLength };
  }

  return { x: 0, z: 1 };
}

function angleOf(x: number, z: number) {
  return Math.atan2(x, z);
}

function angleDelta(a: number, b: number) {
  let delta = a - b;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function smoothstep01(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function smootherstep01(value: number) {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function easeInOutCubic01(value: number) {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeInOutSine01(value: number) {
  const t = clamp01(value);
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function easeSegment(kind: FlyoverEase, value: number) {
  switch (kind) {
    case 'slow':
      return smootherstep01(value);
    case 'surge':
      return easeInOutCubic01(value);
    case 'calm':
      return easeInOutSine01(value);
    case 'glide':
    default:
      return smoothstep01(value);
  }
}

function catmullRomScalar(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function distance2D(left: { x: number; z: number }, right: { x: number; z: number }) {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function percentile(values: readonly number[], q: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const clamped = clamp01(q);
  const index = (sorted.length - 1) * clamped;
  const lower = Math.floor(index);
  const upper = Math.min(sorted.length - 1, lower + 1);
  const blend = index - lower;
  return MathUtils.lerp(sorted[lower], sorted[upper], blend);
}

function normalizeMetric(value: number | undefined, min: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  if (max <= min + 1e-6) return 1;
  return clamp01(((value ?? 0) - min) / (max - min));
}

function computeSelectionRadius(target: CinematicFlyoverSourceTarget) {
  if (Number.isFinite(target.radius)) {
    return Math.max(2.8, target.radius ?? 0);
  }
  return Math.max(
    2.8,
    (target.baseW ?? 0) * 0.52,
    (target.baseD ?? 0) * 0.52,
    (target.footprintX ?? 0) * 0.34,
    (target.footprintZ ?? 0) * 0.34,
    2.6 + target.height * 0.055
  );
}

function computeSceneCenter(items: readonly { x: number; z: number; height: number }[]): SceneCenter {
  if (items.length === 0) return { x: 0, z: 0 };

  let weightedX = 0;
  let weightedZ = 0;
  let totalWeight = 0;
  for (const item of items) {
    const weight = Math.max(1, Math.sqrt(Math.max(0, item.height)));
    weightedX += item.x * weight;
    weightedZ += item.z * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 1e-6) return { x: 0, z: 0 };
  return {
    x: weightedX / totalWeight,
    z: weightedZ / totalWeight
  };
}

function computeSceneRadius(center: SceneCenter, items: readonly { x: number; z: number; radius?: number }[]) {
  let radius = 18;
  for (const item of items) {
    radius = Math.max(radius, Math.hypot(item.x - center.x, item.z - center.z) + Math.max(0, item.radius ?? 0));
  }
  return radius;
}

function computeObstacleSafeY(x: number, z: number, baseY: number, obstacles: readonly CinematicFlyoverObstacle[]) {
  let safeY = baseY;

  for (const obstacle of obstacles) {
    const actualRadius = Math.max(0.001, obstacle.radius);
    const avoidRadius = actualRadius + CAMERA_CLEARANCE_PAD;
    const distance = Math.hypot(x - obstacle.x, z - obstacle.z);
    const obstacleSafeY = obstacle.height + CAMERA_CLEARANCE_Y;

    if (distance <= actualRadius) {
      safeY = Math.max(safeY, obstacleSafeY);
      continue;
    }

    if (distance >= avoidRadius) continue;

    const influence = MathUtils.smoothstep(1 - (distance - actualRadius) / Math.max(0.001, avoidRadius - actualRadius), 0, 1);
    safeY = Math.max(safeY, MathUtils.lerp(baseY, obstacleSafeY, influence));
  }

  return safeY;
}

function enforceDownwardPitchLimit(position: Vector3, target: Vector3) {
  const drop = position.y - target.y;
  if (drop <= 0) return;

  const horizontalX = target.x - position.x;
  const horizontalZ = target.z - position.z;
  const horizontalDistance = Math.hypot(horizontalX, horizontalZ);
  const minHorizontalDistance = drop / Math.tan(MathUtils.degToRad(MAX_DOWNWARD_PITCH_DEG));
  if (horizontalDistance >= minHorizontalDistance) return;

  const direction = normalizeDirection2(horizontalX, horizontalZ, horizontalX, horizontalZ);
  target.x = position.x + direction.x * minHorizontalDistance;
  target.z = position.z + direction.z * minHorizontalDistance;
}

function liftShotPosition(
  targetX: number,
  targetZ: number,
  targetY: number,
  candidateX: number,
  candidateZ: number,
  candidateY: number,
  minDistance: number,
  obstacles: readonly CinematicFlyoverObstacle[],
  safeMaxY: number
) {
  const direction = normalizeDirection2(candidateX - targetX, candidateZ - targetZ, 0, 1);
  const currentDistance = Math.max(0.001, Math.hypot(candidateX - targetX, candidateZ - targetZ));
  const requiredDistance = Math.max(minDistance, (candidateY - targetY) / Math.tan(MathUtils.degToRad(32)));
  const finalDistance = Math.max(currentDistance, requiredDistance);
  const x = targetX + direction.x * finalDistance;
  const z = targetZ + direction.z * finalDistance;
  const y = MathUtils.clamp(computeObstacleSafeY(x, z, candidateY, obstacles), 8, safeMaxY + 42);
  return point(x, y, z);
}

function normalizeObstacle(obstacle: CinematicFlyoverObstacle): CinematicFlyoverObstacle {
  return {
    sequence: obstacle.sequence,
    x: obstacle.x,
    z: obstacle.z,
    height: Math.max(0, obstacle.height),
    radius: Math.max(2.8, obstacle.radius)
  };
}

function orderTargetsForRoute(targets: readonly WeightedTarget[], start: { x: number; z: number }) {
  if (targets.length <= 1) return [...targets];

  const remaining = [...targets];
  const ordered: WeightedTarget[] = [];
  let current = start;

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const distance = Math.max(1, distance2D(current, candidate));
      const score = candidate.importanceScore * 0.72 + candidate.radialScore * 0.18 - distance * 0.012;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const selected = remaining.splice(bestIndex, 1)[0];
    ordered.push(selected);
    current = selected;
  }

  return ordered;
}

function buildWeightedTargets(
  towers: readonly CinematicFlyoverSourceTarget[],
  sceneKind: CinematicFlyoverSceneKind
): { weighted: WeightedTarget[]; center: SceneCenter; sceneRadius: number } {
  if (towers.length === 0) {
    return { weighted: [], center: { x: 0, z: 0 }, sceneRadius: 18 };
  }

  const normalized = towers.map((tower) => ({
    ...tower,
    radius: computeSelectionRadius(tower)
  }));
  const center = computeSceneCenter(normalized);
  const sceneRadius = computeSceneRadius(center, normalized);
  const heights = normalized.map((tower) => tower.height);
  const notionals = normalized.map((tower) => tower.usdNotional ?? tower.logUsd ?? 0);
  const intensities = normalized.map((tower) => tower.intensity ?? 0);
  const changes = normalized.map((tower) => tower.priceChangePercent ?? 0);
  const volumes = normalized.map((tower) => tower.quoteVolume24h ?? 0);
  const ranks = normalized.map((tower) => tower.rank ?? 0);
  const emittedAtValues = normalized.map((tower) => tower.emittedAt ?? 0);
  const minHeight = Math.min(...heights);
  const maxHeight = Math.max(...heights);
  const minNotional = Math.min(...notionals);
  const maxNotional = Math.max(...notionals);
  const minIntensity = Math.min(...intensities);
  const maxIntensity = Math.max(...intensities);
  const minChange = Math.min(...changes);
  const maxChange = Math.max(...changes);
  const minVolume = Math.min(...volumes);
  const maxVolume = Math.max(...volumes);
  const minRank = Math.min(...ranks);
  const maxRank = Math.max(...ranks);
  const minEmittedAt = Math.min(...emittedAtValues);
  const maxEmittedAt = Math.max(...emittedAtValues);

  return {
    center,
    sceneRadius,
    weighted: normalized.map((tower) => {
      const heightN = normalizeMetric(tower.height, minHeight, maxHeight);
      const notionalN = normalizeMetric(tower.usdNotional ?? tower.logUsd ?? 0, minNotional, maxNotional);
      const intensityN = normalizeMetric(tower.intensity ?? 0, minIntensity, maxIntensity);
      const changeN = normalizeMetric(tower.priceChangePercent ?? 0, minChange, maxChange);
      const positiveChangeN = normalizeMetric(Math.max(0, tower.priceChangePercent ?? 0), 0, Math.max(0.001, maxChange));
      const volumeN = normalizeMetric(tower.quoteVolume24h ?? 0, minVolume, maxVolume);
      const recencyN = normalizeMetric(tower.emittedAt ?? 0, minEmittedAt, maxEmittedAt);
      const rankN =
        Number.isFinite(tower.rank) && maxRank > minRank
          ? 1 - normalizeMetric(tower.rank ?? maxRank, minRank, maxRank)
          : Number.isFinite(tower.rank)
            ? 1
            : 0;
      const radialDistance = Math.hypot(tower.x - center.x, tower.z - center.z);
      const radialScore = clamp01(radialDistance / Math.max(18, sceneRadius));
      const angleFromCenter = angleOf(tower.x - center.x, tower.z - center.z);

      const cryptoScore =
        heightN * 1.16 +
        notionalN * 1.28 +
        intensityN * 0.88 +
        recencyN * 0.38 +
        (tower.isHero ? 0.72 : 0) +
        (tower.heroMult ?? 0) * 0.18 +
        radialScore * 0.2;
      const marketScore =
        positiveChangeN * 1.34 +
        heightN * 0.94 +
        volumeN * 1.08 +
        rankN * 0.28 +
        radialScore * 0.24 +
        (tower.isTopGainer ? 0.88 : 0) +
        (tower.isTopVolume ? 0.68 : 0) +
        Math.max(0, changeN - 0.35) * 0.24;

      return {
        sequence: tower.sequence,
        x: tower.x,
        z: tower.z,
        height: tower.height,
        radius: tower.radius,
        importanceScore: sceneKind === 'crypto' ? cryptoScore : marketScore,
        radialScore,
        angleFromCenter,
        districtId: tower.districtId
      };
    })
  };
}

function chooseBestCandidate(
  candidates: readonly WeightedTarget[],
  selected: readonly WeightedTarget[],
  center: SceneCenter,
  sceneRadius: number,
  evaluator: (candidate: WeightedTarget) => number,
  minimumSpacing: number,
  preferredAngle?: number
) {
  let best: WeightedTarget | null = null;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    if (selected.some((entry) => entry.sequence === candidate.sequence)) continue;

    let nearestDistance = Infinity;
    let nearestAngleDelta = Math.PI;
    let sameDistrict = false;
    for (const entry of selected) {
      const distance = distance2D(candidate, entry);
      nearestDistance = Math.min(nearestDistance, distance);
      nearestAngleDelta = Math.min(nearestAngleDelta, Math.abs(angleDelta(candidate.angleFromCenter, entry.angleFromCenter)));
      sameDistrict = sameDistrict || (candidate.districtId != null && entry.districtId != null && candidate.districtId === entry.districtId);
    }

    if (nearestDistance < minimumSpacing * 0.58) continue;

    const distanceScore = Number.isFinite(nearestDistance) ? clamp01(nearestDistance / Math.max(1, sceneRadius)) : 1;
    const angleScore = selected.length === 0 ? 1 : clamp01(nearestAngleDelta / Math.PI);
    const preferredAngleScore =
      preferredAngle == null ? 0 : 1 - clamp01(Math.abs(angleDelta(candidate.angleFromCenter, preferredAngle)) / Math.PI);
    const centerDistance = Math.hypot(candidate.x - center.x, candidate.z - center.z);
    const centerScore = clamp01(centerDistance / Math.max(18, sceneRadius));
    const districtBonus = sameDistrict ? -0.18 : 0.12;
    const clusterPenalty = nearestDistance < minimumSpacing ? (minimumSpacing - nearestDistance) / minimumSpacing : 0;

    const score =
      evaluator(candidate) +
      distanceScore * 0.32 +
      angleScore * 0.34 +
      centerScore * 0.18 +
      preferredAngleScore * 0.32 +
      districtBonus -
      clusterPenalty * 1.25;

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

export function pickCinematicFlyoverTargets<T extends CinematicFlyoverSourceTarget>(
  towers: readonly T[],
  options: {
    mode?: CinematicFlyoverSceneKind;
    limit?: number;
  } = {}
): CinematicFlyoverTarget[] {
  const sceneKind = options.mode ?? 'crypto';
  const requestedLimit = Math.max(3, Math.min(5, options.limit ?? 5));
  const { weighted, center, sceneRadius } = buildWeightedTargets(towers, sceneKind);
  if (weighted.length === 0) return [];

  const minimumSpacing = sceneKind === 'crypto' ? Math.max(12, sceneRadius * 0.2) : Math.max(14, sceneRadius * 0.24);
  const selected: WeightedTarget[] = [];

  if (sceneKind === 'crypto') {
    const primary = chooseBestCandidate(
      weighted,
      selected,
      center,
      sceneRadius,
      (candidate) => candidate.importanceScore + candidate.height * 0.024 + candidate.radialScore * 0.2,
      minimumSpacing
    );
    if (primary) selected.push(primary);

    const strongBuy = chooseBestCandidate(
      weighted,
      selected,
      center,
      sceneRadius,
      (candidate) => candidate.importanceScore * 1.18 + candidate.height * 0.018 + candidate.radialScore * 0.12,
      minimumSpacing,
      primary ? primary.angleFromCenter + Math.PI * 0.24 : undefined
    );
    if (strongBuy) selected.push(strongBuy);

    const broadHero = chooseBestCandidate(
      weighted,
      selected,
      center,
      sceneRadius,
      (candidate) => candidate.importanceScore + candidate.radialScore * 0.28,
      minimumSpacing,
      primary ? primary.angleFromCenter + Math.PI : undefined
    );
    if (broadHero) selected.push(broadHero);

    const emerging = chooseBestCandidate(
      weighted,
      selected,
      center,
      sceneRadius,
      (candidate) =>
        candidate.importanceScore * 0.82 +
        candidate.height * 0.016 +
        (1 - Math.abs(candidate.radialScore - 0.58)) * 0.52,
      minimumSpacing * 0.92,
      primary ? primary.angleFromCenter - Math.PI * 0.42 : undefined
    );
    if (emerging) selected.push(emerging);
  } else {
    const primary = chooseBestCandidate(
      weighted,
      selected,
      center,
      sceneRadius,
      (candidate) => candidate.importanceScore * 1.16 + candidate.height * 0.02,
      minimumSpacing
    );
    if (primary) selected.push(primary);

    const tallest = chooseBestCandidate(
      weighted,
      selected,
      center,
      sceneRadius,
      (candidate) => candidate.height * 0.028 + candidate.importanceScore * 0.82,
      minimumSpacing * 0.92,
      primary ? primary.angleFromCenter + Math.PI * 0.14 : undefined
    );
    if (tallest) selected.push(tallest);

    const topVolume = chooseBestCandidate(
      weighted,
      selected,
      center,
      sceneRadius,
      (candidate) => candidate.importanceScore * 0.96 + candidate.radialScore * 0.24,
      minimumSpacing,
      primary ? primary.angleFromCenter - Math.PI * 0.4 : undefined
    );
    if (topVolume) selected.push(topVolume);

    const oppositeSide = chooseBestCandidate(
      weighted,
      selected,
      center,
      sceneRadius,
      (candidate) => candidate.importanceScore + candidate.radialScore * 0.32,
      minimumSpacing,
      primary ? primary.angleFromCenter + Math.PI : undefined
    );
    if (oppositeSide) selected.push(oppositeSide);
  }

  while (selected.length < Math.min(requestedLimit, weighted.length)) {
    const preferredAngle =
      selected.length === 0
        ? undefined
        : selected[0].angleFromCenter + (selected.length % 2 === 0 ? Math.PI * 0.62 : -Math.PI * 0.48);
    const filler = chooseBestCandidate(
      weighted,
      selected,
      center,
      sceneRadius,
      (candidate) => candidate.importanceScore + candidate.radialScore * 0.22,
      minimumSpacing * 0.9,
      preferredAngle
    );
    if (!filler) break;
    selected.push(filler);
  }

  const primary = selected[0] ?? weighted[0];
  const secondaries = orderTargetsForRoute(selected.slice(1), primary);
  return [primary, ...secondaries].slice(0, requestedLimit).map(({ sequence, x, z, height, radius }) => ({
    sequence,
    x,
    z,
    height,
    radius
  }));
}

function buildRevealDirection(center: SceneCenter, primary: CinematicFlyoverTarget, secondaries: readonly CinematicFlyoverTarget[]) {
  const heroVector = normalizeDirection2(primary.x - center.x, primary.z - center.z, 0.74, -0.62);
  const fallbackTurn = secondaries.length > 0 ? angleDelta(angleOf(secondaries[0].x - center.x, secondaries[0].z - center.z), angleOf(heroVector.x, heroVector.z)) : 0;
  const turnSign = fallbackTurn === 0 ? (primary.x >= center.x ? 1 : -1) : fallbackTurn >= 0 ? 1 : -1;
  return {
    outward: normalizeDirection2(-heroVector.x, -heroVector.z, -0.74, 0.62),
    turnSign
  };
}

function buildOuterRingCandidates(
  obstacles: readonly CinematicFlyoverObstacle[],
  center: SceneCenter,
  sceneRadius: number,
  maxY: number
) {
  const heights = obstacles.map((obstacle) => obstacle.height);
  const lowBand = percentile(heights, 0.22);
  const highBand = percentile(heights, 0.68);
  return obstacles.filter((obstacle) => {
    const radial = Math.hypot(obstacle.x - center.x, obstacle.z - center.z);
    return radial >= sceneRadius * 0.52 && radial <= sceneRadius * 1.08 && obstacle.height >= lowBand && obstacle.height <= Math.max(lowBand, highBand) && obstacle.height <= maxY * 0.82;
  });
}

function pickRingAnchor(
  candidates: readonly CinematicFlyoverObstacle[],
  center: SceneCenter,
  sceneRadius: number,
  desiredAngle: number
): RingAnchor {
  let best: CinematicFlyoverObstacle | null = null;
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const radial = Math.hypot(candidate.x - center.x, candidate.z - center.z);
    const angle = angleOf(candidate.x - center.x, candidate.z - center.z);
    const score =
      (1 - clamp01(Math.abs(angleDelta(angle, desiredAngle)) / Math.PI)) * 1.2 +
      clamp01(radial / Math.max(18, sceneRadius)) * 0.42 +
      clamp01(candidate.height / 48) * 0.16;

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return {
    obstacle: best,
    angle: desiredAngle,
    radial: best ? Math.hypot(best.x - center.x, best.z - center.z) : sceneRadius * 0.82
  };
}

function buildRingShot(
  anchor: RingAnchor,
  center: SceneCenter,
  sceneRadius: number,
  safeMaxY: number,
  obstacles: readonly CinematicFlyoverObstacle[],
  turnSign: number
) {
  const obstacle = anchor.obstacle;
  const radialDir = obstacle
    ? normalizeDirection2(obstacle.x - center.x, obstacle.z - center.z, Math.sin(anchor.angle), Math.cos(anchor.angle))
    : normalizeDirection2(Math.sin(anchor.angle), Math.cos(anchor.angle), 0, 1);
  const tangent = { x: radialDir.z * turnSign, z: -radialDir.x * turnSign };
  const subjectX = obstacle ? obstacle.x : center.x + radialDir.x * anchor.radial;
  const subjectZ = obstacle ? obstacle.z : center.z + radialDir.z * anchor.radial;
  const subjectY = obstacle ? MathUtils.clamp(obstacle.height * 0.44 + 7, 4.8, safeMaxY + 8) : MathUtils.clamp(safeMaxY * 0.24 + 5, 4.8, safeMaxY + 8);
  const standOff = obstacle ? obstacle.radius + 10 : Math.max(14, sceneRadius * 0.2);
  const cameraX = subjectX + radialDir.x * standOff + tangent.x * Math.max(4.5, standOff * 0.32);
  const cameraZ = subjectZ + radialDir.z * standOff + tangent.z * Math.max(4.5, standOff * 0.32);
  const cameraY = computeObstacleSafeY(cameraX, cameraZ, MathUtils.clamp(subjectY + 5.2, 10, safeMaxY + 16), obstacles);
  const position = point(cameraX, cameraY, cameraZ);
  const target = point(
    MathUtils.lerp(subjectX, center.x, 0.26),
    Math.max(4.2, Math.min(subjectY, cameraY - 6.5)),
    MathUtils.lerp(subjectZ, center.z, 0.26)
  );
  return { position, target };
}

function buildHeroPassShots(
  hero: CinematicFlyoverTarget,
  previousAnchor: Point3,
  nextAnchor: { x: number; z: number },
  center: SceneCenter,
  sceneRadius: number,
  safeMaxY: number,
  obstacles: readonly CinematicFlyoverObstacle[],
  turnSign: number,
  closeEmphasis: boolean
) {
  const heroRadius = Math.max(3.2, hero.radius ?? Math.max(3.2, 2.8 + hero.height * 0.06));
  const incoming = normalizeDirection2(hero.x - previousAnchor.x, hero.z - previousAnchor.z, hero.x - center.x, hero.z - center.z);
  const outgoing = normalizeDirection2(nextAnchor.x - hero.x, nextAnchor.z - hero.z, hero.x - center.x, hero.z - center.z);
  const travel = normalizeDirection2(incoming.x * 0.5 + outgoing.x, incoming.z * 0.5 + outgoing.z, outgoing.x, outgoing.z);
  const side = { x: travel.z * turnSign, z: -travel.x * turnSign };
  const lookY = MathUtils.clamp(hero.height * (closeEmphasis ? 0.82 : 0.7), 5.2, hero.height + 16);
  const standoff = MathUtils.clamp(heroRadius + hero.height * (closeEmphasis ? 0.34 : 0.26), 16, Math.max(22, sceneRadius * 0.28));
  const lateral = MathUtils.clamp(standoff * (closeEmphasis ? 0.72 : 0.56), 7.5, 22);

  const shotA = liftShotPosition(
    hero.x,
    hero.z,
    lookY,
    hero.x - travel.x * standoff + side.x * lateral,
    hero.z - travel.z * standoff + side.z * lateral,
    MathUtils.clamp(hero.height * (closeEmphasis ? 0.76 : 0.62) + 11, 10, safeMaxY + 26),
    heroRadius + 10,
    obstacles,
    safeMaxY
  );
  const targetA = point(hero.x, lookY, hero.z);

  const shotB = liftShotPosition(
    hero.x,
    hero.z,
    Math.min(hero.height + 14, lookY + 4),
    hero.x + travel.x * (standoff * 0.24) - side.x * (lateral * 0.72),
    hero.z + travel.z * (standoff * 0.24) - side.z * (lateral * 0.72),
    MathUtils.clamp(hero.height * (closeEmphasis ? 0.88 : 0.74) + 10, 11, safeMaxY + 30),
    heroRadius + 8.2,
    obstacles,
    safeMaxY
  );
  const targetB = point(hero.x, Math.min(hero.height + 18, lookY + 6), hero.z);

  return { shotA, targetA, shotB, targetB };
}

function buildCanyonShot(
  obstacles: readonly CinematicFlyoverObstacle[],
  center: SceneCenter,
  sceneRadius: number,
  maxY: number,
  fromPoint: Point3,
  primary: CinematicFlyoverTarget
): CanyonShot {
  const tall = [...obstacles]
    .sort((left, right) => right.height - left.height)
    .slice(0, Math.min(obstacles.length, 14));

  const preferredAxis = normalizeDirection2(primary.x - fromPoint.x, primary.z - fromPoint.z, primary.x - center.x, primary.z - center.z);
  let bestPair: { a: CinematicFlyoverObstacle; b: CinematicFlyoverObstacle; midpointX: number; midpointZ: number; axis: Direction2 } | null = null;
  let bestScore = -Infinity;

  for (let leftIndex = 0; leftIndex < tall.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < tall.length; rightIndex += 1) {
      const a = tall[leftIndex];
      const b = tall[rightIndex];
      const separation = distance2D(a, b);
      const clearance = separation - (a.radius + b.radius);
      if (clearance < 8 || separation < 16 || separation > sceneRadius * 0.62) continue;

      const midpointX = (a.x + b.x) * 0.5;
      const midpointZ = (a.z + b.z) * 0.5;
      const corridorCenterDistance = Math.hypot(midpointX - center.x, midpointZ - center.z);
      if (corridorCenterDistance > sceneRadius * 0.72) continue;

      const pairDir = normalizeDirection2(b.x - a.x, b.z - a.z, 0, 1);
      let axis = normalizeDirection2(preferredAxis.x * 0.7 + (midpointX - center.x) * 0.035, preferredAxis.z * 0.7 + (midpointZ - center.z) * 0.035, pairDir.z, -pairDir.x);
      const alignment = axis.x * preferredAxis.x + axis.z * preferredAxis.z;
      if (alignment < 0) {
        axis = { x: -axis.x, z: -axis.z };
      }

      let nearbyTallCount = 0;
      for (const obstacle of tall) {
        if (Math.hypot(obstacle.x - midpointX, obstacle.z - midpointZ) <= Math.max(16, sceneRadius * 0.28)) {
          nearbyTallCount += 1;
        }
      }

      const score =
        nearbyTallCount * 1.2 +
        Math.min(a.height, b.height) * 0.028 +
        Math.max(0, 18 - Math.abs(clearance - 14)) * 0.09 -
        corridorCenterDistance * 0.04 +
        alignment * 1.6;

      if (score > bestScore) {
        bestScore = score;
        bestPair = { a, b, midpointX, midpointZ, axis };
      }
    }
  }

  const fallbackAxis = normalizeDirection2(primary.x - center.x, primary.z - center.z, preferredAxis.x, preferredAxis.z);
  const corridorAxis = bestPair?.axis ?? fallbackAxis;
  const midpointX = bestPair?.midpointX ?? MathUtils.lerp(center.x, primary.x, 0.22);
  const midpointZ = bestPair?.midpointZ ?? MathUtils.lerp(center.z, primary.z, 0.22);
  const travelLength = MathUtils.clamp(sceneRadius * 0.24, 18, 34);
  const baseY = bestPair
    ? MathUtils.clamp(Math.min(bestPair.a.height, bestPair.b.height) * 0.48 + 9, 10, maxY * 0.86)
    : MathUtils.clamp(maxY * 0.42 + 8, 10, maxY * 0.78);

  const startPosition = point(
    midpointX - corridorAxis.x * travelLength,
    computeObstacleSafeY(midpointX - corridorAxis.x * travelLength, midpointZ - corridorAxis.z * travelLength, baseY, obstacles),
    midpointZ - corridorAxis.z * travelLength
  );
  const endPosition = point(
    midpointX + corridorAxis.x * travelLength,
    computeObstacleSafeY(midpointX + corridorAxis.x * travelLength, midpointZ + corridorAxis.z * travelLength, baseY + 2.4, obstacles),
    midpointZ + corridorAxis.z * travelLength
  );

  let forwardStart = startPosition;
  let forwardEnd = endPosition;
  if (distance2D(startPosition, fromPoint) + distance2D(endPosition, primary) > distance2D(endPosition, fromPoint) + distance2D(startPosition, primary)) {
    forwardStart = endPosition;
    forwardEnd = startPosition;
  }

  return {
    startPosition: forwardStart,
    startTarget: point(midpointX + corridorAxis.x * 10, Math.max(4.4, baseY - 5), midpointZ + corridorAxis.z * 10),
    endPosition: forwardEnd,
    endTarget: point(midpointX + corridorAxis.x * 18, Math.max(4.4, baseY - 2.5), midpointZ + corridorAxis.z * 18)
  };
}

function buildClimaxShots(
  primary: CinematicFlyoverTarget,
  entryPoint: Point3,
  center: SceneCenter,
  sceneRadius: number,
  safeMaxY: number,
  obstacles: readonly CinematicFlyoverObstacle[],
  turnSign: number
) {
  const baseAngle = angleOf(entryPoint.x - primary.x, entryPoint.z - primary.z);
  const heroRadius = Math.max(3.2, primary.radius ?? Math.max(3.2, 2.8 + primary.height * 0.06));
  const orbitRadius = MathUtils.clamp(heroRadius + primary.height * 0.24, 14, Math.max(18, sceneRadius * 0.24));
  const focusY = MathUtils.clamp(primary.height * 0.88, 8, primary.height + 18);
  const halfOrbit = Math.PI * 0.74 * turnSign;

  const pointAt = (angle: number, radiusScale: number, heightScale: number, extraLift: number) => {
    const radius = orbitRadius * radiusScale;
    const x = primary.x + Math.sin(angle) * radius;
    const z = primary.z + Math.cos(angle) * radius;
    const yBase = MathUtils.clamp(primary.height * heightScale + extraLift, 12, safeMaxY + 34);
    return liftShotPosition(primary.x, primary.z, focusY, x, z, yBase, heroRadius + 11, obstacles, safeMaxY);
  };

  const shotA = pointAt(baseAngle, 1.08, 0.76, 12);
  const shotB = pointAt(baseAngle + halfOrbit * 0.48, 0.96, 0.94, 18);
  const shotC = pointAt(baseAngle + halfOrbit, 1.28, 1.06, 24);
  const targetA = point(primary.x, focusY, primary.z);
  const targetB = point(primary.x, Math.min(primary.height + 20, focusY + 5), primary.z);
  const targetC = point(
    MathUtils.lerp(primary.x, center.x, 0.12),
    Math.max(5.2, Math.min(primary.height + 20, focusY + 6)),
    MathUtils.lerp(primary.z, center.z, 0.12)
  );

  return { shotA, targetA, shotB, targetB, shotC, targetC };
}

function pushKeyframe(
  keyframes: FlyoverKeyframe[],
  deltaSeconds: number,
  position: Point3,
  target: Point3,
  ease: FlyoverEase
) {
  const lastTime = keyframes.length > 0 ? keyframes[keyframes.length - 1].time : 0;
  keyframes.push({
    time: lastTime + Math.max(0.001, deltaSeconds),
    position,
    target,
    ease
  });
}

function buildReturnShot(
  center: SceneCenter,
  sceneRadius: number,
  maxY: number,
  fromPoint: Point3
) {
  const outward = normalizeDirection2(fromPoint.x - center.x, fromPoint.z - center.z, 0, 1);
  const autoDistance = MathUtils.clamp(18 + sceneRadius * 1.5 + maxY * 0.42, 24, 170);
  const autoElevation = MathUtils.clamp(8 + maxY * 0.92 + sceneRadius * 0.2, 10, 72);
  const autoLookY = MathUtils.clamp(1.5 + maxY * 0.42, 2, 30);
  return {
    position: point(center.x + outward.x * autoDistance, autoElevation, center.z + outward.z * autoDistance),
    target: point(center.x, autoLookY, center.z)
  };
}

export function buildCinematicFlyoverPlan({
  targets,
  obstacles = [],
  startPosition,
  startTarget,
  boundsRadius,
  maxY,
  reducedMotion = false,
  sceneKind = 'crypto'
}: {
  targets: readonly CinematicFlyoverTarget[];
  obstacles?: readonly CinematicFlyoverObstacle[];
  startPosition: Vector3;
  startTarget: Vector3;
  boundsRadius: number;
  maxY: number;
  reducedMotion?: boolean;
  sceneKind?: CinematicFlyoverSceneKind;
}): CinematicFlyoverPlan | null {
  if (targets.length === 0) return null;

  const safeMaxY = Math.max(8, maxY);
  const normalizedObstacles = obstacles
    .filter((obstacle) => Number.isFinite(obstacle.x) && Number.isFinite(obstacle.z) && Number.isFinite(obstacle.height))
    .map(normalizeObstacle);
  const sceneItems = normalizedObstacles.length > 0 ? normalizedObstacles : targets.map((target) => normalizeObstacle({
    x: target.x,
    z: target.z,
    height: target.height,
    radius: Math.max(3.2, target.radius ?? 2.8 + target.height * 0.06)
  }));
  const center = computeSceneCenter(sceneItems);
  const sceneRadius = Math.max(18, boundsRadius, computeSceneRadius(center, sceneItems));
  const primary = targets[0];
  const secondaries = targets.slice(1);
  const { outward, turnSign } = buildRevealDirection(center, primary, secondaries);
  const side = { x: outward.z * turnSign, z: -outward.x * turnSign };

  const wideDistance = MathUtils.clamp(sceneRadius * (sceneKind === 'market' ? 1.42 : 1.28), 26, sceneRadius * 1.62);
  const widePosition = point(
    center.x + outward.x * wideDistance + side.x * sceneRadius * 0.16,
    MathUtils.clamp(safeMaxY + sceneRadius * 0.16 + 22, 18, safeMaxY + 54),
    center.z + outward.z * wideDistance + side.z * sceneRadius * 0.16
  );
  widePosition.y = computeObstacleSafeY(widePosition.x, widePosition.z, widePosition.y, normalizedObstacles);

  const revealApproach = point(
    center.x + outward.x * (sceneRadius * 0.98) + side.x * sceneRadius * 0.12,
    MathUtils.clamp(safeMaxY * 0.74 + 12, 14, safeMaxY + 24),
    center.z + outward.z * (sceneRadius * 0.98) + side.z * sceneRadius * 0.12
  );
  revealApproach.y = computeObstacleSafeY(revealApproach.x, revealApproach.z, revealApproach.y, normalizedObstacles);

  const revealTarget = point(
    MathUtils.lerp(center.x, primary.x, sceneKind === 'market' ? 0.16 : 0.24),
    MathUtils.clamp(Math.max(safeMaxY * 0.38, primary.height * 0.4), 4.2, primary.height + 12),
    MathUtils.lerp(center.z, primary.z, sceneKind === 'market' ? 0.16 : 0.24)
  );

  const keyframes: FlyoverKeyframe[] = [
    {
      time: 0,
      position: point(startPosition.x, startPosition.y, startPosition.z),
      target: point(startTarget.x, Math.max(4.2, startTarget.y), startTarget.z),
      ease: 'glide'
    }
  ];
  const durationScale = 2;
  const flyoverSeconds = (reducedSeconds: number, normalSeconds: number) =>
    (reducedMotion ? reducedSeconds : normalSeconds) * durationScale;

  pushKeyframe(keyframes, flyoverSeconds(1.05, 1.2), widePosition, revealTarget, 'slow');
  pushKeyframe(keyframes, flyoverSeconds(2.55, 3.1), revealApproach, revealTarget, 'slow');

  const ringCandidates = buildOuterRingCandidates(normalizedObstacles, center, sceneRadius, safeMaxY);
  const baseRevealAngle = angleOf(outward.x, outward.z);
  const ringAnchorA = pickRingAnchor(ringCandidates, center, sceneRadius, baseRevealAngle + turnSign * 0.4);
  const ringAnchorB = pickRingAnchor(ringCandidates, center, sceneRadius, baseRevealAngle + turnSign * 0.92);
  const ringShotA = buildRingShot(ringAnchorA, center, sceneRadius, safeMaxY, normalizedObstacles, turnSign);
  const ringShotB = buildRingShot(ringAnchorB, center, sceneRadius, safeMaxY, normalizedObstacles, turnSign);
  pushKeyframe(keyframes, flyoverSeconds(1.3, 1.5), ringShotA.position, ringShotA.target, 'glide');
  pushKeyframe(keyframes, flyoverSeconds(1.45, 1.7), ringShotB.position, ringShotB.target, 'glide');

  const routeTargets = orderTargetsForRoute(
    secondaries.map((target, index) => ({
      ...target,
      importanceScore: target.height + (secondaries.length - index) * 2,
      radialScore: clamp01(Math.hypot(target.x - center.x, target.z - center.z) / sceneRadius),
      angleFromCenter: angleOf(target.x - center.x, target.z - center.z)
    })),
    ringShotB.position
  );

  let previousPoint = ringShotB.position;
  for (let index = 0; index < routeTargets.length; index += 1) {
    const hero = routeTargets[index];
    const nextAnchor = index < routeTargets.length - 1 ? routeTargets[index + 1] : primary;
    const closeEmphasis = routeTargets.length <= 2 || index === 0 || hero.height >= primary.height * 0.72;
    const sign = turnSign * (index % 2 === 0 ? 1 : -1);
    const shots = buildHeroPassShots(hero, previousPoint, nextAnchor, center, sceneRadius, safeMaxY, normalizedObstacles, sign, closeEmphasis);
    pushKeyframe(keyframes, flyoverSeconds(1.15, 1.35), shots.shotA, shots.targetA, 'glide');
    pushKeyframe(keyframes, flyoverSeconds(0.78, 0.92), shots.shotB, shots.targetB, closeEmphasis ? 'surge' : 'glide');
    previousPoint = shots.shotB;
  }

  if (routeTargets.length === 0) {
    const primaryPreview = buildHeroPassShots(primary, ringShotB.position, primary, center, sceneRadius, safeMaxY, normalizedObstacles, turnSign, true);
    pushKeyframe(keyframes, flyoverSeconds(1.18, 1.4), primaryPreview.shotA, primaryPreview.targetA, 'glide');
    previousPoint = primaryPreview.shotA;
  }

  const canyon = buildCanyonShot(normalizedObstacles, center, sceneRadius, safeMaxY, previousPoint, primary);
  pushKeyframe(keyframes, flyoverSeconds(1.02, 1.2), canyon.startPosition, canyon.startTarget, 'surge');
  pushKeyframe(keyframes, flyoverSeconds(1.02, 1.15), canyon.endPosition, canyon.endTarget, 'surge');

  const climax = buildClimaxShots(primary, canyon.endPosition, center, sceneRadius, safeMaxY, normalizedObstacles, turnSign);
  pushKeyframe(keyframes, flyoverSeconds(1.0, 1.18), climax.shotA, climax.targetA, 'glide');
  pushKeyframe(keyframes, flyoverSeconds(1.02, 1.2), climax.shotB, climax.targetB, 'calm');
  pushKeyframe(keyframes, flyoverSeconds(1.18, 1.4), climax.shotC, climax.targetC, 'calm');

  const returnShot = buildReturnShot(center, sceneRadius, safeMaxY, climax.shotC);
  pushKeyframe(keyframes, flyoverSeconds(1.48, 1.8), returnShot.position, returnShot.target, 'slow');

  return {
    keyframes,
    totalDuration: keyframes[keyframes.length - 1]?.time ?? 0,
    obstacles: normalizedObstacles
  };
}

function sampleKeyframedTrack(plan: CinematicFlyoverPlan, elapsedSeconds: number, field: 'position' | 'target', out: Vector3) {
  const keyframes = plan.keyframes;
  if (keyframes.length === 0) {
    out.set(0, 0, 0);
    return;
  }

  if (keyframes.length === 1 || elapsedSeconds <= keyframes[0].time) {
    setVector(out, keyframes[0][field]);
    return;
  }

  const lastIndex = keyframes.length - 1;
  if (elapsedSeconds >= keyframes[lastIndex].time) {
    setVector(out, keyframes[lastIndex][field]);
    return;
  }

  let segmentIndex = 0;
  while (segmentIndex < lastIndex - 1 && elapsedSeconds > keyframes[segmentIndex + 1].time) {
    segmentIndex += 1;
  }

  const current = keyframes[segmentIndex];
  const next = keyframes[segmentIndex + 1];
  const p0 = keyframes[Math.max(0, segmentIndex - 1)][field];
  const p1 = current[field];
  const p2 = next[field];
  const p3 = keyframes[Math.min(lastIndex, segmentIndex + 2)][field];
  const duration = Math.max(0.0001, next.time - current.time);
  const rawT = (elapsedSeconds - current.time) / duration;
  const easedT = easeSegment(next.ease, rawT);

  out.set(
    catmullRomScalar(p0.x, p1.x, p2.x, p3.x, easedT),
    catmullRomScalar(p0.y, p1.y, p2.y, p3.y, easedT),
    catmullRomScalar(p0.z, p1.z, p2.z, p3.z, easedT)
  );
}

export function sampleCinematicFlyoverPlan(
  plan: CinematicFlyoverPlan,
  elapsedSeconds: number,
  outPosition: Vector3,
  outTarget: Vector3
) {
  const safeElapsed = MathUtils.clamp(elapsedSeconds, 0, plan.totalDuration);
  sampleKeyframedTrack(plan, safeElapsed, 'position', outPosition);
  sampleKeyframedTrack(plan, safeElapsed, 'target', outTarget);

  outPosition.y = computeObstacleSafeY(outPosition.x, outPosition.z, outPosition.y, plan.obstacles);
  outTarget.y = Math.max(4.2, outTarget.y);
  enforceDownwardPitchLimit(outPosition, outTarget);

  directionScratch.copy(outTarget).sub(outPosition);
  if (directionScratch.lengthSq() < 1e-4) {
    targetScratch.copy(outPosition);
    targetScratch.z -= 1;
    outTarget.copy(targetScratch);
  }

  return {
    complete: safeElapsed >= plan.totalDuration
  };
}
