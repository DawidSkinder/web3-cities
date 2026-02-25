import { useSyncExternalStore } from 'react';

export type CityBounds = {
  centerX: number;
  centerZ: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
  radius: number;
  frontierX: number;
  frontierZ: number;
  frontierSeq: number;
};

export type HoverInfo = {
  buildingId: string;
  districtId: string;
  sequence: number;
  tier: 'podium' | 'shaft' | 'spire';
  height: number;
  totalHeight: number;
  buyVolume: number;
  sellVolume: number;
  intensity: number;
  tradeCount: number;
  dominance: number;
  timestamp: number;
  source: string;
};

export type TowerHoverMeta = HoverInfo & {
  instanceId: number;
};

type SceneSnapshot = {
  bounds: CityBounds | null;
  towerHoverMeta: TowerHoverMeta[];
  hoveredInstanceId: number | null;
  hoveredBuildingId: string | null;
  hoveredInfo: HoverInfo | null;
};

type Listener = () => void;

class CitySceneStore {
  private listeners = new Set<Listener>();
  private snapshot: SceneSnapshot = {
    bounds: null,
    towerHoverMeta: [],
    hoveredInstanceId: null,
    hoveredBuildingId: null,
    hoveredInfo: null
  };

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  publishSceneData(bounds: CityBounds | null, towerHoverMeta: TowerHoverMeta[]) {
    const hoveredInfo =
      this.snapshot.hoveredInstanceId !== null
        ? towerHoverMeta[this.snapshot.hoveredInstanceId] ?? null
        : null;

    const nextSnapshot: SceneSnapshot = {
      ...this.snapshot,
      bounds,
      towerHoverMeta,
      hoveredInfo: hoveredInfo ? stripInstanceId(hoveredInfo) : null,
      hoveredBuildingId: hoveredInfo?.buildingId ?? null
    };

    this.snapshot = nextSnapshot;
    this.emit();
  }

  setHoveredInstance(instanceId: number | null) {
    if (this.snapshot.hoveredInstanceId === instanceId) {
      return;
    }

    const meta =
      instanceId !== null && instanceId >= 0
        ? this.snapshot.towerHoverMeta[instanceId] ?? null
        : null;

    this.snapshot = {
      ...this.snapshot,
      hoveredInstanceId: meta ? instanceId : null,
      hoveredBuildingId: meta?.buildingId ?? null,
      hoveredInfo: meta ? stripInstanceId(meta) : null
    };
    this.emit();
  }

  clearHover() {
    if (this.snapshot.hoveredInstanceId === null && this.snapshot.hoveredInfo === null) {
      return;
    }

    this.snapshot = {
      ...this.snapshot,
      hoveredInstanceId: null,
      hoveredBuildingId: null,
      hoveredInfo: null
    };
    this.emit();
  }

  clearAll() {
    this.snapshot = {
      bounds: null,
      towerHoverMeta: [],
      hoveredInstanceId: null,
      hoveredBuildingId: null,
      hoveredInfo: null
    };
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function stripInstanceId(meta: TowerHoverMeta): HoverInfo {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { instanceId, ...info } = meta;
  return info;
}

const store = new CitySceneStore();

export function publishCitySceneData(bounds: CityBounds | null, towerHoverMeta: TowerHoverMeta[]) {
  store.publishSceneData(bounds, towerHoverMeta);
}

export function setHoveredTowerInstance(instanceId: number | null) {
  store.setHoveredInstance(instanceId);
}

export function clearHoveredTowerInstance() {
  store.clearHover();
}

export function clearCitySceneStore() {
  store.clearAll();
}

export function useCitySceneStore() {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
