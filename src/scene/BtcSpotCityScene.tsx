import { lazy, Suspense } from 'react';
import { getCryptoCityPreset } from '../data/cryptoCity/presets';
import type { CryptoCityMode, CityMode } from '../lib/cityMode';
import { isCryptoCityMode } from '../lib/cityMode';
import { Web3CitiesUi } from '../ui/Web3CitiesUi';
import { deriveBtcCityMetrics, deriveMarketCityMetrics } from '../ui/cityMetrics';

const loadCrypto = () => import('./BtcSpotBuysSandbox');
const loadMarket = () => import('./TopCoinsSkylineSandbox');
const CryptoCity = lazy(() => loadCrypto().then((module) => ({ default: module.BtcSpotBuysSandbox })));
const MarketCity = lazy(() => loadMarket().then((module) => ({ default: module.TopCoinsSkylineSandbox })));

export async function preloadCity(mode: CityMode) {
  await (isCryptoCityMode(mode) ? loadCrypto() : loadMarket());
}

export function BtcSpotCityScene({ mode, cryptoSelection, onModeChange }: {
  mode: CityMode;
  cryptoSelection: CryptoCityMode;
  onModeChange?: (nextMode: CityMode) => void;
}) {
  const preset = getCryptoCityPreset(isCryptoCityMode(mode) ? mode : cryptoSelection);
  return (
    <Suspense fallback={
      <Web3CitiesUi mode={mode} cryptoSelection={cryptoSelection} onModeChange={onModeChange}
        metricPanel={isCryptoCityMode(mode) ? deriveBtcCityMetrics({ towers: [], events: [], preset }) : deriveMarketCityMetrics(null)}
        cinematicFlyoverEnabled={false} />
    }>
      {isCryptoCityMode(mode)
        ? <CryptoCity mode={mode} preset={preset} cryptoSelection={cryptoSelection} onModeChange={onModeChange} />
        : <MarketCity cryptoSelection={cryptoSelection} onModeChange={onModeChange} />}
    </Suspense>
  );
}
