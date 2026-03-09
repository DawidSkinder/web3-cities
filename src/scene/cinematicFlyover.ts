import { MathUtils, Vector3 } from 'three';

const TAU = Math.PI * 2;
const LOOK_AHEAD_SECONDS = 0.48;

export type CinematicFlyoverTarget = {
  sequence: number;
  x: number;
  z: number;
  height: number;
};

type Point3 = {
  x: number;
  y: number;
  z: number;
};

type FlyoverWaypoint = {
  x: number;
  z: number;
  elevation: number;
  lookY: number;
  height: number;
};

type LinearSegment = {
  kind: 'entry';
  startTime: number;
  duration: number;
  startPosition: Point3;
  endPosition: Point3;
  startFocus: Point3;
  endFocus: Point3;
  focusBlendFrom: number;
  focusBlendTo: number;
  lookAheadFrom: number;
  lookAheadTo: number;
};

type SpiralSegment = {
  kind: 'transfer';
  startTime: number;
  duration: number;
  startPosition: Point3;
  endPosition: Point3;
  startFocus: Point3;
  endFocus: Point3;
  maxRadius: number;
  turnCount: number;
  startAngle: number;
  verticalLift: number;
  focusBlendFrom: number;
  focusBlendTo: number;
  lookAheadFrom: number;
  lookAheadTo: number;
};

type CinematicFlyoverSegment = LinearSegment | SpiralSegment;

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
const pointScratch = new Vector3();

function point(x: number, y: number, z: number): Point3 {
  return { x, y, z };
}

