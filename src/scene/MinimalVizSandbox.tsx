import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Group, Mesh } from 'three';
import { AdditiveBlending, ACESFilmicToneMapping, Color, MathUtils, SRGBColorSpace, Vector3 } from 'three';
import { useBlockEventStore } from '../data/trades/blockEventStore';
import type { BlockEvent } from '../data/trades/types';
import { RUNTIME_QUALITY_CONFIG } from './runtimeQuality';

type TowerDatum = {
  sequence: number;
  x: number;
  z: number;
  height: number;
  coreColor: string;
  glowColor: string;
  glowStrength: number;
  bandCount: 2 | 3 | 4;
  emittedAt: number;
};

type SandboxBounds = {
  radius: number;
  maxY: number;
};

type AccumState = {
  processedSequences: Set<number>;
  towers: TowerDatum[];
  lastSequence: number;
  bounds: SandboxBounds;
};

type CameraMode = 'auto' | 'user' | 'returning';

type OrbitState = {
  angle: number;
  distance: number;
  elevation: number;
  lookY: number;
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SPIRAL_STEP = 2.85;
const BASE_HEIGHT = 0.85;
const HEIGHT_SCALE = 15.5;
const MIN_HEIGHT = 0.7;
const MAX_HEIGHT = 22;
const TOWER_FOOTPRINT = 1.1;
const IDLE_DELAY_MS = 6000;
const BIRTH_RISE_MS = 900;
const BIRTH_GLOW_DELAY_MS = 150;
const BIRTH_GLOW_RAMP_MS = 700;
const BIRTH_OVERSHOOT = 1.18;
const GLOW_SHELL_SCALE = 1.022;
const GLOW_EDGE_SCALE = 1.034;
const GLOW_SHELL_OPACITY = 0.28;
const GLOW_EDGE_OPACITY = 0.8;
const BAND_OPACITY = 0.55;
const CROWN_OPACITY = 0.8;
const BTC_ORANGE = new Color('#F7931A');
const BTC_SELL_WARM = new Color('#F5F2E9');
const BTC_PALE_AMBER = new Color('#FFD8A2');
const CORE_GRAPHITE = new Color('#0c1016');
const CORE_GRAPHITE_HI = new Color('#171e27');

const desiredPosition = new Vector3();
const desiredTarget = new Vector3();
const smoothPosition = new Vector3();
const smoothTarget = new Vector3();
const tempDir = new Vector3();

function clampFinite(value: number, fallback: number, min?: number, max?: number) {
  const safe = Number.isFinite(value) ? value : fallback;
  return MathUtils.clamp(safe, min ?? safe, max ?? safe);
}

function easeOutCubic(t: number) {
  const x = MathUtils.clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

function easeOutBack(t: number, overshoot = 1.1) {
  const x = MathUtils.clamp(t, 0, 1);
  const c1 = overshoot;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function createEmptyAccum(): AccumState {
  return {
    processedSequences: new Set<number>(),
    towers: [],
    lastSequence: 0,
    bounds: {
      radius: 18,
      maxY: 10
    }
  };
}

function mapEventToTower(event: BlockEvent): TowerDatum {
  const idx = Math.max(0, Math.floor(event.sequence) - 1);
  const angle = idx * GOLDEN_ANGLE;
  const radius = Math.sqrt(idx) * SPIRAL_STEP;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;

  const intensity = MathUtils.clamp(clampFinite(event.metrics.intensity, 0), 0, 1);
  const totalVolume = Math.max(0, clampFinite(event.metrics.totalVolume, 0, 0, 10_000_000));
  const volumeSignal = MathUtils.clamp(Math.log1p(totalVolume * 100) / 6.4, 0, 1);
  const height = clampFinite(BASE_HEIGHT + (volumeSignal * 0.7 + intensity * 0.3) * HEIGHT_SCALE, 2, MIN_HEIGHT, MAX_HEIGHT);

  const dominance = MathUtils.clamp(clampFinite(event.metrics.imbalance, 0), -1, 1);
  const imbalance = Math.abs(dominance);
  const dominance01 = (dominance + 1) * 0.5;
  const glow = BTC_SELL_WARM.clone().lerp(BTC_PALE_AMBER, 0.38).lerp(BTC_ORANGE, dominance01);
  const core = CORE_GRAPHITE.clone().lerp(CORE_GRAPHITE_HI, 0.2 + imbalance * 0.22);
  const glowStrength = MathUtils.clamp(0.7 + intensity * 0.45 + imbalance * 0.55, 0.75, 1.55);
  const bandCount = (2 + Math.min(2, Math.floor(imbalance * 3))) as 2 | 3 | 4;

  return {
    sequence: event.sequence,
    x,
    z,
    height,
    coreColor: `#${core.getHexString()}`,
    glowColor: `#${glow.getHexString()}`,
    glowStrength,
    bandCount,
    emittedAt: Math.max(0, clampFinite(event.emittedAt, Date.now()))
  };
}

function useAppendOnlyTowers(events: BlockEvent[]) {
  const accumRef = useRef<AccumState>(createEmptyAccum());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const state = accumRef.current;

    if (events.length === 0) {
      if (state.lastSequence > 0) {
        accumRef.current = createEmptyAccum();
        setVersion((v) => v + 1);
      }
      return;
    }

    const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
    let appended = false;

    if (state.lastSequence > 0 && ordered[ordered.length - 1]?.sequence < state.lastSequence && ordered.length < 8) {
      accumRef.current = createEmptyAccum();
    }

    const target = accumRef.current;
    for (const event of ordered) {
      if (target.processedSequences.has(event.sequence)) continue;
      const tower = mapEventToTower(event);
      target.towers.push(tower);
      target.processedSequences.add(event.sequence);
      target.lastSequence = Math.max(target.lastSequence, event.sequence);
      target.bounds.radius = Math.max(target.bounds.radius, Math.hypot(tower.x, tower.z) + 8);
      target.bounds.maxY = Math.max(target.bounds.maxY, tower.height + 2.5);
      appended = true;
    }

    if (appended) {
      setVersion((v) => v + 1);
    }
  }, [events]);

  return {
    version,
    towers: accumRef.current.towers,
    bounds: accumRef.current.bounds
  };
}

function MinimalOrbitRig({ bounds }: { bounds: SandboxBounds }) {
  const { camera, gl } = useThree();
  const initializedRef = useRef(false);
  const modeRef = useRef<CameraMode>('auto');
  const lastInteractionRef = useRef(0);

  const actualRef = useRef<OrbitState>({ angle: 0, distance: 28, elevation: 12, lookY: 4 });
  const controlRef = useRef<OrbitState>({ angle: 0, distance: 28, elevation: 12, lookY: 4 });
  const autoRef = useRef<OrbitState>({ angle: 0, distance: 28, elevation: 12, lookY: 4 });

  const keysRef = useRef<Record<string, boolean>>({});
  const dragRef = useRef({ dragging: false, pointerId: -1, lastX: 0, lastY: 0 });

  useEffect(() => {
    const canvas = gl.domElement;

    const markInteraction = () => {
      lastInteractionRef.current = performance.now();
      if (modeRef.current !== 'user') modeRef.current = 'user';
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dragRef.current.dragging = true;
      dragRef.current.pointerId = event.pointerId;
      dragRef.current.lastX = event.clientX;
      dragRef.current.lastY = event.clientY;
      canvas.setPointerCapture?.(event.pointerId);
      markInteraction();
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag.dragging || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      const control = controlRef.current;
      const precision = keysRef.current.ShiftLeft || keysRef.current.ShiftRight ? 0.45 : 1;
      control.angle = control.angle - dx * 0.0042 * precision;
      control.elevation += dy * -0.035 * precision;
      control.lookY += dy * -0.016 * precision;
      markInteraction();
      event.preventDefault();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (dragRef.current.pointerId !== event.pointerId) return;
      dragRef.current.dragging = false;
      dragRef.current.pointerId = -1;
      canvas.releasePointerCapture?.(event.pointerId);
      markInteraction();
    };

    const onWheel = (event: WheelEvent) => {
      const control = controlRef.current;
      const precision = keysRef.current.ShiftLeft || keysRef.current.ShiftRight ? 0.55 : 1;
      control.distance += event.deltaY * 0.016 * precision;
      markInteraction();
      event.preventDefault();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      keysRef.current[event.code] = true;
      if (event.code === 'KeyR') {
        modeRef.current = 'returning';
        lastInteractionRef.current = performance.now();
        event.preventDefault();
        return;
      }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(event.code)) {
        markInteraction();
        event.preventDefault();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keysRef.current[event.code] = false;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [gl]);

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    const radius = Math.max(18, bounds.radius);
    const maxY = Math.max(8, bounds.maxY);
    const orbitScale = RUNTIME_QUALITY_CONFIG.cameraOrbitSpeedScale;
    const driftScale = RUNTIME_QUALITY_CONFIG.cameraDriftScale;

    const auto = autoRef.current;
    auto.angle = t * 0.18 * orbitScale + Math.sin(t * 0.1 * orbitScale) * (0.06 * driftScale);
    auto.distance = MathUtils.clamp(18 + radius * 1.65 + maxY * 0.55, 24, 170);
    auto.elevation = MathUtils.clamp(8 + maxY * 0.9 + radius * 0.22, 10, 72);
    auto.lookY = MathUtils.clamp(1.5 + maxY * 0.45, 2, 30);

    const keys = keysRef.current;
    const anyMovementKey = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD || keys.KeyQ || keys.KeyE;
    if (anyMovementKey) {
      modeRef.current = 'user';
      lastInteractionRef.current = performance.now();
    }

    if (modeRef.current === 'user') {
      const idleMs = performance.now() - lastInteractionRef.current;
      if (!dragRef.current.dragging && idleMs > IDLE_DELAY_MS) modeRef.current = 'returning';
    }

    const control = controlRef.current;
    const actual = actualRef.current;
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastInteractionRef.current = performance.now();
      control.angle = auto.angle;
      control.distance = auto.distance;
      control.elevation = auto.elevation;
      control.lookY = auto.lookY;
      actual.angle = auto.angle;
      actual.distance = auto.distance;
      actual.elevation = auto.elevation;
      actual.lookY = auto.lookY;
      smoothPosition.set(0, 0, 0);
      smoothTarget.set(0, 0, 0);
    }

    if (modeRef.current === 'auto') {
      control.angle = auto.angle;
      control.distance = auto.distance;
      control.elevation = auto.elevation;
      control.lookY = auto.lookY;
    }

    if (modeRef.current === 'user' || modeRef.current === 'returning') {
      const precision = keys.ShiftLeft || keys.ShiftRight ? 0.45 : 1;
      const orbitSpeed = 0.95 * precision * Math.max(0.7, orbitScale);
      const tiltSpeed = 7 * precision;
      const zoomSpeed = 12 * precision;
      if (keys.KeyA) control.angle += delta * orbitSpeed;
      if (keys.KeyD) control.angle -= delta * orbitSpeed;
      if (keys.KeyW) {
        control.elevation += delta * tiltSpeed;
        control.lookY += delta * tiltSpeed * 0.68;
      }
      if (keys.KeyS) {
        control.elevation -= delta * tiltSpeed;
        control.lookY -= delta * tiltSpeed * 0.68;
      }
      if (keys.KeyQ) control.distance -= delta * zoomSpeed;
      if (keys.KeyE) control.distance += delta * zoomSpeed;
    }

    if (modeRef.current === 'returning') {
      control.angle = MathUtils.damp(control.angle, auto.angle, 1.15, delta);
      control.distance = MathUtils.damp(control.distance, auto.distance, 1.15, delta);
      control.elevation = MathUtils.damp(control.elevation, auto.elevation, 1.1, delta);
      control.lookY = MathUtils.damp(control.lookY, auto.lookY, 1.1, delta);
      const d =
        Math.abs(control.angle - auto.angle) +
        Math.abs(control.distance - auto.distance) +
        Math.abs(control.elevation - auto.elevation) +
        Math.abs(control.lookY - auto.lookY);
      if (d < 0.9 && !dragRef.current.dragging) modeRef.current = 'auto';
    }

    control.distance = MathUtils.clamp(control.distance, 8, Math.max(34, radius * 3 + 24));
    control.elevation = MathUtils.clamp(control.elevation, 4, Math.max(18, maxY + radius * 0.45 + 10));
    control.lookY = MathUtils.clamp(control.lookY, 0.8, Math.max(26, maxY + 8));

    actual.angle = MathUtils.damp(actual.angle, control.angle, modeRef.current === 'auto' ? 1.6 : 2.2, delta);
    actual.distance = MathUtils.damp(actual.distance, control.distance, modeRef.current === 'auto' ? 1.5 : 2.1, delta);
    actual.elevation = MathUtils.damp(actual.elevation, control.elevation, modeRef.current === 'auto' ? 1.45 : 2.0, delta);
    actual.lookY = MathUtils.damp(actual.lookY, control.lookY, modeRef.current === 'auto' ? 1.4 : 1.9, delta);

    tempDir.set(Math.sin(actual.angle), 0, Math.cos(actual.angle));
    desiredPosition.copy(tempDir).multiplyScalar(actual.distance).setY(actual.elevation);
    desiredTarget.set(0, actual.lookY, 0);

    if (smoothPosition.lengthSq() === 0 && smoothTarget.lengthSq() === 0) {
      smoothPosition.copy(desiredPosition);
      smoothTarget.copy(desiredTarget);
    }

    smoothPosition.x = MathUtils.damp(smoothPosition.x, desiredPosition.x, modeRef.current === 'auto' ? 1.8 : 2.4, delta);
    smoothPosition.y = MathUtils.damp(smoothPosition.y, desiredPosition.y, modeRef.current === 'auto' ? 1.8 : 2.4, delta);
    smoothPosition.z = MathUtils.damp(smoothPosition.z, desiredPosition.z, modeRef.current === 'auto' ? 1.8 : 2.4, delta);

    smoothTarget.y = MathUtils.damp(smoothTarget.y, desiredTarget.y, modeRef.current === 'auto' ? 1.75 : 2.2, delta);
    smoothTarget.x = 0;
    smoothTarget.z = 0;

    camera.position.copy(smoothPosition);
    camera.lookAt(smoothTarget);
  });

  return null;
}

