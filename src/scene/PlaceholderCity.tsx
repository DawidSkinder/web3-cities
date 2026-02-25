import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type { InstancedMesh, Mesh } from 'three';
import { Color, Object3D } from 'three';
import { useBlockEventStore } from '../data/trades/blockEventStore';
import { ProceduralCityGrowth } from './ProceduralCityGrowth';
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

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
      <planeGeometry args={[420, 420]} />
      <meshStandardMaterial color="#07090d" roughness={1} metalness={0} />
    </mesh>
  );
}

function DepthColumns() {
  const columns = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const r = pseudoRandom(i + 100);
        const angle = (i / 16) * Math.PI * 2;
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
    []
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

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    refs.current.forEach((mesh, i) => {
      if (!mesh) {
        return;
      }
      mesh.position.x = Math.sin(t * (0.035 + i * 0.01) + i * 1.3) * (0.4 + i * 0.2);
      mesh.position.y = 1.2 + i * 1.65 + Math.cos(t * (0.05 + i * 0.015) + i) * 0.08;
    });
  });

  return (
    <group>
      {[
        { z: -18, y: 1.2, w: 95, h: 5.5, o: DEBUG_VIEW_ENABLED ? 0.085 : 0.06, c: '#0d1823' },
        { z: -58, y: 2.9, w: 135, h: 8.5, o: DEBUG_VIEW_ENABLED ? 0.075 : 0.05, c: '#0b1420' },
        { z: -118, y: 4.7, w: 180, h: 13, o: DEBUG_VIEW_ENABLED ? 0.065 : 0.04, c: '#09121d' }
      ].map((band, i) => (
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
      <Ground />
      <HazeBands />
      <DepthColumns />
      {showFallbackBackdrop ? <LegacyBackdropBlocks /> : null}
      <ProceduralCityGrowth />
    </group>
  );
}
