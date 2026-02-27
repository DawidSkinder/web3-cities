import { useEffect } from 'react';
import { clearTopCoinsStore, publishTopCoinsSnapshot } from '../data/topCoins/topCoinsStore';
import { TopCoinsDataEngine } from '../data/topCoins/TopCoinsDataEngine';

export function useTopCoinsSkylineEngine(options: {
  enabled: boolean;
  onProxyUnavailable?: () => void;
}) {
  const { enabled, onProxyUnavailable } = options;

  useEffect(() => {
    if (!enabled) {
      clearTopCoinsStore();
      return;
    }

    clearTopCoinsStore();

    const engine = new TopCoinsDataEngine({
      pollMs: Number(import.meta.env.VITE_TOP_COINS_POLL_MS ?? 60_000),
      limit: Number(import.meta.env.VITE_TOP_COINS_LIMIT ?? 200),
      quote: String(import.meta.env.VITE_TOP_COINS_QUOTE ?? 'USDT')
    });

    const unsubscribe = engine.subscribe((snapshot) => {
      publishTopCoinsSnapshot(snapshot);
    });
    const unsubscribeFatal = engine.onFatal(() => {
      onProxyUnavailable?.();
    });

    engine.start();

    return () => {
      unsubscribe();
      unsubscribeFatal();
      engine.stop();
      clearTopCoinsStore();
    };
  }, [enabled, onProxyUnavailable]);
}
