import { Vector3 } from 'three';

export type SpineTransform = {
  position: [number, number, number];
  yaw: number;
  tangent: [number, number, number];
  normal: [number, number, number];
};

function pointAtIndex(index: number): [number, number, number] {
  const i = Math.max(0, index);
  const forward = i * 1.72;
  const lateral = Math.sin(i * 0.46) * (2.1 + i * 0.08) + Math.sin(i * 0.14) * 1.05;
  const subtleWave = Math.cos(i * 0.28) * 1.05;

  return [lateral, 0, -forward + subtleWave];
}

function normalizeXZ(x: number, z: number): [number, number, number] {
  const len = Math.hypot(x, z) || 1;
  return [x / len, 0, z / len];
}

export function getSpineTransformFromSequence(sequence: number): SpineTransform {
  const index = Math.max(0, sequence - 1);
  const p = pointAtIndex(index);
  const pPrev = pointAtIndex(index - 0.25);
  const pNext = pointAtIndex(index + 0.25);

  const tangent = normalizeXZ(pNext[0] - pPrev[0], pNext[2] - pPrev[2]);
  const normal = normalizeXZ(-tangent[2], tangent[0]);
  const yaw = Math.atan2(tangent[0], tangent[2]);

  return {
    position: p,
    yaw,
    tangent,
    normal
  };
}

export function getSpineCameraAnchor(sequence: number) {
  const frontier = getSpineTransformFromSequence(sequence);
  const pos = new Vector3(...frontier.position);
  const tangent = new Vector3(...frontier.tangent);
  const normal = new Vector3(...frontier.normal);

  return { pos, tangent, normal };
}
