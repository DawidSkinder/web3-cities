import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type { Group, InstancedMesh, Mesh } from 'three';
import { Color, Object3D } from 'three';

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

function CityBlocks() {
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

function FloatingBeacon() {
  const groupRef = useRef<Group>(null);
  const coreRef = useRef<Mesh>(null);

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    const core = coreRef.current;
    if (!group || !core) {
      return;
    }

    const t = clock.getElapsedTime();
    group.position.y = 1.05 + Math.sin(t * 0.75) * 0.12;
    group.rotation.y += delta * 0.22;
    core.rotation.y = -t * 0.5;
    core.rotation.x = Math.sin(t * 0.3) * 0.18;
  });

  return (
    <group ref={groupRef} position={[0, 1.05, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.68, 0.03, 18, 80]} />
        <meshBasicMaterial color="#1e4a73" transparent opacity={0.75} />
      </mesh>

      <mesh ref={coreRef} castShadow>
        <icosahedronGeometry args={[0.36, 1]} />
        <meshStandardMaterial
          color="#070b10"
          roughness={0.15}
          metalness={0.35}
          emissive="#3f9fff"
          emissiveIntensity={1.25}
        />
      </mesh>

      <mesh position={[0, -0.52, 0]} receiveShadow>
        <cylinderGeometry args={[0.18, 0.22, 0.4, 32]} />
        <meshStandardMaterial color="#0a0d12" metalness={0.35} roughness={0.8} />
      </mesh>
    </group>
  );
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
      <planeGeometry args={[80, 80]} />
      <meshStandardMaterial color="#050608" roughness={1} metalness={0} />
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

export function PlaceholderCity() {
  return (
    <group>
      <Ground />
      <DepthColumns />
      <CityBlocks />
      <FloatingBeacon />
    </group>
  );
}
