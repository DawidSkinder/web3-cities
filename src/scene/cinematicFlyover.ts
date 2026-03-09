import { MathUtils, Vector3 } from 'three';

const LOOK_AHEAD_SECONDS = 0.28;
const CAMERA_CLEARANCE_PAD = 4.4;
const CAMERA_CLEARANCE_Y = 8.4;
const CAMERA_COLLISION_PAD = 1.6;
const DESIRED_VIEW_PITCH_DEG = 32;
const MAX_DOWNWARD_PITCH_DEG = 38;

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

type Point3 = {
  x: number;
  y: number;
  z: number;
};

type Direction2 = {
  x: number;
  z: number;
};

type FlyoverWaypoint = {
  sequence: number;
  focusX: number;
  focusZ: number;
  x: number;
  z: number;
  elevation: number;
  lookY: number;
  height: number;
  radius: number;
  viewDirectionX: number;
  viewDirectionZ: number;
};

type EntrySegment = {
  kind: 'entry';
  startTime: number;
  duration: number;
  startPosition: Point3;
  controlPositionA: Point3;
  controlPositionB: Point3;
  endPosition: Point3;
  startFocus: Point3;
  endFocus: Point3;
  focusBlendFrom: number;
  focusBlendTo: number;
  lookAheadFrom: number;
  lookAheadTo: number;
};

type TransferSegment = {
  kind: 'transfer';
  startTime: number;
  duration: number;
  startPosition: Point3;
  controlPositionA: Point3;
  controlPositionB: Point3;
  endPosition: Point3;
  startFocus: Point3;
  endFocus: Point3;
  focusBlendFrom: number;
  focusBlendTo: number;
  lookAheadFrom: number;
  lookAheadTo: number;
};

type CinematicFlyoverSegment = EntrySegment | TransferSegment;

type PoseSample = {
  complete: boolean;
  focusBlend: number;
  lookAheadDistance: number;
};

