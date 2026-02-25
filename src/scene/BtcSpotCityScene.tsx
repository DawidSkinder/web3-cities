import { Canvas } from '@react-three/fiber';
import { Color, FogExp2 } from 'three';
import { CameraRig } from './CameraRig';
import { PlaceholderCity } from './PlaceholderCity';
import { DEBUG_VIEW_ENABLED } from './viewFlags';

function Atmosphere() {
  const fogDensity = DEBUG_VIEW_ENABLED ? 0.02 : 0.03;
  return (
    <>
      <color attach="background" args={['#05070b']} />
      <fogExp2 attach="fog" args={['#06080c', fogDensity]} />
      <hemisphereLight
        args={['#7e99b8', '#090c11', DEBUG_VIEW_ENABLED ? 0.4 : 0.32]}
        position={[0, 10, 0]}
      />
      <ambientLight intensity={DEBUG_VIEW_ENABLED ? 0.28 : 0.2} color="#90a6bc" />
      <directionalLight
        color="#c4d4e6"
        intensity={DEBUG_VIEW_ENABLED ? 0.9 : 0.68}
        position={[12, 14, 10]}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight
        color="#49a6ff"
        intensity={DEBUG_VIEW_ENABLED ? 18 : 14}
        distance={18}
        position={[0, 1.4, 0]}
      />
      <pointLight
        color="#7bb8ff"
        intensity={DEBUG_VIEW_ENABLED ? 2.4 : 1.8}
        distance={120}
        position={[4, 8, -34]}
      />
      <pointLight
        color="#7d8cff"
        intensity={DEBUG_VIEW_ENABLED ? 1.8 : 1.2}
        distance={160}
        position={[-18, 10, -72]}
      />
    </>
  );
}

export function BtcSpotCityScene() {
  return (
    <Canvas
      camera={{
        position: [12.4, 6.6, 14.6],
        fov: DEBUG_VIEW_ENABLED ? 50 : 48,
        near: 0.1,
        far: 320
      }}
      dpr={[1, 2]}
      shadows
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      }}
      onCreated={({ scene, gl }) => {
        scene.background = new Color('#05070b');
        scene.fog = new FogExp2('#06080c', DEBUG_VIEW_ENABLED ? 0.02 : 0.03);
        gl.setClearColor('#05070b', 1);
      }}
    >
      <Atmosphere />
      <CameraRig />
      <PlaceholderCity />
    </Canvas>
  );
}
