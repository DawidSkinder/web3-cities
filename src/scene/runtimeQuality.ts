export type QualityMode = 'auto' | 'low' | 'medium' | 'high';
export type QualityTier = 'low' | 'medium' | 'high';

export type RuntimeQualityConfig = {
  mode: QualityMode;
  tier: QualityTier;
  reducedMotion: boolean;
  dprCap: number;
  antialias: boolean;
  shadows: boolean;
  fogDensityScale: number;
  hazeOpacityScale: number;
  hazeBandCount: 2 | 3;
  hazeMotionScale: number;
  cameraOrbitSpeedScale: number;
  cameraDriftScale: number;
  pointerParallaxScale: number;
  ambientMotionDensityScale: number;
  pulseMotionScale: number;
  glowIntensityScale: number;
  detailDensityScale: number;
  districtDensityScale: number;
  historyCap: number;
  birthDurationScale: number;
};

function getParam(name: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return new URLSearchParams(window.location.search).get(name);
}

function parseBooleanParam(name: string): boolean | null {
  const raw = getParam(name);
  if (raw == null) {
    return null;
  }
  const value = raw.toLowerCase();
  if (value === '1' || value === 'true' || value === 'yes') return true;
  if (value === '0' || value === 'false' || value === 'no') return false;
  return null;
}

function parseQualityMode(): QualityMode {
  const raw = getParam('quality')?.toLowerCase();
  if (raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'auto') {
    return raw;
  }
  return 'auto';
}

function detectReducedMotion(): boolean {
  const override = parseBooleanParam('reducedMotion');
  if (override !== null) {
    return override;
  }
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function detectAutoTier(reducedMotion: boolean): QualityTier {
  if (typeof window === 'undefined') {
    return 'medium';
  }

  const nav = navigator as Navigator & { deviceMemory?: number };
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cores = Math.max(1, nav.hardwareConcurrency || 4);
  const memory = Math.max(1, nav.deviceMemory || 4);
  const px = Math.max(1, window.innerWidth * window.innerHeight);
  const megapixels = (px * dpr * dpr) / 1_000_000;

  let score = 0;
  if (cores >= 8) score += 2;
  else if (cores >= 4) score += 1;
  else score -= 1;

  if (memory >= 8) score += 2;
  else if (memory >= 4) score += 1;
  else score -= 1;

  if (megapixels > 10) score -= 2;
  else if (megapixels > 6) score -= 1;
  else if (megapixels < 3.2) score += 1;

  if (dpr > 2.4) score -= 1;
  if (reducedMotion) score -= 1;

  if (score >= 3) return 'high';
  if (score >= 0) return 'medium';
  return 'low';
}

function resolveConfig(mode: QualityMode, reducedMotion: boolean): RuntimeQualityConfig {
  const tier = mode === 'auto' ? detectAutoTier(reducedMotion) : mode;

  const baseByTier: Record<QualityTier, Omit<RuntimeQualityConfig, 'mode' | 'tier' | 'reducedMotion'>> = {
    low: {
      dprCap: 1.1,
      antialias: false,
      shadows: false,
      fogDensityScale: 1.08,
      hazeOpacityScale: 0.78,
      hazeBandCount: 2,
      hazeMotionScale: 0.55,
      cameraOrbitSpeedScale: 0.95,
      cameraDriftScale: 0.72,
      pointerParallaxScale: 0.8,
      ambientMotionDensityScale: 0.55,
      pulseMotionScale: 0.65,
      glowIntensityScale: 0.78,
      detailDensityScale: 0.58,
      districtDensityScale: 0.78,
      historyCap: 28,
      birthDurationScale: 0.92
    },
    medium: {
      dprCap: 1.5,
      antialias: true,
      shadows: true,
      fogDensityScale: 1,
      hazeOpacityScale: 0.92,
      hazeBandCount: 3,
      hazeMotionScale: 0.82,
      cameraOrbitSpeedScale: 1,
      cameraDriftScale: 0.9,
      pointerParallaxScale: 0.92,
      ambientMotionDensityScale: 0.82,
      pulseMotionScale: 0.88,
      glowIntensityScale: 0.92,
      detailDensityScale: 0.8,
      districtDensityScale: 0.9,
      historyCap: 36,
      birthDurationScale: 0.98
    },
    high: {
      dprCap: 2,
      antialias: true,
      shadows: true,
      fogDensityScale: 0.96,
      hazeOpacityScale: 1,
      hazeBandCount: 3,
      hazeMotionScale: 1,
      cameraOrbitSpeedScale: 1,
      cameraDriftScale: 1,
      pointerParallaxScale: 1,
      ambientMotionDensityScale: 1,
      pulseMotionScale: 1,
      glowIntensityScale: 1,
      detailDensityScale: 1,
      districtDensityScale: 1,
      historyCap: 42,
      birthDurationScale: 1
    }
  };

  const base = baseByTier[tier];
  const reduced = reducedMotion
    ? {
        hazeMotionScale: base.hazeMotionScale * 0.35,
        cameraOrbitSpeedScale: base.cameraOrbitSpeedScale * 0.45,
        cameraDriftScale: base.cameraDriftScale * 0.32,
        pointerParallaxScale: base.pointerParallaxScale * 0.65,
        ambientMotionDensityScale: base.ambientMotionDensityScale * 0.5,
        pulseMotionScale: base.pulseMotionScale * 0.35,
        birthDurationScale: base.birthDurationScale * 0.75
      }
    : null;

  return {
    mode,
    tier,
    reducedMotion,
    ...base,
    ...(reduced ?? {})
  };
}

const mode = parseQualityMode();
const reducedMotion = detectReducedMotion();

export const RUNTIME_QUALITY_CONFIG = resolveConfig(mode, reducedMotion);
export const QUALITY_MODE = RUNTIME_QUALITY_CONFIG.mode;
export const QUALITY_TIER = RUNTIME_QUALITY_CONFIG.tier;
export const REDUCED_MOTION_ENABLED = RUNTIME_QUALITY_CONFIG.reducedMotion;
