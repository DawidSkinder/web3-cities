import { MathUtils, Vector3 } from 'three';

const TAU = Math.PI * 2;
const LOOK_AHEAD_SECONDS = 0.38;

export type CinematicFlyoverTarget = {
  sequence: number;
  x: number;
  z: number;
  height: number;
};

type OrbitAnchor = {
  centerX: number;
  centerZ: number;
  radius: number;
  elevation: number;
  lookY: number;
  focusHeight: number;
};

type CinematicFlyoverSegmentKind = 'entry' | 'orbit' | 'transfer';

type CinematicFlyoverSegment = {
  kind: CinematicFlyoverSegmentKind;
  startTime: number;
  duration: number;
  startAngle: number;
  turns: number;
  holdCenterUntil: number;
  focusBlendFrom: number;
  focusBlendTo: number;
  lookAheadFrom: number;
  lookAheadTo: number;
  from: OrbitAnchor;
  to: OrbitAnchor;
};

type PoseSample = {
  complete: boolean;
  focusBlend: number;
  lookAheadDistance: number;
};

export type CinematicFlyoverPlan = {
  segments: CinematicFlyoverSegment[];
  totalDuration: number;
};

const currentPositionScratch = new Vector3();
const currentFocusScratch = new Vector3();
const futurePositionScratch = new Vector3();
const futureFocusScratch = new Vector3();
const forwardScratch = new Vector3();
const forwardLookScratch = new Vector3();

