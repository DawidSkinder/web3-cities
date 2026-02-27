import { useSyncExternalStore } from 'react';
import type { TopCoinsSnapshot } from './types';

type Listener = () => void;

type TopCoinsStoreSnapshot = {
  latest: TopCoinsSnapshot | null;
  previous: TopCoinsSnapshot | null;
};

class TopCoinsStore {
  private latest: TopCoinsSnapshot | null = null;
  private previous: TopCoinsSnapshot | null = null;
  private listeners = new Set<Listener>();
  private snapshot: TopCoinsStoreSnapshot = {
    latest: null,
    previous: null
  };

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): TopCoinsStoreSnapshot => this.snapshot;

  publish(snapshot: TopCoinsSnapshot) {
    this.previous = this.latest;
    this.latest = snapshot;
    this.snapshot = {
      latest: this.latest,
      previous: this.previous
    };
    for (const listener of this.listeners) {
      listener();
    }
  }

  clear() {
    this.latest = null;
    this.previous = null;
    this.snapshot = {
      latest: null,
      previous: null
    };
    for (const listener of this.listeners) {
      listener();
    }
  }
}

const store = new TopCoinsStore();

export function publishTopCoinsSnapshot(snapshot: TopCoinsSnapshot) {
  store.publish(snapshot);
}

export function clearTopCoinsStore() {
  store.clear();
}

export function useTopCoinsStore() {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
