import { useEffect } from 'react';
import { publishBlockEvent } from '../data/trades/blockEventStore';
import { BtcSpotCityDataEngine } from '../data/trades/BtcSpotCityDataEngine';

export function useBtcSpotCityDataEngine() {
  useEffect(() => {
    const engine = new BtcSpotCityDataEngine({
      windowMs: 3000,
      logWindows: true
    });

    const unsubscribe = engine.subscribe((event) => {
      publishBlockEvent(event);
    });

    engine.start();

    return () => {
      unsubscribe();
      engine.stop();
    };
  }, []);
}
