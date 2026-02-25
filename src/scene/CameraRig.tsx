import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
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
const centerTransformPos = new Vector3();
const desiredLookTarget = new Vector3();
const smoothedLookTargetVec = new Vector3();
const smoothedCameraPosVec = new Vector3();

function dampVec3(current: Vector3, target: Vector3, lambda: number, delta: number) {
  current.x = MathUtils.damp(current.x, target.x, lambda, delta);
  current.y = MathUtils.damp(current.y, target.y, lambda, delta);
  current.z = MathUtils.damp(current.z, target.z, lambda, delta);
}

export function CameraRig() {
  const { camera, pointer } = useThree();
  const { events, latest } = useBlockEventStore();
  const initializedRef = useRef(false);
  const smoothedFrontierSeqRef = useRef(1);
  const smoothedCenterSeqRef = useRef(1);
  const smoothedHeightSignalRef = useRef(0.5);

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
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

    if (!initializedRef.current) {
      initializedRef.current = true;
      smoothedFrontierSeqRef.current = targetFrontierSeq;
      smoothedCenterSeqRef.current = targetCenterSeq;
      smoothedHeightSignalRef.current = targetHeightSignal;
    }

    const seqFollowDamping = DEBUG_VIEW_ENABLED ? 1.15 : 1.35;
    const seqCenterDamping = DEBUG_VIEW_ENABLED ? 1.05 : 1.2;
    smoothedFrontierSeqRef.current = MathUtils.damp(
      smoothedFrontierSeqRef.current,
      targetFrontierSeq,
      seqFollowDamping,
      delta
    );
    smoothedCenterSeqRef.current = MathUtils.damp(
      smoothedCenterSeqRef.current,
      targetCenterSeq,
      seqCenterDamping,
      delta
    );
    smoothedHeightSignalRef.current = MathUtils.damp(
      smoothedHeightSignalRef.current,
      targetHeightSignal,
      DEBUG_VIEW_ENABLED ? 1.1 : 1.35,
      delta
    );

    const smoothedFrontierSeq = smoothedFrontierSeqRef.current;
    const smoothedCenterSeq = smoothedCenterSeqRef.current;
    const historySpan = DEBUG_VIEW_ENABLED ? 13 : 10;
    const historySeq = Math.max(1, smoothedFrontierSeq - historySpan);

    const latestTransform = getSpineTransformFromSequence(smoothedFrontierSeq);
    const centerTransform = getSpineTransformFromSequence(smoothedCenterSeq);
    const olderTransform = getSpineTransformFromSequence(historySeq);

    latestTransformPos.set(...latestTransform.position);
    latestTransformTangent.set(...latestTransform.tangent);
    latestTransformNormal.set(...latestTransform.normal);
    centerTransformPos.set(...centerTransform.position);
    historyTransformPos.set(...olderTransform.position);

    frontierPos.copy(latestTransformPos);
    frontierTangent.copy(latestTransformTangent);
    frontierNormal.copy(latestTransformNormal);
    historyPos.copy(historyTransformPos);

    // Keep both the frontier and recent history in frame with a stable corridor anchor.
    corridorCenter
      .copy(historyPos)
      .lerp(centerTransformPos, 0.52)
      .lerp(frontierPos, 0.18);

    const heightSignal = smoothedHeightSignalRef.current;
    const pointerInfluence = DEBUG_VIEW_ENABLED ? 0.14 : 0.22;
    const drift = DEBUG_VIEW_ENABLED ? 0 : Math.sin(t * 0.1) * 0.14;
    const hover = DEBUG_VIEW_ENABLED ? 0.02 : Math.cos(t * 0.15) * 0.08;
    const side = DEBUG_VIEW_ENABLED ? 0.06 : Math.sin(t * 0.09) * 0.18;
    const cameraDistance = (DEBUG_VIEW_ENABLED ? 20.5 : 18.8) + heightSignal * 2.2;
    const backOffset = (DEBUG_VIEW_ENABLED ? -15.8 : -14.1) - heightSignal * 1.05;
    const cameraElevation = (DEBUG_VIEW_ENABLED ? 10.2 : 9.2) + heightSignal * 1.9;

    desiredPosition
      .copy(corridorCenter)
      .addScaledVector(frontierNormal, cameraDistance + side)
      .addScaledVector(frontierTangent, backOffset + drift)
      .add(
        cameraBaseOffset.set(
          0,
          cameraElevation,
          0
        )
      )
      .add(
        cameraPointerOffset.set(
          pointer.x * pointerInfluence,
          pointer.y * (DEBUG_VIEW_ENABLED ? 0.08 : 0.12) + hover,
          pointer.y * (DEBUG_VIEW_ENABLED ? 0.05 : 0.08)
        )
      );

    desiredPosition.x = MathUtils.clamp(desiredPosition.x, -52, 52);
    desiredPosition.y = MathUtils.clamp(desiredPosition.y, 6.6, 22);
    desiredPosition.z = MathUtils.clamp(desiredPosition.z, -340, 34);

    desiredLookTarget
      .copy(corridorCenter)
      .addScaledVector(frontierTangent, 1.15)
      .addScaledVector(frontierNormal, DEBUG_VIEW_ENABLED ? -0.35 : -0.5)
      .setY((DEBUG_VIEW_ENABLED ? 3.9 : 3.35) + heightSignal * 1.8)
      .add(lookPointerOffset.set(pointer.x * (DEBUG_VIEW_ENABLED ? 0.08 : 0.12), 0, 0));

    desiredLookTarget.x = MathUtils.clamp(desiredLookTarget.x, -48, 48);
    desiredLookTarget.y = MathUtils.clamp(desiredLookTarget.y, 1.8, 18);
    desiredLookTarget.z = MathUtils.clamp(desiredLookTarget.z, -340, 30);

    if (initializedRef.current && smoothedCameraPosVec.lengthSq() === 0 && smoothedLookTargetVec.lengthSq() === 0) {
      smoothedCameraPosVec.copy(desiredPosition);
      smoothedLookTargetVec.copy(desiredLookTarget);
    }

    dampVec3(smoothedCameraPosVec, desiredPosition, DEBUG_VIEW_ENABLED ? 1.4 : 1.7, delta);
    dampVec3(smoothedLookTargetVec, desiredLookTarget, DEBUG_VIEW_ENABLED ? 1.3 : 1.6, delta);

    lookAtTarget.copy(smoothedLookTargetVec);
    camera.position.copy(smoothedCameraPosVec);
    camera.lookAt(lookAtTarget);
  });

  return null;
}
