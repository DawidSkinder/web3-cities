import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, Vector3 } from 'three';
import { useBlockEventStore } from '../data/trades/blockEventStore';
import { getSpineTransformFromSequence } from './cityGrowthPath';
import { DEBUG_VIEW_ENABLED } from './viewFlags';

const lookAtTarget = new Vector3();
const desiredPosition = new Vector3();
const frontierPos = new Vector3();
const frontierTangent = new Vector3();
const frontierNormal = new Vector3();
const historyPos = new Vector3();
const corridorCenter = new Vector3();
const cameraBaseOffset = new Vector3();
const cameraPointerOffset = new Vector3();
const lookPointerOffset = new Vector3();
const latestTransformPos = new Vector3();
const latestTransformTangent = new Vector3();
const latestTransformNormal = new Vector3();
const historyTransformPos = new Vector3();

export function CameraRig() {
  const { camera, pointer } = useThree();
  const { latest } = useBlockEventStore();

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    const seq = latest?.sequence ?? 1;
    const recentHistoryDepth = DEBUG_VIEW_ENABLED ? 14 : 10;
    const historySeq = Math.max(1, seq - recentHistoryDepth);

    const latestTransform = getSpineTransformFromSequence(seq);
    const olderTransform = getSpineTransformFromSequence(historySeq);

    latestTransformPos.set(...latestTransform.position);
    latestTransformTangent.set(...latestTransform.tangent);
    latestTransformNormal.set(...latestTransform.normal);
    historyTransformPos.set(...olderTransform.position);

    frontierPos.copy(latestTransformPos);
    frontierTangent.copy(latestTransformTangent);
    frontierNormal.copy(latestTransformNormal);
    historyPos.copy(historyTransformPos);

    // Keep the latest frontier in view, but center framing on the recent corridor span.
    corridorCenter.copy(historyPos).lerp(frontierPos, 0.62);

    const pointerInfluence = DEBUG_VIEW_ENABLED ? 0.18 : 0.45;
    const drift = DEBUG_VIEW_ENABLED ? 0 : Math.sin(t * 0.15) * 0.22;
    const hover = DEBUG_VIEW_ENABLED ? 0.04 : Math.cos(t * 0.2) * 0.14;
    const side = DEBUG_VIEW_ENABLED ? 0.08 : Math.sin(t * 0.11) * 0.28;
    const cameraDistance = DEBUG_VIEW_ENABLED ? 14.5 : 13.2;
    const backOffset = DEBUG_VIEW_ENABLED ? -10.8 : -9.9;

    desiredPosition
      .copy(corridorCenter)
      .addScaledVector(frontierNormal, cameraDistance + side)
      .addScaledVector(frontierTangent, backOffset + drift)
      .add(
        cameraBaseOffset.set(
          0,
          DEBUG_VIEW_ENABLED ? 6.9 : 6.3,
          0
        )
      )
      .add(
        cameraPointerOffset.set(
          pointer.x * pointerInfluence,
          pointer.y * (DEBUG_VIEW_ENABLED ? 0.12 : 0.22) + hover,
          pointer.y * (DEBUG_VIEW_ENABLED ? 0.08 : 0.16)
        )
      );

    desiredPosition.x = MathUtils.clamp(desiredPosition.x, -42, 42);
    desiredPosition.y = MathUtils.clamp(desiredPosition.y, 4.2, 13.5);
    desiredPosition.z = MathUtils.clamp(desiredPosition.z, -240, 22);

    camera.position.x = MathUtils.damp(camera.position.x, desiredPosition.x, 2.4, delta);
    camera.position.y = MathUtils.damp(camera.position.y, desiredPosition.y, 2.2, delta);
    camera.position.z = MathUtils.damp(camera.position.z, desiredPosition.z, 2.4, delta);

    lookAtTarget
      .copy(corridorCenter)
      .addScaledVector(frontierTangent, 0.7)
      .addScaledVector(frontierNormal, DEBUG_VIEW_ENABLED ? -0.15 : -0.25)
      .setY((DEBUG_VIEW_ENABLED ? 1.45 : 1.25) + pointer.y * (DEBUG_VIEW_ENABLED ? 0.06 : 0.12))
      .add(lookPointerOffset.set(pointer.x * (DEBUG_VIEW_ENABLED ? 0.12 : 0.24), 0, 0));

    lookAtTarget.x = MathUtils.clamp(lookAtTarget.x, -38, 38);
    lookAtTarget.y = MathUtils.clamp(lookAtTarget.y, 0.6, 7.5);
    lookAtTarget.z = MathUtils.clamp(lookAtTarget.z, -240, 18);

    camera.lookAt(lookAtTarget);
  });

  return null;
}
