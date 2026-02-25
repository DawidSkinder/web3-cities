import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  MathUtils,
  PointLight,
  SRGBColorSpace,
  Vector3
} from 'three';
import { CameraRigV2 } from './CameraRigV2';
import { clearHoveredTowerInstance, useCitySceneStore } from './citySceneStore';
import { HoloCitySystemV3 } from './HoloCitySystemV3';
import { RUNTIME_QUALITY_CONFIG } from './runtimeQuality';
import { DEBUG_VIEW_ENABLED } from './viewFlags';

function Atmosphere() {
  const lightScale =
    RUNTIME_QUALITY_CONFIG.tier === 'low' ? 0.92 : RUNTIME_QUALITY_CONFIG.tier === 'medium' ? 1 : 1.04;
  return (
    <>
      <color attach="background" args={['#05070b']} />
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

function AdaptiveExposureLights() {
  const { bounds } = useCitySceneStore();
  const ambientRef = useRef<AmbientLight>(null);
  const rimRef = useRef<DirectionalLight>(null);
  const topRef = useRef<DirectionalLight>(null);
  const corridorFillRef = useRef<PointLight>(null);

  useFrame((_, delta) => {
    const radius = Math.max(16, bounds?.radius ?? 18);
    const maxY = Math.max(8, bounds?.maxY ?? 10);
    const growth = MathUtils.clamp((radius - 18) / 220 + (maxY - 8) / 46, 0, 1);
    const debugBoost = DEBUG_VIEW_ENABLED ? 1.15 : 1;
    const tierScale =
      RUNTIME_QUALITY_CONFIG.tier === 'low' ? 0.92 : RUNTIME_QUALITY_CONFIG.tier === 'medium' ? 1 : 1.06;

    const targetAmbient = (0.05 + growth * 0.1) * debugBoost * tierScale;
    const targetRim = (0.22 + growth * 0.28) * debugBoost;
    const targetTop = (0.18 + growth * 0.22) * debugBoost;
    const targetCorridorFill = (0.45 + growth * 0.75) * debugBoost;

    if (ambientRef.current) {
      ambientRef.current.intensity = MathUtils.damp(ambientRef.current.intensity, targetAmbient, 1.35, delta);
    }
    if (rimRef.current) {
      rimRef.current.intensity = MathUtils.damp(rimRef.current.intensity, targetRim, 1.35, delta);
    }
    if (topRef.current) {
      topRef.current.intensity = MathUtils.damp(topRef.current.intensity, targetTop, 1.35, delta);
    }
    if (corridorFillRef.current) {
      corridorFillRef.current.intensity = MathUtils.damp(corridorFillRef.current.intensity, targetCorridorFill, 1.35, delta);
      corridorFillRef.current.position.set(
        MathUtils.clamp((bounds?.frontierX ?? 0) * 0.28, -34, 34),
        9 + Math.min(10, maxY * 0.14),
        MathUtils.clamp((bounds?.frontierZ ?? -40) + 26, -320, 36)
      );
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.05} color="#c6d8ea" />
      <directionalLight ref={rimRef} color="#f2fbff" intensity={0.22} position={[-26, 30, -120]} />
      <directionalLight ref={topRef} color="#9fd6ff" intensity={0.18} position={[10, 46, -44]} />
      <pointLight ref={corridorFillRef} color="#7fd0ff" intensity={0.45} distance={260} position={[0, 10, -32]} />
    </>
  );
}

const tempBoundsCenter = new Vector3();

function AdaptiveRendererExposure() {
  const { bounds } = useCitySceneStore();
  const exposureRef = useRef(1.04);

  useFrame(({ gl, camera }, delta) => {
    const radius = Math.max(18, bounds?.radius ?? 18);
    const maxY = Math.max(8, bounds?.maxY ?? 10);
    tempBoundsCenter.set(bounds?.centerX ?? 0, Math.min(12, maxY * 0.4), bounds?.centerZ ?? -30);
    const cameraDistance = camera.position.distanceTo(tempBoundsCenter);

    const cityGrowth = MathUtils.clamp((radius - 18) / 210 + (maxY - 8) / 52, 0, 1);
    const zoomOutFactor = MathUtils.clamp((cameraDistance - 22) / 80, 0, 1);
    const targetExposure = MathUtils.clamp(
      1.0 +
        cityGrowth * 0.2 +
        zoomOutFactor * 0.22 +
        (DEBUG_VIEW_ENABLED ? 0.06 : 0) +
        (RUNTIME_QUALITY_CONFIG.tier === 'low' ? 0.03 : 0),
      0.92,
      1.36
    );

    exposureRef.current = MathUtils.damp(exposureRef.current, targetExposure, 1.15, delta);
    gl.toneMappingExposure = exposureRef.current;
  });

  return null;
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
        scene.fog = null;
        gl.outputColorSpace = SRGBColorSpace;
        gl.toneMapping = ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.04;
        gl.setClearColor('#05070b', 1);
      }}
    >
      <Atmosphere />
      <AdaptiveRendererExposure />
      <AdaptiveExposureLights />
      <CameraRigV2 />
      <HoloCitySystemV3 />
    </Canvas>
  );
}
