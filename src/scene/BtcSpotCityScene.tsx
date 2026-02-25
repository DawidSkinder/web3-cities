import { Canvas } from '@react-three/fiber';
import { Color, FogExp2 } from 'three';
import { CameraRig } from './CameraRig';
import { clearHoveredTowerInstance } from './citySceneStore';
import { PlaceholderCity } from './PlaceholderCity';
import { RUNTIME_QUALITY_CONFIG } from './runtimeQuality';
import { DEBUG_VIEW_ENABLED } from './viewFlags';

function Atmosphere() {
  const fogDensity = (DEBUG_VIEW_ENABLED ? 0.0175 : 0.024) * RUNTIME_QUALITY_CONFIG.fogDensityScale;
  const lightScale =
    RUNTIME_QUALITY_CONFIG.tier === 'low' ? 0.92 : RUNTIME_QUALITY_CONFIG.tier === 'medium' ? 1 : 1.04;
  return (
    <>
      <color attach="background" args={['#05070b']} />
      <fogExp2 attach="fog" args={['#06080c', fogDensity]} />
      <hemisphereLight
        args={['#7e99b8', '#090c11', (DEBUG_VIEW_ENABLED ? 0.4 : 0.32) * lightScale]}
        position={[0, 10, 0]}
      />
      <ambientLight intensity={(DEBUG_VIEW_ENABLED ? 0.28 : 0.2) * lightScale} color="#90a6bc" />
      <directionalLight
        color="#c4d4e6"
        intensity={(DEBUG_VIEW_ENABLED ? 0.9 : 0.68) * lightScale}
        position={[12, 14, 10]}
        castShadow={RUNTIME_QUALITY_CONFIG.shadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight color="#d8ecff" intensity={(DEBUG_VIEW_ENABLED ? 0.5 : 0.34) * lightScale} position={[-18, 28, -26]} />
      <directionalLight color="#7db9ff" intensity={(DEBUG_VIEW_ENABLED ? 0.42 : 0.28) * lightScale} position={[18, 20, -120]} />
      <pointLight
        color="#49a6ff"
        intensity={(DEBUG_VIEW_ENABLED ? 18 : 14) * lightScale}
        distance={18}
        position={[0, 1.4, 0]}
      />
      <pointLight
        color="#7bb8ff"
        intensity={(DEBUG_VIEW_ENABLED ? 2.4 : 1.8) * lightScale}
        distance={220}
        position={[4, 8, -34]}
      />
      <pointLight
        color="#7d8cff"
        intensity={(DEBUG_VIEW_ENABLED ? 1.8 : 1.2) * lightScale}
        distance={260}
        position={[-18, 10, -72]}
      />
      <pointLight
        color="#5bd2ff"
        intensity={(DEBUG_VIEW_ENABLED ? 1.35 : 0.8) * lightScale}
        distance={320}
        position={[14, 12, -160]}
      />
    </>
  );
}

export function BtcSpotCityScene() {
  return (
    <Canvas
      camera={{
        position: [12.4, 6.6, 14.6],
        fov: DEBUG_VIEW_ENABLED ? 54 : 52,
        near: 0.1,
        far: 420
      }}
      dpr={[1, RUNTIME_QUALITY_CONFIG.dprCap]}
      shadows={RUNTIME_QUALITY_CONFIG.shadows}
      gl={{
        antialias: RUNTIME_QUALITY_CONFIG.antialias,
        alpha: false,
        powerPreference: 'high-performance'
      }}
      onPointerMissed={() => {
        clearHoveredTowerInstance();
      }}
      onCreated={({ scene, gl }) => {
        scene.background = new Color('#05070b');
        scene.fog = new FogExp2(
          '#06080c',
          (DEBUG_VIEW_ENABLED ? 0.0175 : 0.024) * RUNTIME_QUALITY_CONFIG.fogDensityScale
        );
        gl.setClearColor('#05070b', 1);
      }}
    >
      <Atmosphere />
      <CameraRig />
      <PlaceholderCity />
    </Canvas>
  );
}
