import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';

const CAMERA_CLEARANCE_PAD = 4.4;
const CAMERA_CLEARANCE_Y = 8.4;
const ENTRY_VIEW_PITCH_DEG = 32;
const CRUISE_HANDOFF_BLEND_SECONDS = 0.9;
const MIN_CRUISE_LOOK_DISTANCE = 12;
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

type EntryWaypoint = {
  focusX: number;
  focusZ: number;
  x: number;
  z: number;
  elevation: number;
  lookY: number;
  viewDirectionX: number;
  viewDirectionZ: number;
};

type EntrySegment = {
  duration: number;
  startPosition: Point3;
  controlPositionA: Point3;
  controlPositionB: Point3;
  endPosition: Point3;
  startFocus: Point3;
  endFocus: Point3;
};

type FlyoverCurve = {
  curve: CatmullRomCurve3;
  length: number;
};

export type CinematicFlyoverPlan = {
  entry: EntrySegment | null;
  entryDuration: number;
  cruisePosition: FlyoverCurve | null;
  cruiseFocus: FlyoverCurve | null;
  cruiseDuration: number;
  cruiseLength: number;
  cruiseSpeed: number;
  focusLeadDistance: number;
  totalDuration: number;
  obstacles: CinematicFlyoverObstacle[];
};

const pointScratch = new Vector3();
const tangentScratch = new Vector3();
const aheadPositionScratch = new Vector3();
const blendedTargetScratch = new Vector3();

function point(x: number, y: number, z: number): Point3 {
  return { x, y, z };
}

function toVector3(input: Point3) {
  return new Vector3(input.x, input.y, input.z);
}

