import { BtcSpotCityScene } from './scene/BtcSpotCityScene';
import { getCryptoCityPreset } from './data/cryptoCity/presets';
import { useCryptoSpotCityDataEngine } from './hooks/useCryptoSpotCityDataEngine';
import { useTopCoinsSkylineEngine } from './hooks/useTopCoinsSkylineEngine';
import type { CryptoCityMode } from './lib/cityMode';
import { isCryptoCityMode, resolveCityMode, writeCityModeToUrl } from './lib/cityMode';
import { useEffect, useState } from 'react';

export default function App() {
  const [mode, setMode] = useState(() => resolveCityMode());
  const [cryptoSelection, setCryptoSelection] = useState<CryptoCityMode>(() => {
    const initialMode = resolveCityMode();
    return isCryptoCityMode(initialMode) ? initialMode : 'btc';
  });
  const activeCryptoMode = isCryptoCityMode(mode) ? mode : cryptoSelection;
  const cryptoPreset = getCryptoCityPreset(activeCryptoMode);

  useEffect(() => {
    const onPopState = () => {
      const nextMode = resolveCityMode();
      setMode(nextMode);
      if (isCryptoCityMode(nextMode)) {
        setCryptoSelection(nextMode);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  useCryptoSpotCityDataEngine({ enabled: isCryptoCityMode(mode), preset: cryptoPreset });
  useTopCoinsSkylineEngine({ enabled: mode === 'top200' });

  return (
    <BtcSpotCityScene
      mode={mode}
      cryptoSelection={cryptoSelection}
      onModeChange={(nextMode) => {
        if (nextMode === mode) return;
        setMode(nextMode);
        if (isCryptoCityMode(nextMode)) {
          setCryptoSelection(nextMode);
        }
        writeCityModeToUrl(nextMode);
      }}
    />
  );
}
