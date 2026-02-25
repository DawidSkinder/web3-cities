import { Vector3 } from 'three';

export type SpineTransform = {
  position: [number, number, number];
  yaw: number;
  tangent: [number, number, number];
  normal: [number, number, number];
};

export type GrowthFieldNode = SpineTransform & {
  sequence: number;
  parentSequence: number | null;
};

type FlatNode = {
  x: number;
  z: number;
  parentSequence: number | null;
};

const BASE_SPACING = 4.25;
const MIN_CENTER_DISTANCE = 3.35;
const CANDIDATE_ANGLES = 20;
const CACHE: FlatNode[] = [];

function pseudoRandom(seed: number) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
  return x - Math.floor(x);
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

function normalizeXZ(x: number, z: number): [number, number] {
  const len = Math.hypot(x, z) || 1;
  return [x / len, z / len];
}

function ensureNodeCount(count: number) {
  while (CACHE.length < count) {
    const sequence = CACHE.length + 1;
    if (sequence === 1) {
      CACHE.push({ x: 0, z: 0, parentSequence: null });
      continue;
    }

    const existing = CACHE;
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < existing.length; i++) {
      cx += existing[i].x;
      cz += existing[i].z;
    }
    cx /= existing.length;
    cz /= existing.length;

    let best:
      | {
          x: number;
          z: number;
          parentSequence: number;
          score: number;
        }
      | null = null;

    const parentOrder: number[] = [];
    for (let i = existing.length - 1; i >= 0; i--) parentOrder.push(i);
    for (let i = 0; i < existing.length; i += 2) parentOrder.push(i);

    for (let pi = 0; pi < parentOrder.length; pi++) {
      const parentIndex = parentOrder[pi];
      const parent = existing[parentIndex];
      if (!parent) continue;

      const parentSeq = parentIndex + 1;
      const parentRadius = Math.hypot(parent.x - cx, parent.z - cz);
      const frontierBias = clamp01(parentRadius / (BASE_SPACING * (1.7 + Math.sqrt(existing.length) * 0.28)));
      const radialScales = [
        0.92 + frontierBias * 0.32,
        1.28 + frontierBias * 0.36,
        1.62 + frontierBias * 0.45
      ];

      for (let ring = 0; ring < radialScales.length; ring++) {
        const radius = BASE_SPACING * radialScales[ring];
        const jitter = (pseudoRandom(sequence * 97 + parentSeq * 17 + ring) - 0.5) * 0.18;
        const baseAngle =
          pseudoRandom(sequence * 131 + parentSeq * 19 + ring * 43) * Math.PI * 2 +
          jitter;

        for (let ai = 0; ai < CANDIDATE_ANGLES; ai++) {
          const angle =
            baseAngle +
            (ai / CANDIDATE_ANGLES) * Math.PI * 2 +
            (pseudoRandom(sequence * 151 + parentSeq * 29 + ai * 13) - 0.5) * 0.08;
          const x = parent.x + Math.cos(angle) * radius;
          const z = parent.z + Math.sin(angle) * radius;

          let minDist = Number.POSITIVE_INFINITY;
          let overlap = false;
          for (let j = 0; j < existing.length; j++) {
            const n = existing[j];
            const d = Math.hypot(x - n.x, z - n.z);
            if (d < MIN_CENTER_DISTANCE) {
              overlap = true;
              break;
            }
            if (d < minDist) minDist = d;
          }
          if (overlap) continue;

          const dx = x - cx;
          const dz = z - cz;
          const radial = Math.hypot(dx, dz);
          const targetRadial = BASE_SPACING * (1.0 + Math.sqrt(existing.length) * 0.58);
          const radialSpread = Math.abs(radial - targetRadial);
          const expansionScore = radial * 0.36;
          const spacingScore = Math.min(minDist, BASE_SPACING * 2.6) * 1.1;
          const centerPenalty = radialSpread * 0.22;
          const axisPenalty = Math.min(Math.abs(dx), Math.abs(dz)) * 0.04;
          const noise = (pseudoRandom(sequence * 211 + parentSeq * 37 + ai * 5 + ring * 7) - 0.5) * 0.6;

          const score = expansionScore + spacingScore - centerPenalty - axisPenalty + frontierBias * 0.55 + noise;

          if (!best || score > best.score) {
            best = { x, z, parentSequence: parentSeq, score };
          }
        }
      }
    }

    if (!best) {
      const r = BASE_SPACING * (1.2 + Math.sqrt(existing.length) * 0.65);
      const a = sequence * 2.3999632297;
      best = {
        x: cx + Math.cos(a) * r,
        z: cz + Math.sin(a) * r,
        parentSequence: Math.max(1, existing.length),
        score: 0
      };
    }

    CACHE.push({
      x: best.x,
      z: best.z,
      parentSequence: best.parentSequence
    });
  }
}

function getFlatNode(sequence: number): FlatNode {
  const seq = Math.max(1, Math.floor(sequence));
  ensureNodeCount(seq);
  return CACHE[seq - 1];
}

function getInterpolatedFlatPosition(sequence: number): { x: number; z: number; baseSeq: number; nextSeq: number; t: number } {
  const clamped = Math.max(1, sequence);
  const baseSeq = Math.floor(clamped);
  const nextSeq = Math.max(baseSeq, Math.ceil(clamped));
  const t = clamp01(clamped - baseSeq);
  const a = getFlatNode(baseSeq);
  const b = getFlatNode(nextSeq);
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    baseSeq,
    nextSeq,
    t
  };
}

function computeTransform(sequence: number): SpineTransform {
  const p = getInterpolatedFlatPosition(sequence);
  const prev = getInterpolatedFlatPosition(Math.max(1, sequence - 0.35));
  const next = getInterpolatedFlatPosition(sequence + 0.35);

  let tx = next.x - prev.x;
  let tz = next.z - prev.z;
  if (Math.hypot(tx, tz) < 0.0001) {
    const base = getFlatNode(p.baseSeq);
    const parent = base.parentSequence ? getFlatNode(base.parentSequence) : null;
    tx = parent ? base.x - parent.x : 0;
    tz = parent ? base.z - parent.z : -1;
  }
  const [nx, nz] = normalizeXZ(tx, tz);
  const tangent: [number, number, number] = [nx, 0, nz];
  const normal: [number, number, number] = [-nz, 0, nx];
  const yaw = Math.atan2(tangent[0], tangent[2]);

  return {
    position: [p.x, 0, p.z],
    yaw,
    tangent,
    normal
  };
}

export function getSpineTransformFromSequence(sequence: number): SpineTransform {
  return computeTransform(sequence);
}

export function getGrowthFieldNode(sequence: number): GrowthFieldNode {
  const seq = Math.max(1, Math.floor(sequence));
  const base = getFlatNode(seq);
  const transform = computeTransform(seq);
  return {
    sequence: seq,
    parentSequence: base.parentSequence,
    ...transform
  };
}

export function getSpineCameraAnchor(sequence: number) {
  const frontier = getSpineTransformFromSequence(sequence);
  const pos = new Vector3(...frontier.position);
  const tangent = new Vector3(...frontier.tangent);
  const normal = new Vector3(...frontier.normal);

  return { pos, tangent, normal };
}
