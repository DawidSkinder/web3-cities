import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { MathUtils, Vector2, Vector3 } from 'three';
import { useCitySceneStore } from './citySceneStore';
import { RUNTIME_QUALITY_CONFIG } from './runtimeQuality';
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
const boundsCenterVec = new Vector3();
const frontierVec = new Vector3();
const focusCenter = new Vector3();
const tmpRight = new Vector3();
const tmpForward = new Vector3();
const tmpDir = new Vector3();
const tmpFocusOffset = new Vector3();
const tmpLookOffset = new Vector3();
const pointerOffset = new Vector2();

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

function copyState(dst: OrbitalState, src: OrbitalState) {
  dst.angle = src.angle;
  dst.distance = src.distance;
  dst.elevation = src.elevation;
  dst.lookHeight = src.lookHeight;
  dst.focusOffsetX = src.focusOffsetX;
  dst.focusOffsetZ = src.focusOffsetZ;
}

function clampCameraParams(state: OrbitalState, radius: number, maxHeight: number) {
  const minDistance = 10;
  const maxDistance = Math.max(34, radius * 3.6 + maxHeight * 1.2 + 22);
  state.distance = MathUtils.clamp(state.distance, minDistance, maxDistance);
  state.elevation = MathUtils.clamp(state.elevation, 6.5, Math.max(18, maxHeight + radius * 0.3 + 10));
  state.lookHeight = MathUtils.clamp(state.lookHeight, 1.2, Math.max(20, maxHeight + 6));
  state.focusOffsetX = MathUtils.clamp(state.focusOffsetX, -30, 30);
  state.focusOffsetZ = MathUtils.clamp(state.focusOffsetZ, -30, 30);
}

