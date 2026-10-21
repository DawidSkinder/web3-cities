/** A frame-updated overlay owns its subscription, so its motion never rerenders the city. */
export function createFrameStore<T>(initial: T) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set: (next: T) => {
      if (Object.is(snapshot, next)) return;
      snapshot = next;
      for (const listener of listeners) listener();
    }
  };
}
