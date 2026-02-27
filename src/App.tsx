import { BtcSpotCityScene } from './scene/BtcSpotCityScene';
import { useBtcSpotCityDataEngine } from './hooks/useBtcSpotCityDataEngine';
import { useTopCoinsSkylineEngine } from './hooks/useTopCoinsSkylineEngine';
import { resolveCityMode, writeCityModeToUrl } from './lib/cityMode';
import { useCallback, useEffect, useState } from 'react';

export default function App() {
  const [mode, setMode] = useState(() => resolveCityMode());
  const handleProxyUnavailable = useCallback(() => {
    setMode((prevMode) => {
      if (prevMode === 'btc') return prevMode;
      writeCityModeToUrl('btc');
      return 'btc';
    });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setMode(resolveCityMode());
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  useBtcSpotCityDataEngine({ enabled: mode === 'btc' });
  useTopCoinsSkylineEngine({
    enabled: mode === 'top200',
    onProxyUnavailable: handleProxyUnavailable
  });

  return (
    <BtcSpotCityScene
      mode={mode}
      onModeChange={(nextMode) => {
        if (nextMode === mode) return;
        setMode(nextMode);
        writeCityModeToUrl(nextMode);
      }}
    />
  );
}