function smoothstep01(value: number) {
  const t = MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function setPoint(out: Vector3, input: Point3) {
  out.set(input.x, input.y, input.z);
}

function sampleLinearSegment(segment: LinearSegment, progress: number, outPosition: Vector3, outFocus: Vector3): PoseSample {
  const t = smoothstep01(progress);
  outPosition.set(
    MathUtils.lerp(segment.startPosition.x, segment.endPosition.x, t),
    MathUtils.lerp(segment.startPosition.y, segment.endPosition.y, t),
    MathUtils.lerp(segment.startPosition.z, segment.endPosition.z, t)
  );
  outFocus.set(
    MathUtils.lerp(segment.startFocus.x, segment.endFocus.x, t),
    MathUtils.lerp(segment.startFocus.y, segment.endFocus.y, t),
    MathUtils.lerp(segment.startFocus.z, segment.endFocus.z, t)
  );

  return {
    complete: progress >= 1,
    focusBlend: MathUtils.lerp(segment.focusBlendFrom, segment.focusBlendTo, t),
    lookAheadDistance: MathUtils.lerp(segment.lookAheadFrom, segment.lookAheadTo, t)
  };
}

function sampleSpiralSegment(segment: SpiralSegment, progress: number, outPosition: Vector3, outFocus: Vector3): PoseSample {
  const t = smoothstep01(progress);
  const spiralWeight = Math.pow(Math.sin(Math.PI * t), 0.92);
  const angle = segment.startAngle + segment.turnCount * TAU * t;
  const radius = segment.maxRadius * spiralWeight;

  outPosition.set(
    MathUtils.lerp(segment.startPosition.x, segment.endPosition.x, t) + Math.sin(angle) * radius,
    MathUtils.lerp(segment.startPosition.y, segment.endPosition.y, t) + Math.pow(spiralWeight, 1.12) * segment.verticalLift,
    MathUtils.lerp(segment.startPosition.z, segment.endPosition.z, t) + Math.cos(angle) * radius
  );
  outFocus.set(
    MathUtils.lerp(segment.startFocus.x, segment.endFocus.x, t),
    MathUtils.lerp(segment.startFocus.y, segment.endFocus.y, t),
    MathUtils.lerp(segment.startFocus.z, segment.endFocus.z, t)
  );

  return {
    complete: progress >= 1,
    focusBlend: MathUtils.lerp(segment.focusBlendFrom, segment.focusBlendTo, t),
    lookAheadDistance: MathUtils.lerp(segment.lookAheadFrom, segment.lookAheadTo, t)
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
  if (segment.kind === 'entry') {
    return sampleLinearSegment(segment, progress, outPosition, outFocus);
  }
  return sampleSpiralSegment(segment, progress, outPosition, outFocus);
}

function buildWaypoint(target: CinematicFlyoverTarget, maxY: number) {
  return {
    x: target.x,
    z: target.z,
    elevation: MathUtils.clamp(target.height + Math.max(8, target.height * 0.26), 14, maxY + 78),
    lookY: MathUtils.clamp(target.height * 0.66, 2.6, target.height + 22),
    height: target.height
  };
}

function resolveTurnSign(
  currentDirectionX: number,
  currentDirectionZ: number,
  nextDirectionX: number,
  nextDirectionZ: number,
  fallbackSign: number
) {
  const currentLength = Math.hypot(currentDirectionX, currentDirectionZ);
  const nextLength = Math.hypot(nextDirectionX, nextDirectionZ);
  if (currentLength < 0.001 || nextLength < 0.001) return fallbackSign;

  const currentX = currentDirectionX / currentLength;
  const currentZ = currentDirectionZ / currentLength;
  const nextX = nextDirectionX / nextLength;
  const nextZ = nextDirectionZ / nextLength;
  const cross = currentX * nextZ - currentZ * nextX;

  if (Math.abs(cross) < 0.08) return fallbackSign;
  return cross >= 0 ? 1 : -1;
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
  const waypoints = targets.map((target) => buildWaypoint(target, safeMaxY));
  const segments: CinematicFlyoverSegment[] = [];
  let elapsedCursor = 0;

  const firstWaypoint = waypoints[0];
  const firstPosition = point(firstWaypoint.x, firstWaypoint.elevation, firstWaypoint.z);
  const straightDistance = startPosition.distanceTo(pointScratch.set(firstPosition.x, firstPosition.y, firstPosition.z));
  const entryDuration = MathUtils.clamp(
    (reducedMotion ? 3.2 : 4.4) + straightDistance * (reducedMotion ? 0.02 : 0.03),
    reducedMotion ? 3.2 : 4.6,
    reducedMotion ? 5.6 : 8.4
  );

  segments.push({
    kind: 'entry',
    startTime: elapsedCursor,
    duration: entryDuration,
    startPosition: point(startPosition.x, startPosition.y, startPosition.z),
    endPosition: firstPosition,
    startFocus: point(startTarget.x, startTarget.y, startTarget.z),
    endFocus: point(firstWaypoint.x, firstWaypoint.lookY, firstWaypoint.z),
    focusBlendFrom: 0.18,
    focusBlendTo: 0.22,
    lookAheadFrom: 14,
    lookAheadTo: 12
  });
  elapsedCursor += entryDuration;

  let currentDirectionX = firstWaypoint.x - startPosition.x;
  let currentDirectionZ = firstWaypoint.z - startPosition.z;
  let lastTurnSign = 1;

  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const current = waypoints[index];
    const next = waypoints[index + 1];
    const nextDirectionX = next.x - current.x;
    const nextDirectionZ = next.z - current.z;
    const distance = Math.hypot(nextDirectionX, nextDirectionZ);
    const currentLength = Math.max(0.001, Math.hypot(currentDirectionX, currentDirectionZ));
    const nextLength = Math.max(0.001, distance);
    const headingDot = (currentDirectionX / currentLength) * (nextDirectionX / nextLength) + (currentDirectionZ / currentLength) * (nextDirectionZ / nextLength);
    const turnSign = resolveTurnSign(currentDirectionX, currentDirectionZ, nextDirectionX, nextDirectionZ, lastTurnSign);
    const needsFullTurn = distance < Math.max(18, safeBoundsRadius * 0.24) || headingDot < 0.05;
    const turnMagnitude = needsFullTurn
      ? reducedMotion
        ? 0.88
        : 1
      : distance < Math.max(34, safeBoundsRadius * 0.44)
        ? reducedMotion
          ? 0.72
          : 0.84
        : reducedMotion
          ? 0.58
          : 0.68;
    const maxRadius = MathUtils.clamp(
      distance * 0.14 + Math.max(current.height, next.height) * 0.05,
      5.2,
      Math.max(11.5, safeBoundsRadius * 0.18)
    );
    const duration = MathUtils.clamp(
      (reducedMotion ? 2.8 : 3.9) + distance * (reducedMotion ? 0.03 : 0.045) + turnMagnitude * (reducedMotion ? 0.5 : 0.85),
      reducedMotion ? 3.1 : 4.2,
      reducedMotion ? 5.3 : 7.8
    );
    const startAngle = Math.atan2(currentDirectionX, currentDirectionZ) + turnSign * Math.PI * 0.55;
    const verticalLift = MathUtils.clamp(1.6 + maxRadius * 0.26 + Math.abs(next.height - current.height) * 0.04, 2, 6.8);

    segments.push({
      kind: 'transfer',
      startTime: elapsedCursor,
      duration,
      startPosition: point(current.x, current.elevation, current.z),
      endPosition: point(next.x, next.elevation, next.z),
      startFocus: point(current.x, current.lookY, current.z),
      endFocus: point(next.x, next.lookY, next.z),
      maxRadius,
      turnCount: turnSign * turnMagnitude,
      startAngle,
      verticalLift,
      focusBlendFrom: 0.28,
      focusBlendTo: 0.34,
      lookAheadFrom: 12.5,
      lookAheadTo: 14
    });
    elapsedCursor += duration;
    currentDirectionX = nextDirectionX;
    currentDirectionZ = nextDirectionZ;
    lastTurnSign = turnSign;
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
