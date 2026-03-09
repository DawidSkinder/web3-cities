import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';

const CAMERA_CLEARANCE_PAD = 4.4;
const CAMERA_CLEARANCE_Y = 9.2;
const ENTRY_VIEW_PITCH_DEG = 32;
const CRUISE_VIEW_PITCH_DEG = 30;
const CRUISE_HANDOFF_BLEND_SECONDS = 0.85;
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
  cruiseDuration: number;
  cruiseLength: number;
  cruiseSpeed: number;
  cruiseLookDistance: number;
  totalDuration: number;
  obstacles: CinematicFlyoverObstacle[];
};

const pointScratch = new Vector3();
const tangentScratch = new Vector3();
const aheadPositionScratch = new Vector3();
const handoffTargetScratch = new Vector3();

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

function distance2D(left: CinematicFlyoverTarget, right: CinematicFlyoverTarget) {
  return Math.hypot(left.x - right.x, left.z - right.z);
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

function buildTowerPassPoint(target: CinematicFlyoverTarget, safeMaxY: number, obstacles: readonly CinematicFlyoverObstacle[]) {
  const baseY = MathUtils.clamp(
    target.height + Math.max(CAMERA_CLEARANCE_Y + 1.8, target.height * 0.08 + 4),
    15,
    safeMaxY + 34
  );
  return point(target.x, computeObstacleSafeY(target.x, target.z, baseY, obstacles), target.z);
}

function buildDeparturePoint(
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
    Math.max(18, (target.radius ?? 6) * 2.4, target.height * 0.22),
    18,
    Math.max(30, safeBoundsRadius * 0.22)
  );
  const x = target.x + direction.x * travelDistance;
  const z = target.z + direction.z * travelDistance;
  const baseY = MathUtils.clamp(referenceY, target.height + CAMERA_CLEARANCE_Y + 1.2, safeMaxY + 30);
  return point(x, computeObstacleSafeY(x, z, baseY, obstacles), z);
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

function pathLength(points: readonly CinematicFlyoverTarget[]) {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += distance2D(points[index], points[index + 1]);
  }
  return total;
}

function reverseSlice<T>(items: readonly T[], start: number, end: number) {
  return [
    ...items.slice(0, start),
    ...items.slice(start, end + 1).reverse(),
    ...items.slice(end + 1)
  ];
}

