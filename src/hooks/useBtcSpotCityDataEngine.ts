import { useEffect } from 'react';
import { BtcSpotCityDataEngine } from '../data/trades/BtcSpotCityDataEngine';

export function useBtcSpotCityDataEngine() {
  useEffect(() => {
    const engine = new BtcSpotCityDataEngine({
      windowMs: 3000,
      logWindows: true
    });

    const unsubscribe = engine.subscribe(() => {
      // Placeholder subscription hook for future scene-driven procedural systems.
    });

    engine.start();

    return () => {
      unsubscribe();
      engine.stop();
    };
  }, []);
}

