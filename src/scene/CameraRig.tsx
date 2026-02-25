import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, Vector3 } from 'three';
import { useBlockEventStore } from '../data/trades/blockEventStore';
import { getSpineCameraAnchor } from './cityGrowthPath';

const lookAtTarget = new Vector3();
const desiredPosition = new Vector3();
const frontierPos = new Vector3();
const frontierTangent = new Vector3();
const frontierNormal = new Vector3();

export function CameraRig() {
  const { camera, pointer } = useThree();
  const { latest } = useBlockEventStore();

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    const seq = latest?.sequence ?? 1;
    const anchor = getSpineCameraAnchor(seq);
    frontierPos.copy(anchor.pos);
    frontierTangent.copy(anchor.tangent);
    frontierNormal.copy(anchor.normal);

    const drift = Math.sin(t * 0.17) * 0.32;
    const hover = Math.cos(t * 0.21) * 0.18;
    const side = Math.sin(t * 0.13) * 0.45;

    desiredPosition
      .copy(frontierPos)
      .addScaledVector(frontierNormal, 10.5 + side)
      .addScaledVector(frontierTangent, -8.7 + drift)
      .add(new Vector3(pointer.x * 0.7, 5.8 + pointer.y * 0.35 + hover, pointer.y * 0.25));

    camera.position.x = MathUtils.damp(camera.position.x, desiredPosition.x, 2.8, delta);
    camera.position.y = MathUtils.damp(camera.position.y, desiredPosition.y, 2.4, delta);
    camera.position.z = MathUtils.damp(camera.position.z, desiredPosition.z, 2.8, delta);

    lookAtTarget
      .copy(frontierPos)
      .addScaledVector(frontierTangent, -2.6)
      .setY(1.05 + pointer.y * 0.16 + Math.sin(t * 0.31) * 0.05)
      .add(new Vector3(pointer.x * 0.35, 0, 0));

    camera.lookAt(lookAtTarget);
  });

  return null;
}
