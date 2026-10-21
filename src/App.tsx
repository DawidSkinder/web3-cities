import { BtcSpotCityScene, preloadCity } from './scene/BtcSpotCityScene';
import { getCryptoCityPreset } from './data/cryptoCity/presets';
import { useCryptoSpotCityDataEngine } from './hooks/useCryptoSpotCityDataEngine';
import { useTopCoinsSkylineEngine } from './hooks/useTopCoinsSkylineEngine';
import type { CryptoCityMode } from './lib/cityMode';
import { isCryptoCityMode, resolveCityMode, writeCityModeToUrl } from './lib/cityMode';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function App() {
  const [mode, setMode] = useState(() => resolveCityMode());
  const [cryptoSelection, setCryptoSelection] = useState<CryptoCityMode>(() => {
    const initialMode = resolveCityMode();
    return isCryptoCityMode(initialMode) ? initialMode : 'btc';
  });
  const activeCryptoMode = isCryptoCityMode(mode) ? mode : cryptoSelection;
  const cryptoPreset = getCryptoCityPreset(activeCryptoMode);

  const modeRequestRef = useRef(0);

  useEffect(() => {
    const onPopState = () => {
      modeRequestRef.current++;
      const nextMode = resolveCityMode();
      setMode(nextMode);
      if (isCryptoCityMode(nextMode)) {
        setCryptoSelection(nextMode);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      modeRequestRef.current++;
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  const changeMode = useCallback(async (nextMode: typeof mode) => {
    const request = ++modeRequestRef.current;
    if (nextMode === mode) return;
    await preloadCity(nextMode);
    if (request !== modeRequestRef.current) return;
    setMode(nextMode);
    if (isCryptoCityMode(nextMode)) setCryptoSelection(nextMode);
    writeCityModeToUrl(nextMode);
  }, [mode]);

  useCryptoSpotCityDataEngine({ enabled: isCryptoCityMode(mode), preset: cryptoPreset });
  useTopCoinsSkylineEngine({ enabled: mode === 'top200' });

  return (
    <BtcSpotCityScene
      mode={mode}
      cryptoSelection={cryptoSelection}
      onModeChange={changeMode}
    />
  );
}
