import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type { InstancedMesh, Mesh } from 'three';
import { Color, Object3D } from 'three';
import { useBlockEventStore } from '../data/trades/blockEventStore';
import { ProceduralCityGrowth } from './ProceduralCityGrowth';
import { useCitySceneStore } from './citySceneStore';
import { RUNTIME_QUALITY_CONFIG } from './runtimeQuality';
import { DEBUG_VIEW_ENABLED } from './viewFlags';

type Block = {
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  emissive: string;
};

const temp = new Object3D();

function pseudoRandom(seed: number) {
  const x = Math.sin(seed * 18.371 + 7.23) * 43758.5453;
  return x - Math.floor(x);
}

function buildBlocks(): Block[] {
  const blocks: Block[] = [];
  const spread = 9;
  const step = 1.2;
  let seed = 1;

  for (let x = -spread; x <= spread; x++) {
    for (let z = -spread; z <= spread; z++) {
      if (Math.abs(x) < 2 && Math.abs(z) < 2) {
        continue;
      }

      const r1 = pseudoRandom(seed++);
      const r2 = pseudoRandom(seed++);
      const footprintX = 0.42 + r1 * 0.5;
      const footprintZ = 0.42 + r2 * 0.5;
      const height = 0.18 + Math.pow(pseudoRandom(seed++), 2.2) * 2.8;
      const y = height * 0.5 - 0.02;
      const accent = pseudoRandom(seed++) > 0.92;

      blocks.push({
        position: [x * step + (r1 - 0.5) * 0.15, y, z * step + (r2 - 0.5) * 0.15],
        scale: [footprintX, height, footprintZ],
        color: accent ? '#0f1318' : '#090b0f',
        emissive: accent ? '#17334d' : '#05080d'
      });
    }
  }

  return blocks;
}

function LegacyBackdropBlocks() {
  const meshRef = useRef<InstancedMesh>(null);
  const blocks = useMemo(buildBlocks, []);
  const color = useMemo(() => new Color(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }

    blocks.forEach((block, i) => {
      temp.position.set(...block.position);
      temp.scale.set(...block.scale);
      temp.rotation.set(0, 0, 0);
      temp.updateMatrix();
      mesh.setMatrixAt(i, temp.matrix);

      color.set(block.color);
      mesh.setColorAt(i, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [blocks, color]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, blocks.length]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color="#0d1015"
        vertexColors
        metalness={0.15}
        roughness={0.9}
        emissive="#0b1118"
        emissiveIntensity={0.12}
      />
    </instancedMesh>
  );
}

function GroundSystem() {
  const { bounds } = useCitySceneStore();
  const radius = Math.max(60, bounds?.radius ?? 110);
  const maxSpan = Math.max(420, radius * 6.2 + 140);
  const groundSize = Math.min(1800, maxSpan);
  const centerX = bounds?.centerX ?? 0;
  const centerZ = bounds ? bounds.centerZ * 0.82 + bounds.frontierZ * 0.18 : -48;
  const majorLaneLength = Math.min(groundSize * 0.84, Math.max(140, radius * 4.6));
  const majorLaneCross = Math.min(groundSize * 0.58, Math.max(90, radius * 2.9));
  const gridDivisions = Math.max(
    24,
    Math.min(96, Math.round((groundSize / (RUNTIME_QUALITY_CONFIG.tier === 'low' ? 8 : 6)) / 2) * 2)
  );

  return (
    <group position={[centerX, 0, centerZ]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
        <planeGeometry args={[groundSize, groundSize]} />
        <meshStandardMaterial color="#06080c" roughness={1} metalness={0.02} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.021, 0]}>
        <planeGeometry args={[groundSize * 0.98, groundSize * 0.98]} />
        <meshStandardMaterial
          color="#0a0f15"
          roughness={0.97}
          metalness={0.04}
          emissive="#101823"
          emissiveIntensity={DEBUG_VIEW_ENABLED ? 0.05 : 0.03}
          transparent
          opacity={0.72}
        />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.018, 0]}>
        <ringGeometry args={[Math.max(18, radius * 0.55), Math.min(groundSize * 0.46, radius * 2.25), 64]} />
        <meshBasicMaterial color="#0d1723" transparent opacity={DEBUG_VIEW_ENABLED ? 0.12 : 0.08} depthWrite={false} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.012, 0]}>
        <planeGeometry args={[1.8, majorLaneLength]} />
        <meshBasicMaterial color="#102131" transparent opacity={DEBUG_VIEW_ENABLED ? 0.22 : 0.16} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.011, 0]}>
        <planeGeometry args={[majorLaneCross, 1.5]} />
        <meshBasicMaterial color="#0f1e2c" transparent opacity={DEBUG_VIEW_ENABLED ? 0.18 : 0.12} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[0.12, majorLaneLength * 0.94]} />
        <meshBasicMaterial color="#6fcfff" transparent opacity={DEBUG_VIEW_ENABLED ? 0.35 : 0.24} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.009, 0]}>
        <planeGeometry args={[majorLaneCross * 0.9, 0.1]} />
        <meshBasicMaterial color="#8fd8ff" transparent opacity={DEBUG_VIEW_ENABLED ? 0.26 : 0.18} toneMapped={false} />
      </mesh>

      <gridHelper
        args={[groundSize * 0.96, gridDivisions, new Color('#172533'), new Color('#0f1722')]}
        position={[0, -0.014, 0]}
        material-transparent
        material-opacity={DEBUG_VIEW_ENABLED ? 0.22 : 0.15}
      />
    </group>
  );
}

