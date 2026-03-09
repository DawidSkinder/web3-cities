import { useEffect } from 'react';
import type { CryptoCityPreset } from '../data/cryptoCity/presets';
import { clearBlockEventStore, publishBlockEvent } from '../data/trades/blockEventStore';
import { CryptoSpotCityDataEngine } from '../data/trades/CryptoSpotCityDataEngine';

export function useCryptoSpotCityDataEngine(options: { enabled: boolean; preset: CryptoCityPreset }) {
  const { enabled, preset } = options;

  useEffect(() => {
    if (!enabled) {
      clearBlockEventStore();
      return;
    }

    clearBlockEventStore();

    const engine = new CryptoSpotCityDataEngine({
      preset,
      windowMs: preset.engine.windowMs,
      graceMs: preset.engine.graceMs,
      logWindows: true
    });

    const unsubscribe = engine.subscribe((event) => {
      publishBlockEvent(event);
    });

    engine.start();

    return () => {
      unsubscribe();
      engine.stop();
      clearBlockEventStore();
    };
  }, [enabled, preset]);
}
