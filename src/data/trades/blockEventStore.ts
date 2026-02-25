import { useSyncExternalStore } from 'react';
import type { BlockEvent } from './types';

type Listener = () => void;

type BlockEventStoreSnapshot = {
  events: BlockEvent[];
  latest: BlockEvent | null;
};

const MAX_STORE_EVENTS = 180;

class BlockEventStore {
  private events: BlockEvent[] = [];
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): BlockEventStoreSnapshot => ({
    events: this.events,
    latest: this.events[this.events.length - 1] ?? null
  });

  publish(event: BlockEvent) {
    this.events = [...this.events, event];
    if (this.events.length > MAX_STORE_EVENTS) {
      this.events = this.events.slice(this.events.length - MAX_STORE_EVENTS);
    }

    for (const listener of this.listeners) {
      listener();
    }
  }

  clear() {
    this.events = [];
    for (const listener of this.listeners) {
      listener();
    }
  }
}

const store = new BlockEventStore();

export function publishBlockEvent(event: BlockEvent) {
  store.publish(event);
}

export function clearBlockEventStore() {
  store.clear();
}

export function useBlockEventStore() {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

