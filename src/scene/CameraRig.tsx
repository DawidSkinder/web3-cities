import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { MathUtils, Vector2, Vector3 } from 'three';
import { useBlockEventStore } from '../data/trades/blockEventStore';
import { useCitySceneStore } from './citySceneStore';
import { getSpineTransformFromSequence } from './cityGrowthPath';
import { DEBUG_VIEW_ENABLED } from './viewFlags';

type CameraMode = 'auto' | 'user' | 'returning';

type OrbitalState = {
  angle: number;
  distance: number;
  elevation: number;
  lookHeight: number;
  focusOffsetX: number;
  focusOffsetZ: number;
};

const lookAtTarget = new Vector3();
const desiredLookTarget = new Vector3();
const desiredPosition = new Vector3();
const smoothedLookTargetVec = new Vector3();
const smoothedCameraPosVec = new Vector3();
const focusCenter = new Vector3();
const corridorCenter = new Vector3();
const frontierPos = new Vector3();
const historyPos = new Vector3();
const centerPos = new Vector3();
const frontierTangent = new Vector3();
const boundsCenter = new Vector3();
const pointerOffset = new Vector2();
const tmpDir = new Vector3();
const tmpForward = new Vector3();
const tmpRight = new Vector3();
const tmpFocusOffset = new Vector3();
const tmpLookOffset = new Vector3();
const tmpAutoFocus = new Vector3();
const tmpBoundsFocus = new Vector3();
const tmpFrontierFocus = new Vector3();

function dampVec3(current: Vector3, target: Vector3, lambda: number, delta: number) {
  current.x = MathUtils.damp(current.x, target.x, lambda, delta);
  current.y = MathUtils.damp(current.y, target.y, lambda, delta);
  current.z = MathUtils.damp(current.z, target.z, lambda, delta);
}

function wrapAngle(angle: number) {
  const twoPi = Math.PI * 2;
  let a = angle % twoPi;
  if (a > Math.PI) a -= twoPi;
  if (a < -Math.PI) a += twoPi;
  return a;
}

function dampAngle(current: number, target: number, lambda: number, delta: number) {
  const diff = wrapAngle(target - current);
  return wrapAngle(current + diff * (1 - Math.exp(-lambda * delta)));
}

function clampCameraParams(state: OrbitalState, maxRadius: number, maxHeight: number) {
  const minDistance = 8;
  const maxDistance = Math.max(26, maxRadius * 2.8 + maxHeight * 1.25 + 10);
  state.distance = MathUtils.clamp(state.distance, minDistance, maxDistance);
  state.elevation = MathUtils.clamp(state.elevation, 4.8, Math.max(12, maxHeight + 9));
  state.lookHeight = MathUtils.clamp(state.lookHeight, 1.2, Math.max(16, maxHeight + 4));
  state.focusOffsetX = MathUtils.clamp(state.focusOffsetX, -18, 18);
  state.focusOffsetZ = MathUtils.clamp(state.focusOffsetZ, -20, 20);
}

function copyState(dst: OrbitalState, src: OrbitalState) {
  dst.angle = src.angle;
  dst.distance = src.distance;
  dst.elevation = src.elevation;
  dst.lookHeight = src.lookHeight;
  dst.focusOffsetX = src.focusOffsetX;
  dst.focusOffsetZ = src.focusOffsetZ;
}