function easeOutCubic01(value: number) {
  const t = MathUtils.clamp(value, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function cubicBezierCoordinate(a: number, b: number, c: number, d: number, t: number) {
  const omt = 1 - t;
  return omt * omt * omt * a + 3 * omt * omt * t * b + 3 * omt * t * t * c + t * t * t * d;
}

function sampleEntryPosition(segment: EntrySegment, t: number, outPosition: Vector3) {
  outPosition.set(
    cubicBezierCoordinate(segment.startPosition.x, segment.controlPositionA.x, segment.controlPositionB.x, segment.endPosition.x, t),
    cubicBezierCoordinate(segment.startPosition.y, segment.controlPositionA.y, segment.controlPositionB.y, segment.endPosition.y, t),
    cubicBezierCoordinate(segment.startPosition.z, segment.controlPositionA.z, segment.controlPositionB.z, segment.endPosition.z, t)
  );
}

function sampleEntryFocus(segment: EntrySegment, t: number, outFocus: Vector3) {
  outFocus.set(
    MathUtils.lerp(segment.startFocus.x, segment.endFocus.x, t),
    MathUtils.lerp(segment.startFocus.y, segment.endFocus.y, t),
    MathUtils.lerp(segment.startFocus.z, segment.endFocus.z, t)
  );
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
    const influence = MathUtils.smoothstep(1 - distance / avoidRadius, 0, 1);
    const obstacleSafeY = obstacle.height + CAMERA_CLEARANCE_Y;
    safeY = Math.max(safeY, MathUtils.lerp(baseY, obstacleSafeY, influence));
  }
  return safeY;
}

function buildEntryWaypoint(
  target: CinematicFlyoverTarget,
  nextTarget: CinematicFlyoverTarget | null,
  startPosition: Vector3,
  safeMaxY: number,
  safeBoundsRadius: number,
  obstacles: readonly CinematicFlyoverObstacle[],
  reducedMotion: boolean
): EntryWaypoint {
  const incoming = normalizeDirection2(target.x - startPosition.x, target.z - startPosition.z);
  const outgoing = nextTarget
    ? normalizeDirection2(nextTarget.x - target.x, nextTarget.z - target.z, incoming.x, incoming.z)
    : incoming;
  const travel = normalizeDirection2(incoming.x * 0.65 + outgoing.x, incoming.z * 0.65 + outgoing.z, outgoing.x, outgoing.z);
  const sideSign = resolveTurnSign(incoming.x, incoming.z, outgoing.x, outgoing.z, 1);
  const side = { x: travel.z, z: -travel.x };
  const towerRadius = Math.max(3.4, target.radius ?? Math.max(3.4, 2.8 + target.height * 0.06));
  const lookY = MathUtils.clamp(target.height * 0.6, 4.2, target.height + 18);
  const baseElevation = MathUtils.clamp(target.height + Math.max(6.4, target.height * 0.12), 16, safeMaxY + 52);
  let retreat = MathUtils.clamp(
    towerRadius + Math.max(10.5, target.height * (reducedMotion ? 0.32 : 0.42)),
    16,
    Math.max(26, safeBoundsRadius * 0.42)
  );

  let adjustedX = target.x;
  let adjustedZ = target.z;
  let elevation = baseElevation;

  for (let pass = 0; pass < 3; pass += 1) {
    const lateral = MathUtils.clamp(retreat * (reducedMotion ? 0.08 : 0.12), 1.8, 7.5) * sideSign;
    adjustedX = target.x - travel.x * retreat + side.x * lateral;
    adjustedZ = target.z - travel.z * retreat + side.z * lateral;
    elevation = computeObstacleSafeY(adjustedX, adjustedZ, baseElevation, obstacles);
    const horizontalDistance = Math.hypot(adjustedX - target.x, adjustedZ - target.z);
    const requiredDistance = Math.max(
      towerRadius + 9,
      (elevation - lookY) / Math.tan(MathUtils.degToRad(ENTRY_VIEW_PITCH_DEG))
    );
    if (horizontalDistance >= requiredDistance - 0.4) break;
    retreat = Math.min(Math.max(retreat, requiredDistance + 1.2), Math.max(30, safeBoundsRadius * 0.58));
  }

  return {
    focusX: target.x,
    focusZ: target.z,
    x: adjustedX,
    z: adjustedZ,
    elevation,
    lookY,
    viewDirectionX: travel.x,
    viewDirectionZ: travel.z
  };
}

function buildEntryControlPoint(start: Point3, end: EntryWaypoint, travelX: number, travelZ: number, distance: number, progress: number, lift: number): Point3 {
  const sideX = travelZ;
  const sideZ = -travelX;
  const sideOffset = distance * 0.08 * (progress < 0.5 ? 1 : 0.6);
  return point(
    MathUtils.lerp(start.x, end.x, progress) + sideX * sideOffset,
    MathUtils.lerp(start.y, end.elevation, progress) + lift,
    MathUtils.lerp(start.z, end.z, progress) + sideZ * sideOffset
  );
}

function buildCruisePoint(target: CinematicFlyoverTarget, safeMaxY: number, obstacles: readonly CinematicFlyoverObstacle[]) {
  const baseY = MathUtils.clamp(target.height + Math.max(8.5, target.height * 0.11), 15, safeMaxY + 34);
  return point(target.x, computeObstacleSafeY(target.x, target.z, baseY, obstacles), target.z);
}

function buildFocusPoint(target: CinematicFlyoverTarget) {
  return point(target.x, MathUtils.clamp(target.height * 0.58, 4.2, target.height * 0.78), target.z);
}

function buildFlyPastPoint(
  target: CinematicFlyoverTarget,
  directionX: number,
  directionZ: number,
  referenceY: number,
  safeMaxY: number,
  safeBoundsRadius: number,
  obstacles: readonly CinematicFlyoverObstacle[]
) {
  const direction = normalizeDirection2(directionX, directionZ, 0, 1);
  const travelDistance = MathUtils.clamp(
    Math.max(14, (target.radius ?? 6) * 1.8, target.height * 0.18),
    16,
    Math.max(24, safeBoundsRadius * 0.18)
  );
  const x = target.x + direction.x * travelDistance;
  const z = target.z + direction.z * travelDistance;
  const baseY = MathUtils.clamp(referenceY - 0.5, target.height + 6.5, safeMaxY + 28);
  return point(x, computeObstacleSafeY(x, z, baseY, obstacles), z);
}

function buildLeadFocusPoint(target: CinematicFlyoverTarget, directionX: number, directionZ: number, distanceScale = 1) {
  const direction = normalizeDirection2(directionX, directionZ, 0, 1);
  const leadDistance = Math.max(10, (target.radius ?? 6) * 1.6) * distanceScale;
  return point(
    target.x + direction.x * leadDistance,
    MathUtils.clamp(target.height * 0.56, 4, target.height * 0.74),
    target.z + direction.z * leadDistance
  );
}

function dedupePoints(points: readonly Point3[]) {
  if (points.length <= 1) return [...points];
  const deduped: Point3[] = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const previous = deduped[deduped.length - 1];
    const candidate = points[index];
    if (Math.hypot(candidate.x - previous.x, candidate.y - previous.y, candidate.z - previous.z) > 0.01) {
      deduped.push(candidate);
    }
  }
  return deduped;
}