function orderTargetsForCruise(targets: readonly CinematicFlyoverTarget[]) {
  if (targets.length <= 2) return [...targets];

  const ordered: CinematicFlyoverTarget[] = [targets[0]];
  const remaining = [...targets.slice(1)];

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let bestIndex = 0;
    let bestDistance = Infinity;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const distance = distance2D(last, candidate);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    ordered.push(remaining.splice(bestIndex, 1)[0]);
  }

  let best = ordered;
  let improved = true;

  while (improved) {
    improved = false;
    const currentLength = pathLength(best);

    for (let start = 1; start < best.length - 2; start += 1) {
      for (let end = start + 1; end < best.length - 1; end += 1) {
        const candidate = reverseSlice(best, start, end);
        if (pathLength(candidate) + 0.001 < currentLength) {
          best = candidate;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  return best;
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
  return [...towers]
    .sort((left, right) => right.height - left.height || right.sequence - left.sequence)
    .slice(0, limit)
    .map(({ sequence, x, z, height, radius }) => ({ sequence, x, z, height, radius }));
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
  const orderedTargets = orderTargetsForCruise(targets);

  const firstTarget = orderedTargets[0];
  const secondTarget = orderedTargets.length > 1 ? orderedTargets[1] : null;
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

  const cruisePoints: Point3[] = [entryEndPosition];
  let previousPassPoint = buildTowerPassPoint(firstTarget, safeMaxY, normalizedObstacles);
  cruisePoints.push(previousPassPoint);

  for (let index = 0; index < orderedTargets.length; index += 1) {
    const currentTarget = orderedTargets[index];
    const currentPassPoint = index === 0 ? previousPassPoint : buildTowerPassPoint(currentTarget, safeMaxY, normalizedObstacles);
    const nextTarget = index < orderedTargets.length - 1 ? orderedTargets[index + 1] : null;
    const previousTarget = index > 0 ? orderedTargets[index - 1] : null;

    if (index > 0) {
      cruisePoints.push(currentPassPoint);
    }

    if (nextTarget) {
      cruisePoints.push(
        buildDeparturePoint(
          currentTarget,
          nextTarget.x - currentTarget.x,
          nextTarget.z - currentTarget.z,
          currentPassPoint.y,
          safeMaxY,
          safeBoundsRadius,
          normalizedObstacles
        )
      );
    } else if (previousTarget) {
      cruisePoints.push(
        buildDeparturePoint(
          currentTarget,
          currentTarget.x - previousTarget.x,
          currentTarget.z - previousTarget.z,
          currentPassPoint.y,
          safeMaxY,
          safeBoundsRadius,
          normalizedObstacles
        )
      );
    }

    previousPassPoint = currentPassPoint;
  }

  const cruisePosition = createCurve(cruisePoints);
  const cruiseLength = cruisePosition?.length ?? 0;
  const cruiseDuration =
    cruiseLength <= 0.001
      ? 0
      : MathUtils.clamp(
          orderedTargets.length * (reducedMotion ? 3.2 : 4.4) + cruiseLength * (reducedMotion ? 0.024 : 0.034),
          orderedTargets.length * 3,
          orderedTargets.length * 6.8
        );
  const cruiseSpeed = cruiseDuration > 0 ? cruiseLength / cruiseDuration : 0;
  const averageLegLength = cruiseLength / Math.max(1, orderedTargets.length);
  const cruiseLookDistance = MathUtils.clamp(averageLegLength * (reducedMotion ? 0.26 : 0.34), 18, 38);

  return {
    entry,
    entryDuration,
    cruisePosition,
    cruiseDuration,
    cruiseLength,
    cruiseSpeed,
    cruiseLookDistance,
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
    outPosition.y = computeObstacleSafeY(outPosition.x, outPosition.z, outPosition.y, plan.obstacles);
    return {
      complete: safeElapsed >= plan.totalDuration
    };
  }

  if (plan.cruisePosition && plan.cruiseDuration > 0 && plan.cruiseLength > 0.001) {
    const cruiseElapsed = Math.max(0, safeElapsed - plan.entryDuration);
    const currentDistance = Math.min(plan.cruiseLength, cruiseElapsed * plan.cruiseSpeed);
    const currentProgress = currentDistance / plan.cruiseLength;
    const aheadProgress = MathUtils.clamp((currentDistance + plan.cruiseLookDistance) / plan.cruiseLength, 0, 1);
    const tangentProgress = MathUtils.clamp(
      currentProgress + Math.max(0.015, (plan.cruiseLookDistance / Math.max(plan.cruiseLength, 1)) * 0.22),
      0,
      1
    );

    sampleCurveByProgress(plan.cruisePosition, currentProgress, outPosition);
    sampleCurveByProgress(plan.cruisePosition, aheadProgress, aheadPositionScratch);

    outPosition.y = computeObstacleSafeY(outPosition.x, outPosition.z, outPosition.y, plan.obstacles);
    aheadPositionScratch.y = computeObstacleSafeY(aheadPositionScratch.x, aheadPositionScratch.z, aheadPositionScratch.y, plan.obstacles);

    sampleCurveTangentByProgress(plan.cruisePosition, tangentProgress, tangentScratch);
    if (tangentScratch.lengthSq() < 0.0001) {
      tangentScratch.copy(aheadPositionScratch).sub(outPosition);
      if (tangentScratch.lengthSq() > 0.0001) {
        tangentScratch.normalize();
      }
    }
    if (tangentScratch.lengthSq() < 0.0001) {
      tangentScratch.set(0, -0.05, -1);
    }

    const aheadDirX = aheadPositionScratch.x - outPosition.x;
    const aheadDirZ = aheadPositionScratch.z - outPosition.z;
    const aheadDirLength = Math.hypot(aheadDirX, aheadDirZ);
    if (aheadDirLength > 0.001) {
      const aheadDirNormX = aheadDirX / aheadDirLength;
      const aheadDirNormZ = aheadDirZ / aheadDirLength;
      const alignment = tangentScratch.x * aheadDirNormX + tangentScratch.z * aheadDirNormZ;
      if (alignment < 0) {
        tangentScratch.set(aheadDirNormX, 0, aheadDirNormZ);
      }
    }

    const horizontalDistance = Math.max(0.001, Math.hypot(aheadPositionScratch.x - outPosition.x, aheadPositionScratch.z - outPosition.z));
    const desiredDrop = horizontalDistance * Math.tan(MathUtils.degToRad(CRUISE_VIEW_PITCH_DEG));
    outTarget.set(
      outPosition.x + tangentScratch.x * plan.cruiseLookDistance,
      Math.max(4.2, Math.min(outPosition.y - desiredDrop, aheadPositionScratch.y - 1.6)),
      outPosition.z + tangentScratch.z * plan.cruiseLookDistance
    );

    if (plan.entry && cruiseElapsed < CRUISE_HANDOFF_BLEND_SECONDS) {
      const handoffBlend = MathUtils.smoothstep(cruiseElapsed / CRUISE_HANDOFF_BLEND_SECONDS, 0, 1);
      handoffTargetScratch.set(plan.entry.endFocus.x, plan.entry.endFocus.y, plan.entry.endFocus.z);
      outTarget.lerpVectors(handoffTargetScratch, outTarget, handoffBlend);
    }

    enforceDownwardPitchLimit(outPosition, outTarget, tangentScratch);
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