export function CameraRig() {
  const { camera, gl } = useThree();
  const { events, latest } = useBlockEventStore();
  const { bounds } = useCitySceneStore();

  const initializedRef = useRef(false);
  const modeRef = useRef<CameraMode>('auto');
  const lastInteractionAtRef = useRef(0);
  const idleDelayMsRef = useRef(DEBUG_VIEW_ENABLED ? 8000 : 5500);

  const actualStateRef = useRef<OrbitalState>({
    angle: 0,
    distance: 22,
    elevation: 9,
    lookHeight: 4,
    focusOffsetX: 0,
    focusOffsetZ: 0
  });
  const controlTargetRef = useRef<OrbitalState>({
    angle: 0,
    distance: 22,
    elevation: 9,
    lookHeight: 4,
    focusOffsetX: 0,
    focusOffsetZ: 0
  });
  const autoTargetRef = useRef<OrbitalState>({
    angle: 0,
    distance: 22,
    elevation: 9,
    lookHeight: 4,
    focusOffsetX: 0,
    focusOffsetZ: 0
  });

  const keyStateRef = useRef<Record<string, boolean>>({});
  const pointerDragRef = useRef({
    dragging: false,
    pointerId: -1,
    lastX: 0,
    lastY: 0,
    button: 0
  });

  const smoothedFrontierSeqRef = useRef(1);
  const smoothedCenterSeqRef = useRef(1);
  const smoothedHeightSignalRef = useRef(0.55);
  const smoothedFocusBaseRef = useRef(new Vector3());

  useEffect(() => {
    const canvas = gl.domElement;

    const markInteraction = () => {
      lastInteractionAtRef.current = performance.now();
      if (modeRef.current !== 'user') {
        modeRef.current = 'user';
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) {
        return;
      }
      pointerDragRef.current.dragging = true;
      pointerDragRef.current.pointerId = event.pointerId;
      pointerDragRef.current.lastX = event.clientX;
      pointerDragRef.current.lastY = event.clientY;
      pointerDragRef.current.button = event.button;
      canvas.setPointerCapture?.(event.pointerId);
      markInteraction();
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = pointerDragRef.current;
      if (!drag.dragging || drag.pointerId !== event.pointerId) {
        return;
      }

      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;

      const control = controlTargetRef.current;
      const precision = keyStateRef.current.ShiftLeft || keyStateRef.current.ShiftRight ? 0.45 : 1;

      if (drag.button === 0 && !event.shiftKey) {
        control.angle = wrapAngle(control.angle - dx * 0.0042 * precision);
        control.elevation += dy * -0.028 * precision;
        control.lookHeight += dy * -0.018 * precision;
      } else {
        const panScale = 0.02 * precision * Math.max(0.7, control.distance / 20);
        control.focusOffsetX += dx * panScale;
        control.focusOffsetZ += dy * panScale;
      }

      markInteraction();
      event.preventDefault();
    };

    const endDrag = (event: PointerEvent) => {
      const drag = pointerDragRef.current;
      if (drag.pointerId !== event.pointerId) {
        return;
      }
      drag.dragging = false;
      drag.pointerId = -1;
      canvas.releasePointerCapture?.(event.pointerId);
      markInteraction();
    };

    const onWheel = (event: WheelEvent) => {
      const control = controlTargetRef.current;
      const precision = keyStateRef.current.ShiftLeft || keyStateRef.current.ShiftRight ? 0.55 : 1;
      control.distance += event.deltaY * 0.014 * precision;
      control.lookHeight += event.deltaY * 0.002 * precision;
      markInteraction();
      event.preventDefault();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      keyStateRef.current[event.code] = true;
      if (event.code === 'KeyR') {
        modeRef.current = 'returning';
        lastInteractionAtRef.current = performance.now();
        event.preventDefault();
        return;
      }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(event.code)) {
        markInteraction();
        event.preventDefault();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keyStateRef.current[event.code] = false;
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', endDrag);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endDrag);
      canvas.removeEventListener('pointercancel', endDrag);
      canvas.removeEventListener('pointerleave', endDrag);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [gl]);

  useFrame(({ clock, pointer }, delta) => {
    const t = clock.getElapsedTime();
    pointerOffset.set(pointer.x, pointer.y);

    const targetFrontierSeq = Math.max(1, latest?.sequence ?? 1);
    const recentCount = DEBUG_VIEW_ENABLED ? 16 : 12;
    const start = Math.max(0, events.length - recentCount);
    const sampleCount = Math.max(0, events.length - start);
    let weightedSeqSum = 0;
    let weightedHeightSum = 0;
    let weightSum = 0;

    for (let i = start; i < events.length; i++) {
      const event = events[i];
      if (!event || !Number.isFinite(event.sequence)) {
        continue;
      }

      const localIndex = i - start;
      const recency = sampleCount <= 1 ? 1 : localIndex / (sampleCount - 1);
      const weight = 0.55 + recency * 1.55;
      const intensity = MathUtils.clamp(event.metrics?.intensity ?? 0, 0, 1);
      const tradeCount = Math.max(0, event.metrics?.tradeCount ?? 0);
      const localHeightSignal = MathUtils.clamp(
        0.35 + intensity * 0.55 + Math.log1p(tradeCount) / 11.5,
        0.3,
        1.5
      );

      weightedSeqSum += event.sequence * weight;
      weightedHeightSum += localHeightSignal * weight;
      weightSum += weight;
    }

    const recentWeightedCenterSeq =
      weightSum > 0 ? weightedSeqSum / weightSum : targetFrontierSeq - (DEBUG_VIEW_ENABLED ? 6.5 : 5.2);
    const targetCenterSeq = MathUtils.clamp(
      recentWeightedCenterSeq * 0.82 + targetFrontierSeq * 0.18,
      1,
      Math.max(1, targetFrontierSeq - 0.8)
    );
    const targetHeightSignal = MathUtils.clamp(
      (weightSum > 0 ? weightedHeightSum / weightSum : 0.45) * 0.78 +
        (latest
          ? MathUtils.clamp(
              0.35 + (latest.metrics.intensity ?? 0) * 0.45 + Math.log1p(Math.max(0, latest.metrics.tradeCount ?? 0)) / 12,
              0.35,
              1.4
            )
          : 0.45) *
          0.22,
      0.35,
      1.4
    );

    let didInit = false;
    if (!initializedRef.current) {
      initializedRef.current = true;
      didInit = true;
      smoothedFrontierSeqRef.current = targetFrontierSeq;
      smoothedCenterSeqRef.current = targetCenterSeq;
      smoothedHeightSignalRef.current = targetHeightSignal;
      lastInteractionAtRef.current = performance.now();
    }

    smoothedFrontierSeqRef.current = MathUtils.damp(
      smoothedFrontierSeqRef.current,
      targetFrontierSeq,
      DEBUG_VIEW_ENABLED ? 1.1 : 1.3,
      delta
    );
    smoothedCenterSeqRef.current = MathUtils.damp(
      smoothedCenterSeqRef.current,
      targetCenterSeq,
      DEBUG_VIEW_ENABLED ? 1.0 : 1.18,
      delta
    );
    smoothedHeightSignalRef.current = MathUtils.damp(
      smoothedHeightSignalRef.current,
      targetHeightSignal,
      DEBUG_VIEW_ENABLED ? 1.05 : 1.25,
      delta
    );

    const smoothedFrontierSeq = smoothedFrontierSeqRef.current;
    const smoothedCenterSeq = smoothedCenterSeqRef.current;
    const historySeq = Math.max(1, smoothedFrontierSeq - (DEBUG_VIEW_ENABLED ? 13 : 10));

    const frontierTransform = getSpineTransformFromSequence(smoothedFrontierSeq);
    const centerTransform = getSpineTransformFromSequence(smoothedCenterSeq);
    const historyTransform = getSpineTransformFromSequence(historySeq);

    frontierPos.set(...frontierTransform.position);
    frontierTangent.set(...frontierTransform.tangent);
    historyPos.set(...historyTransform.position);
    centerPos.set(...centerTransform.position);
    corridorCenter
      .copy(historyPos)
      .lerp(centerPos, 0.52)
      .lerp(frontierPos, 0.18);

    const maxHeight = Math.max(4, bounds?.maxY ?? 8);
    const radius = Math.max(8, bounds?.radius ?? 16);
    boundsCenter.set(bounds?.centerX ?? corridorCenter.x, 0, bounds?.centerZ ?? corridorCenter.z);

    tmpBoundsFocus.copy(boundsCenter);
    tmpFrontierFocus.copy(frontierPos);
    tmpAutoFocus
      .copy(tmpBoundsFocus)
      .lerp(corridorCenter, 0.52)
      .lerp(tmpFrontierFocus, 0.2);

    dampVec3(smoothedFocusBaseRef.current, tmpAutoFocus, DEBUG_VIEW_ENABLED ? 1.0 : 1.2, delta);
    focusCenter.copy(smoothedFocusBaseRef.current);

    const frontierHeading = Math.atan2(frontierTangent.x, frontierTangent.z);
    const autoAngle =
      frontierHeading +
      Math.PI * 0.78 +
      t * (DEBUG_VIEW_ENABLED ? 0.045 : 0.055) +
      Math.sin(t * 0.17) * 0.12 +
      Math.sin(t * 0.047 + 0.9) * 0.06;

    const autoDistance = MathUtils.clamp(
      11 + radius * 1.1 + maxHeight * 0.55 + smoothedHeightSignalRef.current * 2.5,
      16,
      86
    );
    const autoElevation = MathUtils.clamp(5.8 + maxHeight * 0.52 + radius * 0.1, 7.5, 34);
    const autoLookHeight = MathUtils.clamp(1.6 + maxHeight * 0.5, 2.4, 26);

    autoTargetRef.current.angle = wrapAngle(autoAngle);
    autoTargetRef.current.distance = autoDistance;
    autoTargetRef.current.elevation = autoElevation;
    autoTargetRef.current.lookHeight = autoLookHeight;
    autoTargetRef.current.focusOffsetX = 0;
    autoTargetRef.current.focusOffsetZ = 0;

    const keys = keyStateRef.current;
    const anyMovementKey =
      keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD || keys.KeyQ || keys.KeyE;
    if (anyMovementKey) {
      modeRef.current = 'user';
      lastInteractionAtRef.current = performance.now();
    }

    if (modeRef.current === 'user') {
      const idleMs = performance.now() - lastInteractionAtRef.current;
      if (!pointerDragRef.current.dragging && idleMs > idleDelayMsRef.current) {
        modeRef.current = 'returning';
      }
    }

    const control = controlTargetRef.current;
    const actual = actualStateRef.current;
    const auto = autoTargetRef.current;

    if (didInit) {
      copyState(control, auto);
      copyState(actual, auto);
      smoothedCameraPosVec.set(0, 0, 0);
      smoothedLookTargetVec.set(0, 0, 0);
    }

    if (modeRef.current === 'auto') {
      copyState(control, auto);
    }

    if (modeRef.current === 'user' || modeRef.current === 'returning') {
      const precision = keys.ShiftLeft || keys.ShiftRight ? 0.45 : 1;
      const orbitSpeed = (DEBUG_VIEW_ENABLED ? 0.7 : 0.95) * precision;
      const heightSpeed = (DEBUG_VIEW_ENABLED ? 5.5 : 7) * precision;
      const zoomSpeed = (DEBUG_VIEW_ENABLED ? 9 : 12) * precision;

      if (keys.KeyA) control.angle = wrapAngle(control.angle + delta * orbitSpeed);
      if (keys.KeyD) control.angle = wrapAngle(control.angle - delta * orbitSpeed);
      if (keys.KeyW) {
        control.elevation += delta * heightSpeed;
        control.lookHeight += delta * heightSpeed * 0.72;
      }
      if (keys.KeyS) {
        control.elevation -= delta * heightSpeed;
        control.lookHeight -= delta * heightSpeed * 0.72;
      }
      if (keys.KeyQ) control.distance = Math.max(6, control.distance - delta * zoomSpeed);
      if (keys.KeyE) control.distance += delta * zoomSpeed;
    }

    if (modeRef.current === 'returning') {
      control.angle = dampAngle(control.angle, auto.angle, DEBUG_VIEW_ENABLED ? 0.95 : 1.1, delta);
      control.distance = MathUtils.damp(control.distance, auto.distance, DEBUG_VIEW_ENABLED ? 0.95 : 1.15, delta);
      control.elevation = MathUtils.damp(control.elevation, auto.elevation, DEBUG_VIEW_ENABLED ? 0.95 : 1.15, delta);
      control.lookHeight = MathUtils.damp(control.lookHeight, auto.lookHeight, DEBUG_VIEW_ENABLED ? 0.95 : 1.1, delta);
      control.focusOffsetX = MathUtils.damp(control.focusOffsetX, 0, 1.2, delta);
      control.focusOffsetZ = MathUtils.damp(control.focusOffsetZ, 0, 1.2, delta);

      const angleDelta = Math.abs(wrapAngle(auto.angle - control.angle));
      const scalarDelta =
        Math.abs(control.distance - auto.distance) +
        Math.abs(control.elevation - auto.elevation) +
        Math.abs(control.lookHeight - auto.lookHeight) +
        Math.abs(control.focusOffsetX) +
        Math.abs(control.focusOffsetZ);
      if (angleDelta < 0.04 && scalarDelta < 1.3 && !pointerDragRef.current.dragging) {
        modeRef.current = 'auto';
      }
    }

    if (modeRef.current === 'auto') {
      control.angle = auto.angle;
      control.distance = auto.distance;
      control.elevation = auto.elevation;
      control.lookHeight = auto.lookHeight;
      control.focusOffsetX = 0;
      control.focusOffsetZ = 0;
    }

    clampCameraParams(control, radius, maxHeight);

    actual.angle = dampAngle(actual.angle, control.angle, DEBUG_VIEW_ENABLED ? 1.25 : 1.6, delta);
    actual.distance = MathUtils.damp(actual.distance, control.distance, DEBUG_VIEW_ENABLED ? 1.1 : 1.45, delta);
    actual.elevation = MathUtils.damp(actual.elevation, control.elevation, DEBUG_VIEW_ENABLED ? 1.15 : 1.5, delta);
    actual.lookHeight = MathUtils.damp(actual.lookHeight, control.lookHeight, DEBUG_VIEW_ENABLED ? 1.1 : 1.4, delta);
    actual.focusOffsetX = MathUtils.damp(actual.focusOffsetX, control.focusOffsetX, DEBUG_VIEW_ENABLED ? 1 : 1.35, delta);
    actual.focusOffsetZ = MathUtils.damp(actual.focusOffsetZ, control.focusOffsetZ, DEBUG_VIEW_ENABLED ? 1 : 1.35, delta);

    tmpRight.set(Math.cos(actual.angle), 0, Math.sin(actual.angle));
    tmpForward.set(-tmpRight.z, 0, tmpRight.x);
    tmpFocusOffset
      .copy(focusCenter)
      .addScaledVector(tmpRight, actual.focusOffsetX)
      .addScaledVector(tmpForward, actual.focusOffsetZ);

    const pointerAutoInfluence = modeRef.current === 'auto' ? (DEBUG_VIEW_ENABLED ? 0.14 : 0.22) : 0.08;
    desiredLookTarget
      .copy(tmpFocusOffset)
      .add(tmpLookOffset.set(pointerOffset.x * pointerAutoInfluence * 1.4, 0, 0));
    desiredLookTarget.y = actual.lookHeight + pointerOffset.y * pointerAutoInfluence * 0.9;

    tmpDir.set(Math.sin(actual.angle), 0, Math.cos(actual.angle));
    desiredPosition
      .copy(tmpFocusOffset)
      .addScaledVector(tmpDir, actual.distance)
      .setY(actual.elevation + (modeRef.current === 'auto' ? Math.cos(t * 0.14) * 0.08 : 0));

    desiredPosition.x = MathUtils.clamp(desiredPosition.x, -95, 95);
    desiredPosition.y = MathUtils.clamp(desiredPosition.y, 5.5, 42);
    desiredPosition.z = MathUtils.clamp(desiredPosition.z, -520, 52);
    desiredLookTarget.x = MathUtils.clamp(desiredLookTarget.x, -90, 90);
    desiredLookTarget.y = MathUtils.clamp(desiredLookTarget.y, 1.5, 34);
    desiredLookTarget.z = MathUtils.clamp(desiredLookTarget.z, -520, 48);

    if (smoothedCameraPosVec.lengthSq() === 0 && smoothedLookTargetVec.lengthSq() === 0) {
      smoothedCameraPosVec.copy(desiredPosition);
      smoothedLookTargetVec.copy(desiredLookTarget);
    }

    dampVec3(smoothedCameraPosVec, desiredPosition, modeRef.current === 'auto' ? 1.6 : 2.3, delta);
    dampVec3(smoothedLookTargetVec, desiredLookTarget, modeRef.current === 'auto' ? 1.5 : 2.15, delta);

    camera.position.copy(smoothedCameraPosVec);
    lookAtTarget.copy(smoothedLookTargetVec);
    camera.lookAt(lookAtTarget);
  });

  return null;
}