export function CameraRigV2() {
  const { camera, gl } = useThree();
  const { bounds } = useCitySceneStore();

  const initializedRef = useRef(false);
  const modeRef = useRef<CameraMode>('auto');
  const lastInteractionAtRef = useRef(0);
  const idleDelayMsRef = useRef((DEBUG_VIEW_ENABLED ? 9000 : 6000) * (RUNTIME_QUALITY_CONFIG.reducedMotion ? 1.3 : 1));

  const actualStateRef = useRef<OrbitalState>({
    angle: 0,
    distance: 28,
    elevation: 12,
    lookHeight: 5,
    focusOffsetX: 0,
    focusOffsetZ: 0
  });
  const controlTargetRef = useRef<OrbitalState>({
    angle: 0,
    distance: 28,
    elevation: 12,
    lookHeight: 5,
    focusOffsetX: 0,
    focusOffsetZ: 0
  });
  const autoTargetRef = useRef<OrbitalState>({
    angle: 0,
    distance: 28,
    elevation: 12,
    lookHeight: 5,
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
      if (event.button !== 0 && event.button !== 2) return;
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
      if (!drag.dragging || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;

      const control = controlTargetRef.current;
      const precision = keyStateRef.current.ShiftLeft || keyStateRef.current.ShiftRight ? 0.45 : 1;
      if (drag.button === 0 && !event.shiftKey) {
        control.angle = wrapAngle(control.angle - dx * 0.0042 * precision);
        control.elevation += dy * -0.03 * precision;
        control.lookHeight += dy * -0.018 * precision;
      } else {
        const panScale = 0.022 * precision * Math.max(0.7, control.distance / 20);
        control.focusOffsetX += dx * panScale;
        control.focusOffsetZ += dy * panScale;
      }

      markInteraction();
      event.preventDefault();
    };

    const endDrag = (event: PointerEvent) => {
      const drag = pointerDragRef.current;
      if (drag.pointerId !== event.pointerId) return;
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

    const onContextMenu = (event: MouseEvent) => event.preventDefault();

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

    const radius = Math.max(18, bounds?.radius ?? 28);
    const maxHeight = Math.max(8, bounds?.maxY ?? 14);
    boundsCenterVec.set(bounds?.centerX ?? 0, 0, bounds?.centerZ ?? 0);
    frontierVec.set(bounds?.frontierX ?? boundsCenterVec.x, 0, bounds?.frontierZ ?? boundsCenterVec.z);

    const focusBias = MathUtils.clamp(0.08 + radius / 400, 0.08, 0.16);
    desiredLookTarget.copy(boundsCenterVec).lerp(frontierVec, focusBias);
    dampVec3(smoothedFocusBaseRef.current, desiredLookTarget, DEBUG_VIEW_ENABLED ? 1.2 : 1.35, delta);
    focusCenter.copy(smoothedFocusBaseRef.current);

    const orbitSpeedScale = RUNTIME_QUALITY_CONFIG.cameraOrbitSpeedScale;
    const driftScale = RUNTIME_QUALITY_CONFIG.cameraDriftScale;
    const autoAngle =
      t * (DEBUG_VIEW_ENABLED ? 0.18 : 0.22) * orbitSpeedScale +
      Math.sin(t * 0.11 * orbitSpeedScale + 0.4) * (0.08 * driftScale);
    const autoDistance = MathUtils.clamp(16 + radius * 1.85 + maxHeight * 0.6, 22, 160);
    const autoElevation = MathUtils.clamp(8 + maxHeight * 0.85 + radius * 0.32, 10, 68);
    const autoLookHeight = MathUtils.clamp(2 + maxHeight * 0.52, 2.5, 44);

    if (!initializedRef.current) {
      initializedRef.current = true;
      lastInteractionAtRef.current = performance.now();
      autoTargetRef.current.angle = autoAngle;
      autoTargetRef.current.distance = autoDistance;
      autoTargetRef.current.elevation = autoElevation;
      autoTargetRef.current.lookHeight = autoLookHeight;
      copyState(controlTargetRef.current, autoTargetRef.current);
      copyState(actualStateRef.current, autoTargetRef.current);
      smoothedCameraPosVec.set(0, 0, 0);
      smoothedLookTargetVec.set(0, 0, 0);
    }

    autoTargetRef.current.angle = wrapAngle(autoAngle);
    autoTargetRef.current.distance = autoDistance;
    autoTargetRef.current.elevation = autoElevation;
    autoTargetRef.current.lookHeight = autoLookHeight;
    autoTargetRef.current.focusOffsetX = 0;
    autoTargetRef.current.focusOffsetZ = 0;

    const keys = keyStateRef.current;
    const anyMovementKey = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD || keys.KeyQ || keys.KeyE;
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

    if (modeRef.current === 'auto') {
      copyState(control, auto);
    }

    if (modeRef.current === 'user' || modeRef.current === 'returning') {
      const precision = keys.ShiftLeft || keys.ShiftRight ? 0.45 : 1;
      const orbitSpeed = (DEBUG_VIEW_ENABLED ? 0.7 : 0.95) * precision * Math.max(0.7, orbitSpeedScale);
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
      if (keys.KeyQ) control.distance = Math.max(8, control.distance - delta * zoomSpeed);
      if (keys.KeyE) control.distance += delta * zoomSpeed;
    }

    if (modeRef.current === 'returning') {
      control.angle = dampAngle(control.angle, auto.angle, DEBUG_VIEW_ENABLED ? 1.05 : 1.2, delta);
      control.distance = MathUtils.damp(control.distance, auto.distance, DEBUG_VIEW_ENABLED ? 1 : 1.2, delta);
      control.elevation = MathUtils.damp(control.elevation, auto.elevation, DEBUG_VIEW_ENABLED ? 1 : 1.2, delta);
      control.lookHeight = MathUtils.damp(control.lookHeight, auto.lookHeight, DEBUG_VIEW_ENABLED ? 1 : 1.15, delta);
      control.focusOffsetX = MathUtils.damp(control.focusOffsetX, 0, 1.3, delta);
      control.focusOffsetZ = MathUtils.damp(control.focusOffsetZ, 0, 1.3, delta);

      const angleDelta = Math.abs(wrapAngle(auto.angle - control.angle));
      const scalarDelta =
        Math.abs(control.distance - auto.distance) +
        Math.abs(control.elevation - auto.elevation) +
        Math.abs(control.lookHeight - auto.lookHeight) +
        Math.abs(control.focusOffsetX) +
        Math.abs(control.focusOffsetZ);
      if (angleDelta < 0.04 && scalarDelta < 1.4 && !pointerDragRef.current.dragging) {
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

    actual.angle = dampAngle(actual.angle, control.angle, DEBUG_VIEW_ENABLED ? 1.4 : 1.7, delta);
    actual.distance = MathUtils.damp(actual.distance, control.distance, DEBUG_VIEW_ENABLED ? 1.2 : 1.55, delta);
    actual.elevation = MathUtils.damp(actual.elevation, control.elevation, DEBUG_VIEW_ENABLED ? 1.2 : 1.55, delta);
    actual.lookHeight = MathUtils.damp(actual.lookHeight, control.lookHeight, DEBUG_VIEW_ENABLED ? 1.15 : 1.45, delta);
    actual.focusOffsetX = MathUtils.damp(actual.focusOffsetX, control.focusOffsetX, DEBUG_VIEW_ENABLED ? 1.05 : 1.4, delta);
    actual.focusOffsetZ = MathUtils.damp(actual.focusOffsetZ, control.focusOffsetZ, DEBUG_VIEW_ENABLED ? 1.05 : 1.4, delta);

    tmpRight.set(Math.cos(actual.angle), 0, Math.sin(actual.angle));
    tmpForward.set(-tmpRight.z, 0, tmpRight.x);
    tmpFocusOffset
      .copy(focusCenter)
      .addScaledVector(tmpRight, actual.focusOffsetX)
      .addScaledVector(tmpForward, actual.focusOffsetZ);

    const pointerInfluence =
      (modeRef.current === 'auto' ? (DEBUG_VIEW_ENABLED ? 0.12 : 0.18) : 0.07) *
      RUNTIME_QUALITY_CONFIG.pointerParallaxScale;

    desiredLookTarget
      .copy(tmpFocusOffset)
      .add(tmpLookOffset.set(pointerOffset.x * pointerInfluence * 1.5, 0, 0));
    desiredLookTarget.y = actual.lookHeight + pointerOffset.y * pointerInfluence * 0.9;

    tmpDir.set(Math.sin(actual.angle), 0, Math.cos(actual.angle));
    desiredPosition
      .copy(tmpFocusOffset)
      .addScaledVector(tmpDir, actual.distance)
      .setY(
        actual.elevation +
          (modeRef.current === 'auto'
            ? Math.cos(t * 0.16 * orbitSpeedScale) * (0.12 * RUNTIME_QUALITY_CONFIG.cameraDriftScale)
            : 0)
      );

    const clampRadius = Math.max(120, radius * 2.8 + 60);
    desiredPosition.x = MathUtils.clamp(desiredPosition.x, boundsCenterVec.x - clampRadius, boundsCenterVec.x + clampRadius);
    desiredPosition.z = MathUtils.clamp(desiredPosition.z, boundsCenterVec.z - clampRadius, boundsCenterVec.z + clampRadius);
    desiredPosition.y = MathUtils.clamp(desiredPosition.y, 6, Math.max(26, maxHeight + radius * 0.5 + 18));
    desiredLookTarget.x = MathUtils.clamp(desiredLookTarget.x, boundsCenterVec.x - clampRadius, boundsCenterVec.x + clampRadius);
    desiredLookTarget.z = MathUtils.clamp(desiredLookTarget.z, boundsCenterVec.z - clampRadius, boundsCenterVec.z + clampRadius);
    desiredLookTarget.y = MathUtils.clamp(desiredLookTarget.y, 1.5, Math.max(28, maxHeight + 10));

    if (smoothedCameraPosVec.lengthSq() === 0 && smoothedLookTargetVec.lengthSq() === 0) {
      smoothedCameraPosVec.copy(desiredPosition);
      smoothedLookTargetVec.copy(desiredLookTarget);
    }

    dampVec3(smoothedCameraPosVec, desiredPosition, modeRef.current === 'auto' ? 1.8 : 2.4, delta);
    dampVec3(smoothedLookTargetVec, desiredLookTarget, modeRef.current === 'auto' ? 1.65 : 2.2, delta);

    camera.position.copy(smoothedCameraPosVec);
    lookAtTarget.copy(smoothedLookTargetVec);
    camera.lookAt(lookAtTarget);
  });

  return null;
}