function DepthColumns() {
  const columnCount = RUNTIME_QUALITY_CONFIG.tier === 'low' ? 10 : RUNTIME_QUALITY_CONFIG.tier === 'medium' ? 13 : 16;
  const columns = useMemo(
    () =>
      Array.from({ length: columnCount }, (_, i) => {
        const r = pseudoRandom(i + 100);
        const angle = (i / columnCount) * Math.PI * 2;
        const radius = 14 + r * 6;

        return {
          position: [Math.cos(angle) * radius, 2 + r * 3, Math.sin(angle) * radius] as [
            number,
            number,
            number
          ],
          height: 4 + r * 6,
          width: 0.5 + r * 1.6
        };
      }),
    [columnCount]
  );

  return (
    <group>
      {columns.map((column, index) => (
        <mesh key={index} position={column.position}>
          <boxGeometry args={[column.width, column.height, column.width]} />
          <meshStandardMaterial
            color="#06090d"
            emissive="#0a1622"
            emissiveIntensity={0.12}
            roughness={1}
            metalness={0}
            transparent
            opacity={0.32}
          />
        </mesh>
      ))}
    </group>
  );
}

function HazeBands() {
  const refs = useRef<Array<Mesh | null>>([]);
  const motionScale = RUNTIME_QUALITY_CONFIG.hazeMotionScale;
  const opacityScale = RUNTIME_QUALITY_CONFIG.hazeOpacityScale;
  const bandDefs = useMemo(
    () =>
      [
        { z: -18, y: 1.2, w: 95, h: 5.5, o: DEBUG_VIEW_ENABLED ? 0.085 : 0.06, c: '#0d1823' },
        { z: -58, y: 2.9, w: 135, h: 8.5, o: DEBUG_VIEW_ENABLED ? 0.075 : 0.05, c: '#0b1420' },
        { z: -118, y: 4.7, w: 180, h: 13, o: DEBUG_VIEW_ENABLED ? 0.065 : 0.04, c: '#09121d' }
      ]
        .slice(0, RUNTIME_QUALITY_CONFIG.hazeBandCount)
        .map((band) => ({
          ...band,
          o: band.o * opacityScale
        })),
    [opacityScale]
  );

  useFrame(({ clock }) => {
    if (motionScale <= 0.001) {
      return;
    }
    const t = clock.getElapsedTime();
    refs.current.forEach((mesh, i) => {
      if (!mesh) {
        return;
      }
      mesh.position.x =
        Math.sin(t * (0.035 + i * 0.01) * motionScale + i * 1.3) * ((0.4 + i * 0.2) * motionScale);
      mesh.position.y =
        1.2 +
        i * 1.65 +
        Math.cos(t * (0.05 + i * 0.015) * motionScale + i) * (0.08 * motionScale);
    });
  });

  return (
    <group>
      {bandDefs.map((band, i) => (
        <mesh
          key={i}
          ref={(node) => {
            refs.current[i] = node;
          }}
          position={[0, band.y, band.z]}
        >
          <planeGeometry args={[band.w, band.h]} />
          <meshBasicMaterial
            color={band.c}
            transparent
            opacity={band.o}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

export function PlaceholderCity() {
  const { events } = useBlockEventStore();
  const showFallbackBackdrop = events.length === 0;

  return (
    <group>
      <GroundSystem />
      <HazeBands />
      <DepthColumns />
      {showFallbackBackdrop ? <LegacyBackdropBlocks /> : null}
      <ProceduralCityGrowth />
    </group>
  );
}
