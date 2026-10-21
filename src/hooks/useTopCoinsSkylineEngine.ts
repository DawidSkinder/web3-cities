import { useEffect } from 'react';
import { publishTopCoinsSnapshot } from '../data/topCoins/topCoinsStore';
import type { TopCoinsDataEngine } from '../data/topCoins/TopCoinsDataEngine';

export function useTopCoinsSkylineEngine(options: { enabled: boolean }) {
  const { enabled } = options;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let disposed = false;
    let engine: TopCoinsDataEngine | undefined;
    let unsubscribe: (() => void) | undefined;
    void import('../data/topCoins/TopCoinsDataEngine').then((module) => {
      if (disposed) return;
      const { TopCoinsDataEngine } = module;
      engine = new TopCoinsDataEngine({
        pollMs: Number(import.meta.env.VITE_TOP_COINS_POLL_MS ?? 60_000),
        limit: Number(import.meta.env.VITE_TOP_COINS_LIMIT ?? 150)
      });

      unsubscribe = engine.subscribe((snapshot) => {
        publishTopCoinsSnapshot(snapshot);
      });

      engine.start();
    });

    return () => {
      disposed = true;
      unsubscribe?.();
      engine?.stop();
    };
  }, [enabled]);
}
