import { useEffect } from 'react';
import type { CryptoCityPreset } from '../data/cryptoCity/presets';
import { clearBlockEventStore, publishBlockEvent } from '../data/trades/blockEventStore';
import type { CryptoSpotCityDataEngine } from '../data/trades/CryptoSpotCityDataEngine';

export function useCryptoSpotCityDataEngine(options: { enabled: boolean; preset: CryptoCityPreset }) {
  const { enabled, preset } = options;

  useEffect(() => {
    if (!enabled) {
      clearBlockEventStore();
      return;
    }

    clearBlockEventStore();

    let disposed = false;
    let engine: CryptoSpotCityDataEngine | undefined;
    let unsubscribe: (() => void) | undefined;
    void import('../data/trades/CryptoSpotCityDataEngine').then((module) => {
      if (disposed) return;
      const { CryptoSpotCityDataEngine } = module;
      engine = new CryptoSpotCityDataEngine({
        preset,
        windowMs: preset.engine.windowMs,
        graceMs: preset.engine.graceMs,
        logWindows: import.meta.env.DEV
      });

      unsubscribe = engine.subscribe((event) => {
        publishBlockEvent(event);
      });

      engine.start();
    });

    return () => {
      disposed = true;
      unsubscribe?.();
      engine?.stop();
      clearBlockEventStore();
    };
  }, [enabled, preset]);
}