function AnimatedHoloTower({ tower }: { tower: TowerDatum }) {
  const groupRef = useRef<Group>(null);
  const shellRef = useRef<Mesh>(null);
  const edgeRef = useRef<Mesh>(null);
  const crownRef = useRef<Mesh>(null);
  const bandRefs = useRef<Array<Mesh | null>>([]);
  const settledRef = useRef(false);

  const glowColor = useMemo(() => new Color(tower.glowColor), [tower.glowColor]);
  const coreColor = useMemo(() => new Color(tower.coreColor), [tower.coreColor]);
  const bandFractions = useMemo(() => {
    const base = [0.2, 0.42, 0.66, 0.86];
    const wobble = ((tower.sequence % 17) - 8) * 0.0025;
    return base.map((v, i) => MathUtils.clamp(v + wobble * (i + 1), 0.12, 0.92));
  }, [tower.sequence]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    if (settledRef.current) return;

    const now = Date.now();
    const elapsed = now - tower.emittedAt;
    const riseT = MathUtils.clamp(elapsed / BIRTH_RISE_MS, 0, 1);
    const riseScaleY = Math.max(0.0001, easeOutBack(riseT, BIRTH_OVERSHOOT));
    group.scale.y = riseScaleY;

    const glowT = MathUtils.clamp((elapsed - BIRTH_GLOW_DELAY_MS) / BIRTH_GLOW_RAMP_MS, 0, 1);
    const glowAlpha = easeOutCubic(glowT);

    const shellMat = shellRef.current?.material as { opacity?: number } | undefined;
    const edgeMat = edgeRef.current?.material as { opacity?: number } | undefined;
    const crownMat = crownRef.current?.material as { opacity?: number } | undefined;

    if (shellMat) shellMat.opacity = GLOW_SHELL_OPACITY * tower.glowStrength * glowAlpha;
    if (edgeMat) edgeMat.opacity = MathUtils.clamp(GLOW_EDGE_OPACITY * tower.glowStrength * glowAlpha, 0, 1);
    if (crownMat) crownMat.opacity = MathUtils.clamp(CROWN_OPACITY * tower.glowStrength * glowAlpha, 0, 1);

    for (let i = 0; i < bandRefs.current.length; i++) {
      const band = bandRefs.current[i];
      if (!band) continue;
      band.visible = i < tower.bandCount;
      const mat = band.material as { opacity?: number } | undefined;
      if (mat) {
        const localFade = 0.9 - i * 0.08;
        mat.opacity = MathUtils.clamp(BAND_OPACITY * tower.glowStrength * glowAlpha * localFade, 0, 1);
      }
    }

    if (riseT >= 1 && glowT >= 1) {
      group.scale.y = 1;
      settledRef.current = true;
    }
  });

  return (
    <group ref={groupRef} position={[tower.x, 0, tower.z]} scale={[1, 0.0001, 1]}>
      <mesh position={[0, tower.height * 0.5, 0]} castShadow={RUNTIME_QUALITY_CONFIG.shadows} receiveShadow={RUNTIME_QUALITY_CONFIG.shadows}>
        <boxGeometry args={[TOWER_FOOTPRINT, tower.height, TOWER_FOOTPRINT]} />
        <meshStandardMaterial
          color={coreColor}
          roughness={0.38}
          metalness={0.16}
          emissive={coreColor}
          emissiveIntensity={0.045}
        />
      </mesh>

      <mesh ref={shellRef} position={[0, tower.height * 0.5, 0]} scale={[GLOW_SHELL_SCALE, 1.002, GLOW_SHELL_SCALE]}>
        <boxGeometry args={[TOWER_FOOTPRINT, tower.height, TOWER_FOOTPRINT]} />
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>

      <mesh ref={edgeRef} position={[0, tower.height * 0.5, 0]} scale={[GLOW_EDGE_SCALE, 1.006, GLOW_EDGE_SCALE]}>
        <boxGeometry args={[TOWER_FOOTPRINT, tower.height, TOWER_FOOTPRINT]} />
        <meshBasicMaterial
          color={glowColor}
          wireframe
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>

      {bandFractions.map((f, i) => (
        <mesh
          key={`${tower.sequence}-band-${i}`}
          ref={(el) => {
            bandRefs.current[i] = el;
          }}
          position={[0, tower.height * f, 0]}
          visible={i < tower.bandCount}
        >
          <boxGeometry args={[TOWER_FOOTPRINT * 1.06, 0.05, TOWER_FOOTPRINT * 1.06]} />
          <meshBasicMaterial
            color={glowColor}
            transparent
            opacity={0}
            toneMapped={false}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      ))}

      <mesh ref={crownRef} position={[0, tower.height + 0.08, 0]}>
        <boxGeometry args={[TOWER_FOOTPRINT * 0.86, 0.09, TOWER_FOOTPRINT * 0.86]} />
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

function SandboxScene({ towers, bounds }: { towers: TowerDatum[]; bounds: SandboxBounds }) {
  return (
    <Canvas
      camera={{ position: [20, 12, 20], fov: 50, near: 0.1, far: 500 }}
      dpr={[1, RUNTIME_QUALITY_CONFIG.dprCap]}
      gl={{ antialias: RUNTIME_QUALITY_CONFIG.antialias, alpha: false, powerPreference: 'high-performance' }}
      onCreated={({ scene, gl }) => {
        scene.background = new Color('#06080c');
        scene.fog = null;
        gl.outputColorSpace = SRGBColorSpace;
        gl.toneMapping = ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.02;
        gl.setClearColor('#06080c', 1);
      }}
    >
      <color attach="background" args={['#06080c']} />
      <ambientLight intensity={0.32} color="#9bb8d6" />
      <hemisphereLight args={['#9cc4ee', '#090b10', 0.34]} />
      <directionalLight position={[10, 18, 8]} intensity={0.72} color="#d6e8ff" castShadow={RUNTIME_QUALITY_CONFIG.shadows} />
      <directionalLight position={[-14, 20, -10]} intensity={0.34} color="#7fd3ff" />
      <MinimalOrbitRig bounds={bounds} />

      <group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
          <planeGeometry args={[400, 400]} />
          <meshStandardMaterial color="#070a0f" roughness={0.98} metalness={0.02} />
        </mesh>
        <gridHelper args={[360, 72, new Color('#1f3448'), new Color('#111a24')]} position={[0, -0.02, 0]} material-transparent material-opacity={0.26} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.018, 0]}>
          <ringGeometry args={[2.5, 3.2, 48]} />
          <meshBasicMaterial color="#2f7cb3" transparent opacity={0.2} toneMapped={false} />
        </mesh>
      </group>

      <group>
        {towers.map((tower) => (
          <AnimatedHoloTower key={tower.sequence} tower={tower} />
        ))}
      </group>
    </Canvas>
  );
}

export function MinimalVizSandbox() {
  const { events, latest } = useBlockEventStore();
  const { towers, bounds } = useAppendOnlyTowers(events);

  const overlay = useMemo(
    () => ({
      feedMode: latest?.feedMode ?? 'auto',
      latestSequence: latest?.sequence ?? 0,
      towerCount: towers.length
    }),
    [latest, towers.length]
  );

  return (
    <div className="minimal-viz">
      <SandboxScene towers={towers} bounds={bounds} />
      <div className="minimal-viz__overlay" aria-hidden="true">
        <div className="minimal-viz__panel">
          <div className="minimal-viz__title">Sandbox</div>
          <div className="minimal-viz__row">
            <span>Feed</span>
            <span>{overlay.feedMode}</span>
          </div>
          <div className="minimal-viz__row">
            <span>Latest Seq</span>
            <span>{overlay.latestSequence}</span>
          </div>
          <div className="minimal-viz__row">
            <span>Towers</span>
            <span>{overlay.towerCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