function createCurve(points: readonly Point3[]): FlyoverCurve | null {
  const deduped = dedupePoints(points);
  if (deduped.length < 2) return null;
  const curve = new CatmullRomCurve3(
    deduped.map((entry) => toVector3(entry)),
    false,
    'centripetal'
  );
  return {
    curve,
    length: curve.getLength()
  };
}

function sampleCurveByProgress(flightCurve: FlyoverCurve, progress: number, out: Vector3) {
  flightCurve.curve.getPointAt(MathUtils.clamp(progress, 0, 1), out);
}

function sampleCurveTangentByProgress(flightCurve: FlyoverCurve, progress: number, out: Vector3) {
  flightCurve.curve.getTangentAt(MathUtils.clamp(progress, 0, 1), out);
  return out.normalize();
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

function enforceMinimumLookDistance(position: Vector3, target: Vector3, travelDirection: Vector3) {
  const horizontalX = target.x - position.x;
  const horizontalZ = target.z - position.z;
  const horizontalDistance = Math.hypot(horizontalX, horizontalZ);
  if (horizontalDistance >= MIN_CRUISE_LOOK_DISTANCE) return;

  const travel = normalizeDirection2(travelDirection.x, travelDirection.z, horizontalX, horizontalZ);
  target.x = position.x + travel.x * MIN_CRUISE_LOOK_DISTANCE;
  target.z = position.z + travel.z * MIN_CRUISE_LOOK_DISTANCE;
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

export function pickCinematicFlyoverTargets<T extends CinematicFlyoverTarget>(
  towers: readonly T[],
  limit = 10
): CinematicFlyoverTarget[] {
  const tallest = [...towers]
    .sort((left, right) => right.height - left.height || right.sequence - left.sequence)
    .slice(0, limit);
  if (tallest.length <= 1) {
    return tallest.map(({ sequence, x, z, height, radius }) => ({ sequence, x, z, height, radius }));
  }

  const ordered: T[] = [tallest[0]];
  const remaining = tallest.slice(1);

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const distance = Math.hypot(candidate.x - last.x, candidate.z - last.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    ordered.push(remaining.splice(bestIndex, 1)[0]);
  }

  return ordered.map(({ sequence, x, z, height, radius }) => ({ sequence, x, z, height, radius }));
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
    .map(normalizeObstacle);

  const firstTarget = targets[0];
  const secondTarget = targets.length > 1 ? targets[1] : null;
  const firstWaypoint = buildEntryWaypoint(
    firstTarget,
    secondTarget,
    startPosition,
    safeMaxY,
    safeBoundsRadius,
    normalizedObstacles,
    reducedMotion
  );

  const entryEndPosition = point(firstWaypoint.x, firstWaypoint.elevation, firstWaypoint.z);
  const straightDistance = startPosition.distanceTo(pointScratch.set(entryEndPosition.x, entryEndPosition.y, entryEndPosition.z));
  const entryDuration = MathUtils.clamp(
    (reducedMotion ? 2.8 : 3.6) + straightDistance * (reducedMotion ? 0.018 : 0.024),
    reducedMotion ? 2.9 : 3.4,
    reducedMotion ? 4.8 : 6.8
  );
  const entryTravel = normalizeDirection2(
    entryEndPosition.x - startPosition.x,
    entryEndPosition.z - startPosition.z,
    firstWaypoint.viewDirectionX,
    firstWaypoint.viewDirectionZ
  );
  const entryLift = MathUtils.clamp(Math.abs(entryEndPosition.y - startPosition.y) * 0.14 + 4.4, 3.4, 11.5);

  const entry: EntrySegment = {
    duration: entryDuration,
    startPosition: point(startPosition.x, startPosition.y, startPosition.z),
    controlPositionA: buildEntryControlPoint(
      point(startPosition.x, startPosition.y, startPosition.z),
      firstWaypoint,
      entryTravel.x,
      entryTravel.z,
      straightDistance,
      0.18,
      entryLift * 0.2
    ),
    controlPositionB: buildEntryControlPoint(
      point(startPosition.x, startPosition.y, startPosition.z),
      firstWaypoint,
      entryTravel.x,
      entryTravel.z,
      straightDistance,
      0.72,
      entryLift
    ),
    endPosition: entryEndPosition,
    startFocus: point(startTarget.x, startTarget.y, startTarget.z),
    endFocus: point(firstWaypoint.focusX, firstWaypoint.lookY, firstWaypoint.focusZ)
  };

  const cruisePositionPoints: Point3[] = [entryEndPosition];
  const cruiseFocusPoints: Point3[] = [point(firstWaypoint.focusX, firstWaypoint.lookY, firstWaypoint.focusZ)];

  if (secondTarget) {
    const firstDeparturePoint = buildFlyPastPoint(
      firstTarget,
      secondTarget.x - firstTarget.x,
      secondTarget.z - firstTarget.z,
      entryEndPosition.y,
      safeMaxY,
      safeBoundsRadius,
      normalizedObstacles
    );
    cruisePositionPoints.push(firstDeparturePoint);
    cruiseFocusPoints.push(buildLeadFocusPoint(firstTarget, secondTarget.x - firstTarget.x, secondTarget.z - firstTarget.z, 1.05));
  }

  for (let index = 1; index < targets.length; index += 1) {
    const target = targets[index];
    const previousTarget = targets[index - 1];
    const nextTarget = index < targets.length - 1 ? targets[index + 1] : null;
    const roofPoint = buildCruisePoint(target, safeMaxY, normalizedObstacles);
    cruisePositionPoints.push(roofPoint);
    cruiseFocusPoints.push(buildFocusPoint(target));

    if (nextTarget) {
      cruisePositionPoints.push(
        buildFlyPastPoint(
          target,
          nextTarget.x - target.x,
          nextTarget.z - target.z,
          roofPoint.y,
          safeMaxY,
          safeBoundsRadius,
          normalizedObstacles
        )
      );
      cruiseFocusPoints.push(buildLeadFocusPoint(target, nextTarget.x - target.x, nextTarget.z - target.z));
    } else {
      cruisePositionPoints.push(
        buildFlyPastPoint(
          target,
          target.x - previousTarget.x,
          target.z - previousTarget.z,
          roofPoint.y,
          safeMaxY,
          safeBoundsRadius,
          normalizedObstacles
        )
      );
      cruiseFocusPoints.push(buildLeadFocusPoint(target, target.x - previousTarget.x, target.z - previousTarget.z, 0.95));
    }
  }

  const cruisePosition = createCurve(cruisePositionPoints);
  const cruiseFocus = createCurve(cruiseFocusPoints);
  const cruiseLength = cruisePosition?.length ?? 0;
  const cruiseDuration =
    cruiseLength <= 0.001
      ? 0
      : MathUtils.clamp(
          targets.length * (reducedMotion ? 3.1 : 4.1) + cruiseLength * (reducedMotion ? 0.022 : 0.031),
          targets.length * 2.8,
          targets.length * 6.4
        );
  const cruiseSpeed = cruiseDuration > 0 ? cruiseLength / cruiseDuration : 0;
  const averageLegLength = cruiseLength / Math.max(1, targets.length);
  const focusLeadDistance = MathUtils.clamp(averageLegLength * (reducedMotion ? 0.18 : 0.24), 12, 34);

  return {
    entry,
    entryDuration,
    cruisePosition,
    cruiseFocus,
    cruiseDuration,
    cruiseLength,
    cruiseSpeed,
    focusLeadDistance,
    totalDuration: entryDuration + cruiseDuration,
    obstacles: normalizedObstacles
  };
}

export function sampleCinematicFlyoverPlan(
  plan: CinematicFlyoverPlan,
  elapsedSeconds: number,
  outPosition: Vector3,
  outTarget: Vector3
) {
  const safeElapsed = MathUtils.clamp(elapsedSeconds, 0, plan.totalDuration);

  if (plan.entry && safeElapsed <= plan.entryDuration + 1e-6) {
    const progress = plan.entryDuration <= 0 ? 1 : safeElapsed / plan.entryDuration;
    const t = easeOutCubic01(progress);
    sampleEntryPosition(plan.entry, t, outPosition);
    sampleEntryFocus(plan.entry, t, outTarget);
    return {
      complete: safeElapsed >= plan.totalDuration
    };
  }

  if (plan.cruisePosition && plan.cruiseFocus && plan.cruiseDuration > 0 && plan.cruiseLength > 0.001) {
    const cruiseElapsed = Math.max(0, safeElapsed - plan.entryDuration);
    const currentDistance = Math.min(plan.cruiseLength, cruiseElapsed * plan.cruiseSpeed);
    const currentProgress = currentDistance / plan.cruiseLength;
    const focusProgress = MathUtils.clamp((currentDistance + plan.focusLeadDistance) / plan.cruiseLength, 0, 1);
    const aheadProgress = MathUtils.clamp(
      currentProgress + Math.max(0.025, (plan.focusLeadDistance / Math.max(plan.cruiseLength, 1)) * 0.4),
      0,
      1
    );

    sampleCurveByProgress(plan.cruisePosition, currentProgress, outPosition);
    sampleCurveByProgress(plan.cruiseFocus, focusProgress, blendedTargetScratch);
    sampleCurveByProgress(plan.cruisePosition, aheadProgress, aheadPositionScratch);

    outPosition.y = computeObstacleSafeY(outPosition.x, outPosition.z, outPosition.y, plan.obstacles);
    aheadPositionScratch.y = Math.max(blendedTargetScratch.y, outPosition.y - 13.5);
    outTarget.copy(aheadPositionScratch).lerp(blendedTargetScratch, 0.24);

    if (plan.entry && cruiseElapsed < CRUISE_HANDOFF_BLEND_SECONDS) {
      const handoffBlend = MathUtils.smoothstep(cruiseElapsed / CRUISE_HANDOFF_BLEND_SECONDS, 0, 1);
      blendedTargetScratch.set(plan.entry.endFocus.x, plan.entry.endFocus.y, plan.entry.endFocus.z);
      outTarget.lerpVectors(blendedTargetScratch, outTarget, handoffBlend);
    }

    sampleCurveTangentByProgress(
      plan.cruisePosition,
      MathUtils.clamp(currentProgress + Math.max(0.01, plan.focusLeadDistance / Math.max(plan.cruiseLength, 1) * 0.2), 0, 1),
      tangentScratch
    );

    if (tangentScratch.lengthSq() < 0.0001) {
      tangentScratch.copy(outTarget).sub(outPosition);
      if (tangentScratch.lengthSq() > 0.0001) {
        tangentScratch.normalize();
      }
    }

    enforceDownwardPitchLimit(outPosition, outTarget, tangentScratch);
    enforceMinimumLookDistance(outPosition, outTarget, tangentScratch);
    return {
      complete: safeElapsed >= plan.totalDuration
    };
  }

  if (plan.entry) {
    sampleEntryPosition(plan.entry, 1, outPosition);
    sampleEntryFocus(plan.entry, 1, outTarget);
  }

  return {
    complete: safeElapsed >= plan.totalDuration
  };
}
