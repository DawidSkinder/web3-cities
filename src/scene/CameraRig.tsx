import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, Vector3 } from 'three';

const lookAtTarget = new Vector3();
const desiredPosition = new Vector3();

export function CameraRig() {
  const { camera, pointer } = useThree();

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    const drift = Math.sin(t * 0.17) * 0.35;

    desiredPosition.set(
      6.2 + pointer.x * 0.9 + Math.sin(t * 0.23) * 0.2,
      4.0 + pointer.y * 0.35 + Math.cos(t * 0.19) * 0.12,
      8.2 + drift
    );

    camera.position.x = MathUtils.damp(camera.position.x, desiredPosition.x, 2.8, delta);
    camera.position.y = MathUtils.damp(camera.position.y, desiredPosition.y, 2.4, delta);
    camera.position.z = MathUtils.damp(camera.position.z, desiredPosition.z, 2.8, delta);

    lookAtTarget.set(
      pointer.x * 0.45,
      0.55 + pointer.y * 0.2 + Math.sin(t * 0.31) * 0.04,
      0
    );

    camera.lookAt(lookAtTarget);
  });

  return null;
}
