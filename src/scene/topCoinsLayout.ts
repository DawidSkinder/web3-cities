export type TopCoinsLayoutNode = {
  symbol: string;
  districtId: number;
  radius: number;
  x: number;
  z: number;
  homeX: number;
  homeZ: number;
};

export type TopCoinsLayoutResult = {
  targets: Map<string, { districtId: number; x: number; z: number }>;
  layoutIters: number;
  minSeparation: number;
  overlapFix: 'ok' | 'iterating';
  cityRadius: number;
};

const TOP_LAYOUT_PADDING = 8;
const TOP_LAYOUT_INITIAL_ITERS = 64;
const TOP_LAYOUT_REFRESH_ITERS = 20;
const TOP_LAYOUT_INNER_RADIUS = 8;
const TOP_LAYOUT_EDGE_PAD = 6.6;

export function hashString32(value: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hashUnitString(value: string, salt: number) {
  const h = hashString32(`${value}:${salt}`);
  return (h % 1_000_000) / 1_000_000;
}

function clampNodeToCity(node: TopCoinsLayoutNode, cityRadius: number) {
  const minRadius = Math.max(3.6, TOP_LAYOUT_INNER_RADIUS * 0.18);
  const maxRadius = Math.max(minRadius + 2, cityRadius - TOP_LAYOUT_EDGE_PAD);
  const radius = Math.max(minRadius, Math.min(maxRadius, Math.hypot(node.x, node.z)));
  const angle = Math.atan2(node.z, node.x);
  node.x = Math.cos(angle) * radius;
  node.z = Math.sin(angle) * radius;
}

export function solveTopCoinsLayout(nodes: TopCoinsLayoutNode[], hasExisting: boolean): TopCoinsLayoutResult {
  const maxNominalRadius = nodes.reduce((acc, node) => Math.max(acc, Math.hypot(node.homeX, node.homeZ) + node.radius), 0);
  let cityRadius = Math.max(86, maxNominalRadius + 80 + Math.sqrt(Math.max(1, nodes.length)) * 0.8);

  const dispX = new Array(nodes.length).fill(0);
  const dispZ = new Array(nodes.length).fill(0);
  const baseIterations = hasExisting ? TOP_LAYOUT_REFRESH_ITERS : TOP_LAYOUT_INITIAL_ITERS;
  let minSeparation = Number.POSITIVE_INFINITY;
  let overlapFix: 'ok' | 'iterating' = 'iterating';
  let layoutIters = 0;

  for (let attempt = 0; attempt < 6; attempt++) {
    for (const node of nodes) {
      clampNodeToCity(node, cityRadius);
    }

    const iterations = baseIterations + attempt * 8;
    for (let iter = 0; iter < iterations; iter++) {
      dispX.fill(0);
      dispZ.fill(0);
      let overlapCount = 0;
      let minSepIter = Number.POSITIVE_INFINITY;

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const dist = Math.hypot(dx, dz);
          const minDist = a.radius + b.radius + TOP_LAYOUT_PADDING;
          minSepIter = Math.min(minSepIter, dist - minDist);
          if (dist >= minDist) continue;

          overlapCount += 1;
          const push = (minDist - dist) * 0.5;
          let nx = 0;
          let nz = 0;
          if (dist > 0.0001) {
            nx = dx / dist;
            nz = dz / dist;
          } else {
            const aSeed = hashUnitString(`${a.symbol}|${b.symbol}`, 9071) * Math.PI * 2;
            nx = Math.cos(aSeed);
            nz = Math.sin(aSeed);
          }

          dispX[i] -= nx * push;
          dispZ[i] -= nz * push;
          dispX[j] += nx * push;
          dispZ[j] += nz * push;
        }
      }

      minSeparation = minSepIter;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const homePull = hasExisting ? 0.08 : 0.05;
        node.x += dispX[i] * 0.82 + (node.homeX - node.x) * homePull;
        node.z += dispZ[i] * 0.82 + (node.homeZ - node.z) * homePull;
        clampNodeToCity(node, cityRadius);
      }

      layoutIters += 1;
      if (overlapCount === 0 && iter >= 2) {
        overlapFix = 'ok';
        break;
      }
    }

    if (minSeparation >= -0.01) {
      overlapFix = 'ok';
      break;
    }

    cityRadius *= 1.14;
  }

  if (!Number.isFinite(minSeparation)) minSeparation = 0;

  const targets = new Map<string, { districtId: number; x: number; z: number }>();
  for (const node of nodes) {
    targets.set(node.symbol, {
      districtId: node.districtId,
      x: node.x,
      z: node.z
    });
  }

  return {
    targets,
    layoutIters,
    minSeparation,
    overlapFix,
    cityRadius
  };
}