export type CinematicFlyoverPlan = {
  segments: CinematicFlyoverSegment[];
  totalDuration: number;
  obstacles: CinematicFlyoverObstacle[];
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

function easeOutCubic01(value: number) {
  const t = MathUtils.clamp(value, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function setPoint(out: Vector3, input: Point3) {
  out.set(input.x, input.y, input.z);
}

function cubicBezierCoordinate(a: number, b: number, c: number, d: number, t: number) {
  const omt = 1 - t;
  return omt * omt * omt * a + 3 * omt * omt * t * b + 3 * omt * t * t * c + t * t * t * d;
}

function sampleSegmentPosition(segment: CinematicFlyoverSegment, t: number, outPosition: Vector3) {
  outPosition.set(
    cubicBezierCoordinate(segment.startPosition.x, segment.controlPositionA.x, segment.controlPositionB.x, segment.endPosition.x, t),
    cubicBezierCoordinate(segment.startPosition.y, segment.controlPositionA.y, segment.controlPositionB.y, segment.endPosition.y, t),
    cubicBezierCoordinate(segment.startPosition.z, segment.controlPositionA.z, segment.controlPositionB.z, segment.endPosition.z, t)
  );
}

function sampleSegmentFocus(segment: CinematicFlyoverSegment, t: number, outFocus: Vector3) {
  outFocus.set(
    MathUtils.lerp(segment.startFocus.x, segment.endFocus.x, t),
    MathUtils.lerp(segment.startFocus.y, segment.endFocus.y, t),
    MathUtils.lerp(segment.startFocus.z, segment.endFocus.z, t)
  );
}

function sampleSplineSegment(segment: CinematicFlyoverSegment, progress: number, outPosition: Vector3, outFocus: Vector3): PoseSample {
  const t = segment.kind === 'entry' ? easeOutCubic01(progress) : smoothstep01(progress);
  sampleSegmentPosition(segment, t, outPosition);
  sampleSegmentFocus(segment, t, outFocus);

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
  return sampleSplineSegment(segment, progress, outPosition, outFocus);
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

function computeObstacleSafeY(x: number, z: number, baseY: number, obstacles: readonly CinematicFlyoverObstacle[]) {
  let safeY = baseY;
  for (const obstacle of obstacles) {
    const avoidRadius = obstacle.radius + CAMERA_CLEARANCE_PAD;
    const distance = Math.hypot(x - obstacle.x, z - obstacle.z);
    if (distance >= avoidRadius) continue;
    const influence = smoothstep01(1 - distance / avoidRadius);
    const obstacleSafeY = obstacle.height + CAMERA_CLEARANCE_Y;
    safeY = Math.max(safeY, MathUtils.lerp(baseY, obstacleSafeY, influence));
  }
  return safeY;
}

function pushOutsideObstacles(
  x: number,
  z: number,
  obstacles: readonly CinematicFlyoverObstacle[],
  padding: number,
  fallbackX: number,
  fallbackZ: number
) {
  let currentX = x;
  let currentZ = z;

  for (let pass = 0; pass < 2; pass += 1) {
    for (const obstacle of obstacles) {
      const minDistance = obstacle.radius + padding;
      const offsetX = currentX - obstacle.x;
      const offsetZ = currentZ - obstacle.z;
      const distance = Math.hypot(offsetX, offsetZ);
      if (distance >= minDistance) continue;
      const normal = distance > 0.001 ? { x: offsetX / distance, z: offsetZ / distance } : normalizeDirection2(fallbackX, fallbackZ);
      currentX = obstacle.x + normal.x * minDistance;
      currentZ = obstacle.z + normal.z * minDistance;
    }
  }

  return { x: currentX, z: currentZ };
}

function pushPointOutsideObstacles(point3: Point3, obstacles: readonly CinematicFlyoverObstacle[], padding: number, fallbackX: number, fallbackZ: number): Point3 {
  const adjusted = pushOutsideObstacles(point3.x, point3.z, obstacles, padding, fallbackX, fallbackZ);
  return {
    x: adjusted.x,
    y: point3.y,
    z: adjusted.z
  };
}

function buildWaypoint(
  target: CinematicFlyoverTarget,
  targetIndex: number,
  targets: readonly CinematicFlyoverTarget[],
  startPosition: Vector3,
  safeMaxY: number,
  safeBoundsRadius: number,
  obstacles: readonly CinematicFlyoverObstacle[],
  reducedMotion: boolean,
  fallbackSideSign: number
) {
  const previous = targetIndex > 0 ? targets[targetIndex - 1] : null;
  const next = targetIndex < targets.length - 1 ? targets[targetIndex + 1] : null;

  const incoming = normalizeDirection2(
    target.x - (previous ? previous.x : startPosition.x),
    target.z - (previous ? previous.z : startPosition.z)
  );
  const outgoing = next
    ? normalizeDirection2(next.x - target.x, next.z - target.z, incoming.x, incoming.z)
    : incoming;
  const travel = normalizeDirection2(incoming.x * 0.65 + outgoing.x, incoming.z * 0.65 + outgoing.z, outgoing.x, outgoing.z);
  const sideSign = resolveTurnSign(incoming.x, incoming.z, outgoing.x, outgoing.z, fallbackSideSign);
  const side = { x: travel.z, z: -travel.x };
  const towerRadius = Math.max(3.4, target.radius ?? Math.max(3.4, 2.8 + target.height * 0.06));
  const lookY = MathUtils.clamp(target.height * 0.6, 4.2, target.height + 18);
  const baseElevation = MathUtils.clamp(target.height + Math.max(6.4, target.height * 0.12), 16, safeMaxY + 52);
  let retreat = MathUtils.clamp(
    towerRadius + Math.max(10.5, target.height * (reducedMotion ? 0.32 : 0.42)),
    16,
    Math.max(26, safeBoundsRadius * 0.42)
  );
  let adjustedView = { x: target.x, z: target.z };
  let elevation = baseElevation;

  for (let pass = 0; pass < 3; pass += 1) {
    const lateral = MathUtils.clamp(retreat * (reducedMotion ? 0.08 : 0.12), 1.8, 7.5) * sideSign;
    const viewX = target.x - travel.x * retreat + side.x * lateral;
    const viewZ = target.z - travel.z * retreat + side.z * lateral;
    adjustedView = pushOutsideObstacles(viewX, viewZ, obstacles, 2.8, -travel.x + side.x * sideSign, -travel.z + side.z * sideSign);
    elevation = computeObstacleSafeY(adjustedView.x, adjustedView.z, baseElevation, obstacles);
    const horizontalDistance = Math.hypot(adjustedView.x - target.x, adjustedView.z - target.z);
    const requiredDistance = Math.max(
      towerRadius + 9,
      (elevation - lookY) / Math.tan(MathUtils.degToRad(DESIRED_VIEW_PITCH_DEG))
    );
    if (horizontalDistance >= requiredDistance - 0.4) break;
    retreat = Math.min(Math.max(retreat, requiredDistance + 1.2), Math.max(30, safeBoundsRadius * 0.58));
  }

  return {
    sequence: target.sequence,
    focusX: target.x,
    focusZ: target.z,
    x: adjustedView.x,
    z: adjustedView.z,
    elevation,
    lookY,
    height: target.height,
    radius: towerRadius,
    viewDirectionX: travel.x,
    viewDirectionZ: travel.z
  };
}

function buildEntryControlPoint(start: Point3, end: FlyoverWaypoint, travelX: number, travelZ: number, distance: number, progress: number, lift: number): Point3 {
  const sideX = travelZ;
  const sideZ = -travelX;
  const sideOffset = distance * 0.08 * (progress < 0.5 ? 1 : 0.6);
  return point(
    MathUtils.lerp(start.x, end.x, progress) + sideX * sideOffset,
    MathUtils.lerp(start.y, end.elevation, progress) + lift,
    MathUtils.lerp(start.z, end.z, progress) + sideZ * sideOffset
  );
}

function enforceDownwardPitchLimit(position: Vector3, target: Vector3, travelDirection: Vector3) {
  const drop = position.y - target.y;
  if (drop <= 0) return;

  const horizontalX = target.x - position.x;
  const horizontalZ = target.z - position.z;
  const horizontalDistance = Math.hypot(horizontalX, horizontalZ);
  const minHorizontalDistance = drop / Math.tan(MathUtils.degToRad(MAX_DOWNWARD_PITCH_DEG));
  if (horizontalDistance >= minHorizontalDistance) return;

  const travel = normalizeDirection2(travelDirection.x, travelDirection.z, horizontalX, horizontalZ);
  target.x = position.x + travel.x * minHorizontalDistance;
  target.z = position.z + travel.z * minHorizontalDistance;
}

export function pickCinematicFlyoverTargets<T extends CinematicFlyoverTarget>(
  towers: readonly T[],
  limit = 10
): CinematicFlyoverTarget[] {
  const sorted = [...towers].sort((left, right) => right.height - left.height || right.sequence - left.sequence);
  if (sorted.length <= limit) {
    return sorted.map(({ sequence, x, z, height, radius }) => ({ sequence, x, z, height, radius }));
  }

  const selected: T[] = [sorted[0]];
  const remaining = sorted.slice(1);
  const maxHeight = Math.max(1, sorted[0]?.height ?? 1);
  const extent = Math.max(12, sorted.reduce((best, tower) => Math.max(best, Math.hypot(tower.x, tower.z)), 0));

  while (selected.length < limit && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      let minDistanceToSelected = Infinity;
      for (const chosen of selected) {
        minDistanceToSelected = Math.min(minDistanceToSelected, Math.hypot(candidate.x - chosen.x, candidate.z - chosen.z));
      }

      const heightScore = Math.pow(MathUtils.clamp(candidate.height / maxHeight, 0, 1), 0.78);
      const spreadScore = MathUtils.clamp(minDistanceToSelected / (extent * 0.68), 0, 1);
      const score = heightScore * 0.7 + spreadScore * 0.3;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected.map(({ sequence, x, z, height, radius }) => ({ sequence, x, z, height, radius }));
}

export function buildCinematicFlyoverPlan({
  targets,
  obstacles = [],
  startPosition,
  startTarget,
  boundsRadius,
  maxY,
  reducedMotion = false
}: {
  targets: readonly CinematicFlyoverTarget[];
  obstacles?: readonly CinematicFlyoverObstacle[];
  startPosition: Vector3;
  startTarget: Vector3;
  boundsRadius: number;
  maxY: number;
  reducedMotion?: boolean;
}): CinematicFlyoverPlan | null {
  if (targets.length === 0) return null;

  const safeBoundsRadius = Math.max(18, boundsRadius);
  const safeMaxY = Math.max(8, maxY);
  const normalizedObstacles = obstacles
    .filter((obstacle) => Number.isFinite(obstacle.x) && Number.isFinite(obstacle.z) && Number.isFinite(obstacle.height))
    .map((obstacle) => ({
      sequence: obstacle.sequence,
      x: obstacle.x,
      z: obstacle.z,
      height: Math.max(0, obstacle.height),
      radius: Math.max(2.8, obstacle.radius)
    }));
  const waypoints: FlyoverWaypoint[] = [];
  let fallbackSideSign = 1;
  for (let index = 0; index < targets.length; index += 1) {
    const waypoint = buildWaypoint(
      targets[index],
      index,
      targets,
      startPosition,
      safeMaxY,
      safeBoundsRadius,
      normalizedObstacles,
      reducedMotion,
      fallbackSideSign
    );
    waypoints.push(waypoint);
    fallbackSideSign = resolveTurnSign(
      waypoint.viewDirectionX,
      waypoint.viewDirectionZ,
      index < targets.length - 1 ? targets[index + 1].x - targets[index].x : waypoint.viewDirectionX,
      index < targets.length - 1 ? targets[index + 1].z - targets[index].z : waypoint.viewDirectionZ,
      fallbackSideSign
    );
  }

  const segments: CinematicFlyoverSegment[] = [];
  let elapsedCursor = 0;

  const firstWaypoint = waypoints[0];
  const firstPosition = point(firstWaypoint.x, firstWaypoint.elevation, firstWaypoint.z);
  const straightDistance = startPosition.distanceTo(pointScratch.set(firstPosition.x, firstPosition.y, firstPosition.z));
  const entryDuration = MathUtils.clamp(
    (reducedMotion ? 2.8 : 3.6) + straightDistance * (reducedMotion ? 0.018 : 0.024),
    reducedMotion ? 2.9 : 3.4,
    reducedMotion ? 4.8 : 6.8
  );
  const entryTravel = normalizeDirection2(firstPosition.x - startPosition.x, firstPosition.z - startPosition.z, firstWaypoint.viewDirectionX, firstWaypoint.viewDirectionZ);
  const entryLift = MathUtils.clamp(Math.abs(firstPosition.y - startPosition.y) * 0.14 + 4.4, 3.4, 11.5);

  segments.push({
    kind: 'entry',
    startTime: elapsedCursor,
    duration: entryDuration,
    startPosition: point(startPosition.x, startPosition.y, startPosition.z),
    controlPositionA: pushPointOutsideObstacles(
      buildEntryControlPoint(point(startPosition.x, startPosition.y, startPosition.z), firstWaypoint, entryTravel.x, entryTravel.z, straightDistance, 0.18, entryLift * 0.2),
      normalizedObstacles,
      CAMERA_COLLISION_PAD,
      entryTravel.x,
      entryTravel.z
    ),
    controlPositionB: pushPointOutsideObstacles(
      buildEntryControlPoint(point(startPosition.x, startPosition.y, startPosition.z), firstWaypoint, entryTravel.x, entryTravel.z, straightDistance, 0.72, entryLift),
      normalizedObstacles,
      CAMERA_COLLISION_PAD,
      entryTravel.x,
      entryTravel.z
    ),
    endPosition: firstPosition,
    startFocus: point(startTarget.x, startTarget.y, startTarget.z),
    endFocus: point(firstWaypoint.focusX, firstWaypoint.lookY, firstWaypoint.focusZ),
    focusBlendFrom: 0,
    focusBlendTo: 0.12,
    lookAheadFrom: 0,
    lookAheadTo: 8.5
  });
  elapsedCursor += entryDuration;

  let lastTurnSign = 1;
  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const current = waypoints[index];
    const next = waypoints[index + 1];
    const bridgeDirection = normalizeDirection2(next.x - current.x, next.z - current.z, current.viewDirectionX, current.viewDirectionZ);
    const distance = Math.hypot(next.x - current.x, next.z - current.z);
    const turnSign = resolveTurnSign(current.viewDirectionX, current.viewDirectionZ, next.viewDirectionX, next.viewDirectionZ, lastTurnSign);
    const sideX = bridgeDirection.z;
    const sideZ = -bridgeDirection.x;
    const lateral = MathUtils.clamp(
      distance * (reducedMotion ? 0.08 : 0.12) + Math.max(current.radius, next.radius) * 0.35,
      3.5,
      Math.max(8.5, safeBoundsRadius * 0.14)
    ) * turnSign;
    const verticalLift = MathUtils.clamp(2.8 + distance * 0.03 + Math.abs(next.height - current.height) * 0.025, 3.2, 9.5);
    const controlPointAPlanar = pushOutsideObstacles(
      current.x + bridgeDirection.x * (distance * 0.26) + sideX * lateral,
      current.z + bridgeDirection.z * (distance * 0.26) + sideZ * lateral,
      normalizedObstacles,
      CAMERA_COLLISION_PAD,
      bridgeDirection.x + sideX * turnSign,
      bridgeDirection.z + sideZ * turnSign
    );
    const controlPointBPlanar = pushOutsideObstacles(
      next.x - bridgeDirection.x * (distance * 0.24) + sideX * lateral * 0.72,
      next.z - bridgeDirection.z * (distance * 0.24) + sideZ * lateral * 0.72,
      normalizedObstacles,
      CAMERA_COLLISION_PAD,
      -bridgeDirection.x + sideX * turnSign,
      -bridgeDirection.z + sideZ * turnSign
    );
    const controlPointA = point(
      controlPointAPlanar.x,
      computeObstacleSafeY(controlPointAPlanar.x, controlPointAPlanar.z, current.elevation + verticalLift * 0.52, normalizedObstacles),
      controlPointAPlanar.z
    );
    const controlPointB = point(
      controlPointBPlanar.x,
      computeObstacleSafeY(controlPointBPlanar.x, controlPointBPlanar.z, next.elevation + verticalLift, normalizedObstacles),
      controlPointBPlanar.z
    );
    const duration = MathUtils.clamp(
      (reducedMotion ? 2.6 : 3.2) + distance * (reducedMotion ? 0.028 : 0.04),
      reducedMotion ? 2.9 : 3.5,
      reducedMotion ? 5 : 6.8
    );

    segments.push({
      kind: 'transfer',
      startTime: elapsedCursor,
      duration,
      startPosition: point(current.x, current.elevation, current.z),
      controlPositionA: controlPointA,
      controlPositionB: controlPointB,
      endPosition: point(next.x, next.elevation, next.z),
      startFocus: point(current.focusX, current.lookY, current.focusZ),
      endFocus: point(next.focusX, next.lookY, next.focusZ),
      focusBlendFrom: 0.04,
      focusBlendTo: 0.08,
      lookAheadFrom: 5.5,
      lookAheadTo: 7.5
    });
    elapsedCursor += duration;
    lastTurnSign = turnSign;
  }

  return {
    segments,
    totalDuration: elapsedCursor,
    obstacles: normalizedObstacles
  };
}

export function sampleCinematicFlyoverPlan(
  plan: CinematicFlyoverPlan,
  elapsedSeconds: number,
  outPosition: Vector3,
  outTarget: Vector3
) {
  const currentSample = samplePlanState(plan, elapsedSeconds, currentPositionScratch, currentFocusScratch);
  const currentHorizontalSafe = pushOutsideObstacles(
    currentPositionScratch.x,
    currentPositionScratch.z,
    plan.obstacles,
    CAMERA_COLLISION_PAD,
    currentFocusScratch.x - currentPositionScratch.x,
    currentFocusScratch.z - currentPositionScratch.z
  );
  currentPositionScratch.x = currentHorizontalSafe.x;
  currentPositionScratch.z = currentHorizontalSafe.z;
  currentPositionScratch.y = computeObstacleSafeY(currentPositionScratch.x, currentPositionScratch.z, currentPositionScratch.y, plan.obstacles);

  samplePlanState(plan, Math.min(plan.totalDuration, elapsedSeconds + LOOK_AHEAD_SECONDS), futurePositionScratch, futureFocusScratch);
  const futureHorizontalSafe = pushOutsideObstacles(
    futurePositionScratch.x,
    futurePositionScratch.z,
    plan.obstacles,
    CAMERA_COLLISION_PAD,
    futureFocusScratch.x - futurePositionScratch.x,
    futureFocusScratch.z - futurePositionScratch.z
  );
  futurePositionScratch.x = futureHorizontalSafe.x;
  futurePositionScratch.z = futureHorizontalSafe.z;
  futurePositionScratch.y = computeObstacleSafeY(futurePositionScratch.x, futurePositionScratch.z, futurePositionScratch.y, plan.obstacles);

  forwardScratch.copy(futurePositionScratch).sub(currentPositionScratch);
  if (forwardScratch.lengthSq() < 0.0001) {
    forwardScratch.copy(futureFocusScratch).sub(currentPositionScratch);
  }
  if (forwardScratch.lengthSq() < 0.0001) {
    forwardScratch.copy(currentFocusScratch).sub(currentPositionScratch);
  }
  if (forwardScratch.lengthSq() < 0.0001) {
    forwardScratch.set(0, -0.08, -1);
  }
  forwardScratch.normalize();

  forwardLookScratch.copy(currentPositionScratch).addScaledVector(forwardScratch, currentSample.lookAheadDistance);
  forwardLookScratch.y = Math.max(currentFocusScratch.y + 0.4, currentPositionScratch.y - 10.5);

  outPosition.copy(currentPositionScratch);
  outTarget.copy(currentFocusScratch).lerp(forwardLookScratch, currentSample.focusBlend);
  enforceDownwardPitchLimit(outPosition, outTarget, forwardScratch);

  return {
    complete: elapsedSeconds >= plan.totalDuration
  };
}
