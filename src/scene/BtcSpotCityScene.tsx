import { Canvas } from '@react-three/fiber';
import { Color, FogExp2 } from 'three';
import { CameraRig } from './CameraRig';
import { PlaceholderCity } from './PlaceholderCity';

function Atmosphere() {
  return (
    <>
      <color attach="background" args={['#040507']} />
      <fogExp2 attach="fog" args={['#05070a', 0.085]} />
      <hemisphereLight
        args={['#5e748f', '#06080b', 0.22]}
        position={[0, 10, 0]}
      />
      <ambientLight intensity={0.12} color="#7c94ad" />
      <directionalLight
        color="#9fb3c8"
        intensity={0.45}
        position={[8, 10, 6]}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight color="#49a6ff" intensity={10} distance={9} position={[0, 1.4, 0]} />
      <pointLight color="#5f6bff" intensity={0.7} distance={30} position={[-8, 6, -8]} />
    </>
  );
}

export function BtcSpotCityScene() {
  return (
    <Canvas
      camera={{ position: [6.5, 4.2, 8.5], fov: 42, near: 0.1, far: 80 }}
      dpr={[1, 2]}
      shadows
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      }}
      onCreated={({ scene, gl }) => {
        scene.background = new Color('#040507');
        gl.setClearColor('#040507', 1);
      }}
    >
      <Atmosphere />
      <CameraRig />
      <PlaceholderCity />
    </Canvas>
  );
}