function smoothstep01(value: number) {
  const t = MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function clampOrbitRadius(radius: number, boundsRadius: number) {
  return MathUtils.clamp(radius, 10, Math.max(30, boundsRadius * 2.9 + 20));
}

function buildTowerOrbitAnchors(target: CinematicFlyoverTarget, boundsRadius: number, maxY: number) {
  const baseRadius = MathUtils.clamp(8.6 + target.height * 0.19 + boundsRadius * 0.016, 10.5, 28);
  const baseElevation = MathUtils.clamp(target.height + Math.max(8.5, target.height * 0.34), 14, maxY + 78);
  const lookY = MathUtils.clamp(target.height * 0.64, 2.8, target.height + 24);

  return {
    entry: {
      centerX: target.x,
      centerZ: target.z,
      radius: baseRadius * 1.16,
      elevation: baseElevation + Math.max(1.8, target.height * 0.04),
      lookY,
      focusHeight: target.height
    },
    exit: {
      centerX: target.x,
      centerZ: target.z,
      radius: baseRadius * 0.92,
      elevation: Math.max(target.height + 6, baseElevation - Math.max(1.4, target.height * 0.03)),
      lookY: Math.min(baseElevation, lookY + Math.max(0.8, target.height * 0.06)),
      focusHeight: target.height
    }
  };
}

function sampleSegmentAtProgress(
  segment: CinematicFlyoverSegment,
  progress: number,
  outPosition: Vector3,
  outFocus: Vector3
): PoseSample {
  const clampedProgress = MathUtils.clamp(progress, 0, 1);
  const blendT = smoothstep01(clampedProgress);
  const moveT =
    clampedProgress <= segment.holdCenterUntil
      ? 0
      : smoothstep01((clampedProgress - segment.holdCenterUntil) / Math.max(0.0001, 1 - segment.holdCenterUntil));
  const angle = segment.startAngle + segment.turns * TAU * clampedProgress;
  const centerX = MathUtils.lerp(segment.from.centerX, segment.to.centerX, moveT);
  const centerZ = MathUtils.lerp(segment.from.centerZ, segment.to.centerZ, moveT);
  const radius = MathUtils.lerp(segment.from.radius, segment.to.radius, blendT);
  const elevation = MathUtils.lerp(segment.from.elevation, segment.to.elevation, blendT);
  const lookY = MathUtils.lerp(segment.from.lookY, segment.to.lookY, blendT);

  outPosition.set(centerX + Math.sin(angle) * radius, elevation, centerZ + Math.cos(angle) * radius);
  outFocus.set(centerX, lookY, centerZ);

  return {
    complete: clampedProgress >= 1,
    focusBlend: MathUtils.lerp(segment.focusBlendFrom, segment.focusBlendTo, blendT),
    lookAheadDistance: MathUtils.lerp(segment.lookAheadFrom, segment.lookAheadTo, blendT)
  };
}

function samplePlanState(plan: CinematicFlyoverPlan, elapsedSeconds: number, outPosition: Vector3, outFocus: Vector3): PoseSample {
  const safeElapsed = MathUtils.clamp(elapsedSeconds, 0, plan.totalDuration);
  let segment = plan.segments[plan.segments.length - 1];

  for (let index = 0; index < plan.segments.length; index += 1) {
    const candidate = plan.segments[index];
    if (safeElapsed <= candidate.startTime + candidate.duration + 1e-6) {
      segment = candidate;
      break;
    }
  }

  const localElapsed = safeElapsed - segment.startTime;
  const progress = segment.duration <= 0 ? 1 : localElapsed / segment.duration;
  return sampleSegmentAtProgress(segment, progress, outPosition, outFocus);
}

export function pickCinematicFlyoverTargets<T extends CinematicFlyoverTarget>(
  towers: readonly T[],
  limit = 10
): CinematicFlyoverTarget[] {
  return [...towers]
    .sort((left, right) => right.height - left.height || right.sequence - left.sequence)
    .slice(0, limit)
    .map(({ sequence, x, z, height }) => ({ sequence, x, z, height }));
}

export function buildCinematicFlyoverPlan({
  targets,
  startPosition,
  startTarget,
  boundsRadius,
  maxY,
  reducedMotion = false
}: {
  targets: readonly CinematicFlyoverTarget[];
  startPosition: Vector3;
  startTarget: Vector3;
  boundsRadius: number;
  maxY: number;
  reducedMotion?: boolean;
}): CinematicFlyoverPlan | null {
  if (targets.length === 0) return null;

  const safeBoundsRadius = Math.max(18, boundsRadius);
  const safeMaxY = Math.max(8, maxY);
  const currentAnchor: OrbitAnchor = {
    centerX: startTarget.x,
    centerZ: startTarget.z,
    radius: clampOrbitRadius(Math.hypot(startPosition.x - startTarget.x, startPosition.z - startTarget.z), safeBoundsRadius),
    elevation: MathUtils.clamp(startPosition.y, 8, safeMaxY + 96),
    lookY: MathUtils.clamp(startTarget.y, 1.2, safeMaxY + 32),
    focusHeight: Math.max(4, startTarget.y * 1.35)
  };
  const towerAnchors = targets.map((target) => buildTowerOrbitAnchors(target, safeBoundsRadius, safeMaxY));
  const segments: CinematicFlyoverSegment[] = [];

  let elapsedCursor = 0;
  let angleCursor = Math.atan2(startPosition.x - currentAnchor.centerX, startPosition.z - currentAnchor.centerZ);

  const pushSegment = (
    kind: CinematicFlyoverSegmentKind,
    from: OrbitAnchor,
    to: OrbitAnchor,
    turns: number,
    duration: number,
    holdCenterUntil: number,
    focusBlendFrom: number,
    focusBlendTo: number,
    lookAheadFrom: number,
    lookAheadTo: number
  ) => {
    segments.push({
      kind,
      startTime: elapsedCursor,
      duration,
      startAngle: angleCursor,
      turns,
      holdCenterUntil,
      focusBlendFrom,
      focusBlendTo,
      lookAheadFrom,
      lookAheadTo,
      from,
      to
    });
    elapsedCursor += duration;
    angleCursor += turns * TAU;
  };

  pushSegment(
    'entry',
    currentAnchor,
    towerAnchors[0].entry,
    reducedMotion ? 0.72 : 0.92,
    reducedMotion ? 1.65 : 2.15,
    0.12,
    0.58,
    0.48,
    16,
    13
  );

  for (let index = 0; index < towerAnchors.length; index += 1) {
    const current = towerAnchors[index];
    pushSegment(
      'orbit',
      current.entry,
      current.exit,
      reducedMotion ? 0.94 : 1.08,
      reducedMotion ? 1.35 : 1.8,
      0,
      0.42,
      0.36,
      12,
      10.5
    );

    const next = towerAnchors[index + 1];
    if (!next) continue;

    const distance = Math.hypot(next.entry.centerX - current.exit.centerX, next.entry.centerZ - current.exit.centerZ);
    const turnScale = reducedMotion ? 0.36 : 0.46;
    const durationBase = reducedMotion ? 1.05 : 1.35;
    pushSegment(
      'transfer',
      current.exit,
      next.entry,
      MathUtils.clamp(0.62 + (distance / Math.max(28, safeBoundsRadius * 1.3 + 18)) * turnScale, reducedMotion ? 0.58 : 0.72, reducedMotion ? 0.92 : 1.18),
      MathUtils.clamp(durationBase + distance * 0.022, reducedMotion ? 1.05 : 1.25, reducedMotion ? 2.05 : 2.75),
      distance < 20 ? 0.42 : 0.18,
      0.52,
      0.46,
      13.5,
      14.5
    );
  }

  return {
    segments,
    totalDuration: elapsedCursor
  };
}

export function sampleCinematicFlyoverPlan(
  plan: CinematicFlyoverPlan,
  elapsedSeconds: number,
  outPosition: Vector3,
  outTarget: Vector3
) {
  const currentSample = samplePlanState(plan, elapsedSeconds, currentPositionScratch, currentFocusScratch);
  samplePlanState(plan, Math.min(plan.totalDuration, elapsedSeconds + LOOK_AHEAD_SECONDS), futurePositionScratch, futureFocusScratch);

  forwardScratch.copy(futurePositionScratch).sub(currentPositionScratch);
  if (forwardScratch.lengthSq() < 0.0001) {
    forwardScratch.copy(currentFocusScratch).sub(currentPositionScratch);
  }
  if (forwardScratch.lengthSq() < 0.0001) {
    forwardScratch.set(0, -0.1, -1);
  }
  forwardScratch.normalize();

  forwardLookScratch.copy(currentPositionScratch).addScaledVector(forwardScratch, currentSample.lookAheadDistance);
  forwardLookScratch.y = Math.max(currentFocusScratch.y - 3.5, forwardLookScratch.y + 0.6);

  outPosition.copy(currentPositionScratch);
  outTarget.copy(currentFocusScratch).lerp(forwardLookScratch, currentSample.focusBlend);

  return {
    complete: elapsedSeconds >= plan.totalDuration
  };
}
