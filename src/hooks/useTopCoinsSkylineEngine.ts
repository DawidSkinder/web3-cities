import { useEffect } from 'react';
import { clearTopCoinsStore, publishTopCoinsSnapshot } from '../data/topCoins/topCoinsStore';
import { TopCoinsDataEngine } from '../data/topCoins/TopCoinsDataEngine';

export function useTopCoinsSkylineEngine(options: { enabled: boolean }) {
  const { enabled } = options;

  useEffect(() => {
    if (!enabled) {
      clearTopCoinsStore();
      return;
    }

    clearTopCoinsStore();

    const engine = new TopCoinsDataEngine({
      pollMs: Number(import.meta.env.VITE_TOP_COINS_POLL_MS ?? 60_000),
      limit: Number(import.meta.env.VITE_TOP_COINS_LIMIT ?? 150)
    });

    const unsubscribe = engine.subscribe((snapshot) => {
      publishTopCoinsSnapshot(snapshot);
    });

    engine.start();

    return () => {
      unsubscribe();
      engine.stop();
      clearTopCoinsStore();
    };
  }, [enabled]);
}
